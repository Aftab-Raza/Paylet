import { Router } from "express";
import type { Request } from "express";
import argon2 from "argon2";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { sessionCookieOptions } from "../lib/session.js";
import { Prisma } from "../generated/prisma/client.js";

export const authRouter = Router();

const publicUserFields = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  defaultCurrency: true,
  timezone: true,
} as const;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many attempts. Please try again in 15 minutes.",
  },
});

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);

const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(30)
    .regex(
      /^[a-z0-9_]+$/,
      "Username can contain letters, numbers, and underscores."
    ),
  email: emailSchema,
  password: z.string().min(12).max(128),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

// Use a real password hash even when the account does not exist.
const dummyHash = argon2.hash(
  "unused-password-for-login-timing",
  { type: argon2.argon2id }
);

async function startSession(req: Request, userId: string) {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  req.session.userId = userId;

  await new Promise<void>((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

authRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

authRouter.post("/register", authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Invalid details.",
    });
    return;
  }

  const { displayName, username, email, password } = parsed.data;

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
  });

  try {
    const user = await prisma.user.create({
      data: {
        displayName,
        username,
        email,
        passwordHash,
      },
      select: publicUserFields,
    });

    await startSession(req, user.id);

    res.status(201).json({
      message: "Account created.",
      user,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      res.status(409).json({
        message: "Email or username is already in use.",
      });
      return;
    }

    throw error;
  }
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      message: "Enter a valid email and password.",
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  const validPassword = await argon2.verify(
    user?.passwordHash ?? (await dummyHash),
    parsed.data.password
  );

  if (!user || !user.passwordHash || !validPassword) {
    res.status(401).json({
      message: "Invalid email or password.",
    });
    return;
  }

  await startSession(req, user.id);

  const publicUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: publicUserFields,
  });

  res.json({
    message: "Logged in.",
    user: publicUser,
  });
});

authRouter.get("/me", async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ message: "Please log in." });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
    select: publicUserFields,
  });

  if (!user) {
    res.status(401).json({ message: "Please log in again." });
    return;
  }

  res.json({ user });
});

authRouter.post("/logout", async (req, res) => {
  await new Promise<void>((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  res.clearCookie("paylet.sid", sessionCookieOptions);
  res.json({ message: "Logged out." });
});