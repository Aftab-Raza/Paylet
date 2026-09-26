import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.js";

export const profileRouter = Router();

const currencies = Intl.supportedValuesOf("currency");

const timezones = Array.from(
  new Set([
    "UTC",
    "Asia/Kolkata",
    ...Intl.supportedValuesOf("timeZone"),
  ])
).sort();

const profileFields = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  defaultCurrency: true,
  timezone: true,
  createdAt: true,
  googleId: true,
  passwordHash: true,
} as const;

type ProfileRecord = Prisma.UserGetPayload<{
  select: typeof profileFields;
}>;

function publicProfile(user: ProfileRecord) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    defaultCurrency: user.defaultCurrency,
    timezone: user.timezone,
    createdAt: user.createdAt,
    googleConnected: Boolean(user.googleId),
    hasPassword: Boolean(user.passwordHash),
  };
}

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(100),

  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(30)
    .regex(
      /^[a-z0-9_]+$/,
      "Use lowercase letters, numbers, and underscores."
    ),

  bio: z.string().trim().max(250),

  defaultCurrency: z
    .string()
    .refine(
      (value) => currencies.includes(value),
      "Choose a supported currency."
    ),

  timezone: z.string().max(100).refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid timezone."),
}).strict();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 0,
    parts: 1,
  },
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many photo uploads. Please try again later.",
  },
});

// Every profile endpoint requires a valid signed-in user.
profileRouter.use(async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");

  if (!req.session.userId) {
    res.status(401).json({ message: "Please log in." });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
    select: { id: true },
  });

  if (!user) {
    res.status(401).json({ message: "Please log in again." });
    return;
  }

  next();
});

profileRouter.get("/options", (_req, res) => {
  res.json({ currencies, timezones });
});

profileRouter.get("/", async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.session.userId! },
    select: profileFields,
  });

  res.json({ user: publicProfile(user) });
});

profileRouter.patch("/", async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Invalid profile.",
    });
    return;
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.session.userId! },
      data: {
        ...parsed.data,
        bio: parsed.data.bio || null,
      },
      select: profileFields,
    });

    res.json({
      message: "Profile updated.",
      user: publicProfile(user),
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      res.status(409).json({
        message: "That username is already taken.",
      });
      return;
    }

    throw error;
  }
});

profileRouter.post(
  "/avatar",
  uploadLimiter,
  (req, res, next) => {
    upload.single("avatar")(req, res, (error: unknown) => {
      if (error) {
        res.status(400).json({
          message: "Upload one JPEG, PNG, or WebP image under 5 MB.",
        });
        return;
      }

      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: "Choose a photo first." });
      return;
    }

    let thumbnail: Buffer;

    try {
      const image = sharp(req.file.buffer, {
        limitInputPixels: 16_000_000,
        animated: false,
      });

      const metadata = await image.metadata();

      if (
        !metadata.format ||
        !["jpeg", "png", "webp"].includes(metadata.format)
      ) {
        res.status(400).json({
          message: "Only JPEG, PNG, and WebP images are supported.",
        });
        return;
      }

      thumbnail = await image
        .rotate()
        .resize(256, 256, {
          fit: "cover",
          position: "centre",
        })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      res.status(400).json({
        message: "Unable to read this image. Try a smaller JPEG or PNG.",
      });
      return;
    }

    if (thumbnail.length > 100 * 1024) {
      res.status(400).json({
        message: "This photo is too complex. Please choose another image.",
      });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.session.userId! },
      data: {
        avatarUrl: `data:image/webp;base64,${thumbnail.toString("base64")}`,
      },
      select: profileFields,
    });

    res.json({
      message: "Profile photo updated.",
      user: publicProfile(user),
    });
  }
);

profileRouter.delete("/avatar", async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.session.userId! },
    data: { avatarUrl: null },
    select: profileFields,
  });

  res.json({
    message: "Profile photo removed.",
    user: publicProfile(user),
  });
});