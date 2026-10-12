import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { moneyString } from "../lib/splitMoney.js";

export const contactsRouter = Router();

const linkRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.session.userId!,
  message: { message: "Too many connection requests. Please try again later." },
});

const contactFields = {
  id: true,
  name: true,
  nickname: true,
  notes: true,
  isArchived: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  linkedUser: { select: { id: true, username: true, displayName: true } },
  linkRequest: { select: { status: true, recipient: { select: { username: true } } } },
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

contactsRouter.get("/link-requests", async (req, res) => {
  const recipientId = req.session.userId!;
  const requests = await prisma.contactLinkRequest.findMany({
    where: { recipientId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, contact: { select: {
      name: true, user: { select: { displayName: true, username: true } },
      groupMembers: { where: { userId: null, group: { deletedAt: null } }, select: { group: { select: { name: true } } } },
    } } },
  });
  res.json({ requests: requests.map((request) => ({
    id: request.id, createdAt: request.createdAt,
    name: request.contact.name, owner: request.contact.user,
    groups: request.contact.groupMembers.map((member) => member.group.name),
  })) });
});

contactsRouter.post("/link-requests/:id/respond", async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const { action } = z.object({ action: z.enum(["ACCEPT", "DECLINE"]) }).strict().parse(req.body);
  const recipientId = req.session.userId!;
  const outcome = await prisma.$transaction(async (tx) => {
    const request = await tx.contactLinkRequest.findFirst({ where: { id, recipientId, status: "PENDING" }, select: { contactId: true } });
    if (!request) return "NOT_FOUND";
    const contact = await tx.contact.findUniqueOrThrow({ where: { id: request.contactId }, select: { userId: true, linkedUserId: true } });
    if (contact.linkedUserId || contact.userId === recipientId) return "CONFLICT";
    if (action === "ACCEPT") {
      if (await tx.contact.count({ where: { userId: contact.userId, linkedUserId: recipientId } })) return "ALREADY_LINKED";
      const members = await tx.splitMember.findMany({ where: { contactId: request.contactId, userId: null }, select: { groupId: true } });
      for (const member of members) {
        await tx.splitGroup.update({ where: { id: member.groupId }, data: { updatedAt: new Date() } });
        if (await tx.splitMember.count({ where: { groupId: member.groupId, userId: recipientId } })) return "ALREADY_MEMBER";
      }
      const updated = await tx.contact.updateMany({ where: { id: request.contactId, linkedUserId: null }, data: { linkedUserId: recipientId, version: { increment: 1 } } });
      if (updated.count !== 1) return "CONFLICT";
      await tx.splitMember.updateMany({ where: { contactId: request.contactId, userId: null }, data: { userId: recipientId, joinedAt: new Date() } });
    }
    const updated = await tx.contactLinkRequest.updateMany({ where: { id, recipientId, status: "PENDING" }, data: { status: action === "ACCEPT" ? "ACCEPTED" : "DECLINED", respondedAt: new Date() } });
    return updated.count === 1 ? "OK" : "CONFLICT";
  });
  if (outcome !== "OK") { res.status(outcome === "NOT_FOUND" ? 404 : 409).json({ message: outcome === "ALREADY_MEMBER" ? "You are already in one of these groups. The duplicate membership must be resolved before linking." : outcome === "ALREADY_LINKED" ? "This account is already connected to another contact owned by this person." : "This request is no longer available." }); return; }
  res.json({ message: action === "ACCEPT" ? "Contact connected." : "Request declined." });
});

contactsRouter.get("/shared-entries", async (req, res) => {
  const recipientId = req.session.userId!;
  const shares = await prisma.contactMoneyShare.findMany({
    where: { recipientId, entry: { voidedAt: null, contact: { linkedUserId: recipientId } } },
    orderBy: { sharedAt: "desc" },
    select: { entryId: true, sharedAt: true, entry: { select: {
      direction: true, kind: true, amountMinor: true, minorUnit: true, currency: true,
      purpose: true, entryDate: true, contact: { select: { user: { select: { displayName: true, username: true } } } },
    } } },
  });
  res.json({ entries: shares.map(({ entryId, sharedAt, entry }) => ({
    id: entryId, sharedAt, owner: entry.contact.user,
    direction: entry.direction === "LENT" ? "BORROWED" : "LENT", kind: entry.kind,
    amount: moneyString(entry.amountMinor, entry.minorUnit),
    currency: entry.currency, purpose: entry.purpose, date: entry.entryDate.toISOString().slice(0, 10),
  })) });
});

contactsRouter.post("/:id/link-request", linkRequestLimiter, async (req, res) => {
  const contactId = z.string().uuid().parse(req.params.id);
  const { username } = z.object({ username: z.string().trim().transform((value) => value.replace(/^@/, "").toLowerCase()).pipe(z.string().min(3).max(30).regex(/^[a-z0-9_]+$/, "Use letters, numbers, or underscores for the username.")) }).strict().parse(req.body);
  const ownerId = req.session.userId!;
  const outcome = await prisma.$transaction(async (tx) => {
    const contact = await tx.contact.findFirst({ where: { id: contactId, userId: ownerId }, select: { linkedUserId: true } });
    if (!contact) return "NOT_FOUND";
    if (contact.linkedUserId) return "LINKED";
    const recipient = await tx.user.findUnique({ where: { username }, select: { id: true } });
    if (!recipient || recipient.id === ownerId) return "NO_USER";
    await tx.contactLinkRequest.upsert({ where: { contactId }, create: { contactId, recipientId: recipient.id }, update: { recipientId: recipient.id, status: "PENDING", respondedAt: null, createdAt: new Date() } });
    return "OK";
  });
  if (outcome !== "OK") { res.status(outcome === "NOT_FOUND" ? 404 : 409).json({ message: outcome === "LINKED" ? "This contact is already connected." : outcome === "NO_USER" ? "No Paylet account has that username." : "Contact not found." }); return; }
  res.status(201).json({ message: "Connection request sent. They must accept it first." });
});

const contactErrors: import("express").ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: error.issues[0]?.message ?? "Invalid contact request." });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    res.status(409).json({ message: "This contact connection changed. Refresh and try again." });
    return;
  }
  next(error);
};
contactsRouter.use(contactErrors);
