import "dotenv/config";
import { randomBytes } from "node:crypto";
import { Router } from "express";
import type { Request } from "express";
import argon2 from "argon2";
import { rateLimit } from "express-rate-limit";
import {
  OAuth2Client,
  CodeChallengeMethod,
} from "google-auth-library";
import { prisma } from "../lib/prisma.js";

export const googleRouter = Router();

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_REDIRECT_URI;
const appOrigin = process.env.APP_ORIGIN;

if (!clientId || !clientSecret || !redirectUri || !appOrigin) {
  throw new Error("Google OAuth settings are missing from backend/.env");
}

const googleClient = new OAuth2Client(
  clientId,
  clientSecret,
  redirectUri
);

const googleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many attempts. Please try again later.",
  },
});

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function createLoginSession(req: Request, userId: string) {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  req.session.userId = userId;
  await saveSession(req);
}

function resultUrl(code: string) {
  const url = new URL("/", appOrigin);
  url.searchParams.set("google", code);
  return url.toString();
}

async function createGoogleUrl(req: Request, linkUserId?: string) {
  const state = randomBytes(32).toString("hex");
  const nonce = randomBytes(32).toString("hex");

  const { codeVerifier, codeChallenge } =
    await googleClient.generateCodeVerifierAsync();

  req.session.googleOAuth = {
    state,
    nonce,
    codeVerifier,
    expiresAt: Date.now() + 10 * 60 * 1000,
    linkUserId,
  };

  await saveSession(req);

  return googleClient.generateAuthUrl({
    scope: ["openid", "email", "profile"],
    response_type: "code",
    access_type: "online",
    prompt: "select_account",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });
}

// Start normal Google sign-in.
googleRouter.get("/google", googleLimiter, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.session.userId) {
    res.redirect(appOrigin);
    return;
  }

  const url = await createGoogleUrl(req);
  res.redirect(url);
});

// Link Google to an existing email/password account.
// Re-entering the password confirms ownership before linking.
googleRouter.post("/google/link", googleLimiter, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (!req.session.userId) {
    res.status(401).json({ message: "Please log in first." });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
  });

  if (!user) {
    res.status(401).json({ message: "Please log in again." });
    return;
  }

  if (user.googleId) {
    res.status(409).json({
      message: "Google is already connected to this account.",
    });
    return;
  }

  const password = req.body?.password;

  if (
    typeof password !== "string" ||
    password.length < 1 ||
    password.length > 128 ||
    !user.passwordHash
  ) {
    res.status(400).json({
      message: "Enter your current Paylet password.",
    });
    return;
  }

  const valid = await argon2.verify(user.passwordHash, password);

  if (!valid) {
    res.status(401).json({ message: "Incorrect password." });
    return;
  }

  const url = await createGoogleUrl(req, user.id);
  res.json({ url });
});

// Google redirects back here through the Vite proxy.
googleRouter.get("/google/callback", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const pending = req.session.googleOAuth;

  if (
    !pending ||
    typeof req.query.state !== "string" ||
    req.query.state !== pending.state ||
    pending.expiresAt < Date.now()
  ) {
    res.redirect(resultUrl("expired"));
    return;
  }

  // Consume the pending request before exchanging the code.
  delete req.session.googleOAuth;
  await saveSession(req);

  if (req.query.error) {
    res.redirect(resultUrl("cancelled"));
    return;
  }

  if (typeof req.query.code !== "string") {
    res.redirect(resultUrl("failed"));
    return;
  }

  try {
    const { tokens } = await googleClient.getToken({
      code: req.query.code,
      codeVerifier: pending.codeVerifier,
      redirect_uri: redirectUri,
    });

    if (!tokens.id_token) {
      res.redirect(resultUrl("failed"));
      return;
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: clientId,
    });

    const payload = ticket.getPayload();

    // Some library versions do not expose nonce in TokenPayload's type.
    const nonce = (
      payload as { nonce?: string } | undefined
    )?.nonce;

    if (
      !payload?.sub ||
      !payload.email ||
      payload.email_verified !== true ||
      nonce !== pending.nonce
    ) {
      res.redirect(resultUrl("failed"));
      return;
    }

    const email = payload.email.trim().toLowerCase();

    // Explicitly link an existing account.
    if (pending.linkUserId) {
      if (req.session.userId !== pending.linkUserId) {
        res.redirect(resultUrl("expired"));
        return;
      }

      const currentUser = await prisma.user.findUnique({
        where: { id: pending.linkUserId },
      });

      if (
        !currentUser ||
        currentUser.googleId ||
        currentUser.email !== email
      ) {
        res.redirect(resultUrl("link_mismatch"));
        return;
      }

      const googleOwner = await prisma.user.findUnique({
        where: { googleId: payload.sub },
      });

      if (googleOwner) {
        res.redirect(resultUrl("link_mismatch"));
        return;
      }

      const updated = await prisma.user.updateMany({
        where: {
          id: currentUser.id,
          googleId: null,
          email,
        },
        data: {
          googleId: payload.sub,
        },
      });

      if (updated.count !== 1) {
        res.redirect(resultUrl("link_mismatch"));
        return;
      }

      await createLoginSession(req, currentUser.id);
      res.redirect(resultUrl("linked"));
      return;
    }

    // Returning users are identified by Google's stable account ID.
    const existingGoogleUser = await prisma.user.findUnique({
      where: { googleId: payload.sub },
    });

    if (existingGoogleUser) {
      await createLoginSession(req, existingGoogleUser.id);
      res.redirect(appOrigin);
      return;
    }

    // Never automatically merge accounts solely because emails match.
    const existingEmailUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingEmailUser) {
      res.redirect(resultUrl("link_required"));
      return;
    }

    const googleOwnsEmail =
      email.endsWith("@gmail.com") || Boolean(payload.hd);

    const user = await prisma.user.create({
      data: {
        email,
        username: `user_${randomBytes(10).toString("hex")}`,
        displayName:
          payload.name?.trim().slice(0, 100) || "Paylet user",
        googleId: payload.sub,
        avatarUrl: payload.picture ?? null,
        emailVerifiedAt: googleOwnsEmail ? new Date() : null,
      },
    });

    await createLoginSession(req, user.id);
    res.redirect(appOrigin);
  } catch (error) {
    // Do not log Google tokens, authorization codes, or client secrets.
    console.error(
      "Google sign-in failed:",
      error instanceof Error ? error.name : "Unknown error"
    );

    res.redirect(resultUrl("failed"));
  }
});