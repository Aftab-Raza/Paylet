import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.js";

export const contactsRouter = Router();

const contactFields = {
  id: true,
  name: true,
  nickname: true,
  notes: true,
  isArchived: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  nickname: z.string().trim().max(100),
  notes: z.string().trim().max(500),
}).strict();

// Contacts belong only to the signed-in user.
contactsRouter.use(async (req, res, next) => {
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

contactsRouter.get("/", async (req, res) => {
  const contacts = await prisma.contact.findMany({
    where: {
      userId: req.session.userId!,
    },
    orderBy: [
      { isArchived: "asc" },
      { name: "asc" },
    ],
    select: contactFields,
  });

  res.json({ contacts });
});

contactsRouter.post("/", async (req, res) => {
  const parsed = contactSchema
    .extend({ id: z.string().uuid() })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      message:
        parsed.error.issues[0]?.message ?? "Invalid contact details.",
    });
    return;
  }

  try {
    const contact = await prisma.contact.create({
      data: {
        id: parsed.data.id,
        userId: req.session.userId!,
        name: parsed.data.name,
        nickname: parsed.data.nickname || null,
        notes: parsed.data.notes || null,
      },
      select: contactFields,
    });

    res.status(201).json({ contact });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      res.status(409).json({
        message:
          "This contact may already be saved. Cancel and reload to check.",
      });
      return;
    }

    throw error;
  }
});

contactsRouter.patch("/:id", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);

  const parsed = contactSchema
    .extend({ version: z.number().int().positive() })
    .safeParse(req.body);

  if (!id.success || !parsed.success) {
    res.status(400).json({
      message: "Check the contact details and try again.",
    });
    return;
  }

  try {
    const contact = await prisma.contact.update({
      where: {
        id: id.data,
        userId: req.session.userId!,
        version: parsed.data.version,
        isArchived: false,
      },
      data: {
        name: parsed.data.name,
        nickname: parsed.data.nickname || null,
        notes: parsed.data.notes || null,
        version: { increment: 1 },
      },
      select: contactFields,
    });

    res.json({ contact });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      res.status(409).json({
        message:
          "This contact changed or is unavailable. Cancel, reload, and reopen it.",
      });
      return;
    }

    throw error;
  }
});

contactsRouter.post("/:id/archive", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);

  const parsed = z.object({
    version: z.number().int().positive(),
    isArchived: z.boolean(),
  }).strict().safeParse(req.body);

  if (!id.success || !parsed.success) {
    res.status(400).json({ message: "Invalid request." });
    return;
  }

  try {
    const contact = await prisma.contact.update({
      where: {
        id: id.data,
        userId: req.session.userId!,
        version: parsed.data.version,
      },
      data: {
        isArchived: parsed.data.isArchived,
        version: { increment: 1 },
      },
      select: contactFields,
    });

    res.json({ contact });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      res.status(409).json({
        message: "This contact changed or is unavailable. Reload and try again.",
      });
      return;
    }

    throw error;
  }
});