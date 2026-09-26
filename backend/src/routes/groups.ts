import { Router } from "express";
import type { ErrorRequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.js";

export const groupsRouter = Router();

const uuid = z.string().uuid();

const groupInput = z
  .object({
    id: uuid,
    name: z.string().trim().min(1).max(80),
  })
  .strict();

const inviteInput = z
  .object({
    username: z.string().trim().min(1).max(30),
  })
  .strict();

const responseInput = z
  .object({
    action: z.enum(["ACCEPT", "DECLINE"]),
  })
  .strict();

// Deliberately excludes email, bio, timezone, and private contact data.
const publicMemberFields = {
  id: true,
  username: true,
  displayName: true,
} as const;

const groupFields = {
  id: true,
  name: true,
  ownerId: true,
  createdAt: true,
  members: {
    orderBy: { joinedAt: "asc" as const },
    select: {
      id: true,
      userId: true,
      joinedAt: true,
      user: { select: publicMemberFields },
    },
  },
} as const;

groupsRouter.use(async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");

  const userId = req.session.userId;

  if (!userId) {
    res.status(401).json({ message: "Please sign in." });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    res.status(401).json({ message: "Please sign in again." });
    return;
  }

  next();
});

const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.session.userId!,
  message: {
    message: "Too many invitations. Please try again later.",
  },
});

// Only groups that the signed-in user has joined.
groupsRouter.get("/", async (req, res) => {
  const userId = req.session.userId!;

  const groups = await prisma.splitGroup.findMany({
    where: {
      members: { some: { userId } },
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: groupFields,
  });

  res.json({ viewerId: userId, groups });
});

// Creating the group and joining its owner happen together.
groupsRouter.post("/", async (req, res) => {
  const body = groupInput.parse(req.body);
  const userId = req.session.userId!;

  const group = await prisma.splitGroup.create({
    data: {
      id: body.id,
      name: body.name,
      ownerId: userId,
      members: {
        create: { userId },
      },
    },
    select: groupFields,
  });

  res.status(201).json({ group });
});

// Incoming invitations belong only to their recipient.
groupsRouter.get("/invitations", async (req, res) => {
  const invitations = await prisma.splitInvitation.findMany({
    where: {
      recipientId: req.session.userId!,
      status: "PENDING",
      group: { deletedAt: null },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      group: {
        select: {
          id: true,
          name: true,
          owner: { select: publicMemberFields },
        },
      },
    },
  });

  res.json({ invitations });
});

// A conditional update prevents accepting the same invite twice.
// Membership creation and acceptance are one transaction.
groupsRouter.post("/invitations/:id/respond", async (req, res) => {
  const id = uuid.parse(req.params.id);
  const body = responseInput.parse(req.body);
  const userId = req.session.userId!;

  const result = await prisma.$transaction(async (tx) => {
    const invitation = await tx.splitInvitation.findFirst({
      where: {
        id,
        recipientId: userId,
      },
      select: {
        id: true,
        groupId: true,
        status: true,
      },
    });

    if (!invitation) return "NOT_FOUND";

    // Serialize acceptance with deletion and new invitations on the group row.
    const active = await tx.splitGroup.updateMany({
      where: { id: invitation.groupId, deletedAt: null },
      data: { updatedAt: new Date() },
    });
    if (active.count !== 1) return "NOT_FOUND";

    const updated = await tx.splitInvitation.updateMany({
      where: {
        id,
        recipientId: userId,
        status: "PENDING",
      },
      data: {
        status: body.action === "ACCEPT" ? "ACCEPTED" : "DECLINED",
        respondedAt: new Date(),
      },
    });

    if (updated.count !== 1) return "ALREADY_HANDLED";

    if (body.action === "ACCEPT") {
      await tx.splitMember.create({
        data: {
          groupId: invitation.groupId,
          userId,
        },
      });
    }

    return "OK";
  });

  if (result === "NOT_FOUND") {
    res.status(404).json({ message: "Invitation not found." });
    return;
  }

  if (result === "ALREADY_HANDLED") {
    res.status(409).json({
      message: "This invitation has already been answered. Refresh the page.",
    });
    return;
  }

  res.json({
    message:
      body.action === "ACCEPT"
        ? "Invitation accepted."
        : "Invitation declined.",
  });
});

// Only the owner can rename a group.
groupsRouter.patch("/:id", async (req, res) => {
  const id = uuid.parse(req.params.id);
  const body = groupInput.omit({ id: true }).parse(req.body);

  const updated = await prisma.splitGroup.updateMany({
    where: {
      id,
      ownerId: req.session.userId!,
      deletedAt: null,
    },
    data: { name: body.name },
  });

  if (updated.count !== 1) {
    res.status(404).json({ message: "Group not found or not owned by you." });
    return;
  }

  res.json({ message: "Group renamed." });
});

// Outgoing invitation status is visible to the group owner.
groupsRouter.get("/:id/invitations", async (req, res) => {
  const groupId = uuid.parse(req.params.id);

  const group = await prisma.splitGroup.findFirst({
    where: {
      id: groupId,
      ownerId: req.session.userId!,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!group) {
    res.status(404).json({ message: "Group not found or not owned by you." });
    return;
  }

  const invitations = await prisma.splitInvitation.findMany({
    where: { groupId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      recipient: { select: publicMemberFields },
    },
  });

  res.json({ invitations });
});

// Exact username lookup occurs only when an owner sends an invitation.
groupsRouter.post("/:id/invitations", inviteLimiter, async (req, res) => {
  const groupId = uuid.parse(req.params.id);
  const body = inviteInput.parse(req.body);
  const userId = req.session.userId!;

  const result = await prisma.$transaction(async (tx) => {
    const active = await tx.splitGroup.updateMany({
      where: { id: groupId, ownerId: userId, deletedAt: null },
      data: { updatedAt: new Date() },
    });
    if (active.count !== 1) return "NOT_FOUND";
    const recipient = await tx.user.findUnique({
      where: { username: body.username }, select: { id: true },
    });
    if (!recipient) return "NO_USER";
    const member = await tx.splitMember.findUnique({
      where: { groupId_userId: { groupId, userId: recipient.id } },
      select: { id: true },
    });
    if (member) return "MEMBER";
    await tx.splitInvitation.create({
      data: { groupId, recipientId: recipient.id },
    });
    return "OK";
  });
  if (result !== "OK") {
    res.status(result === "MEMBER" ? 409 : 404).json({
      message: result === "MEMBER" ? "That user is already a member."
        : result === "NO_USER" ? "No account has that exact username."
        : "Group not found or not owned by you.",
    });
    return;
  }

  res.status(201).json({ message: "Invitation sent." });
});

// Soft deletion is owner-only. The transaction also cancels pending invites.
groupsRouter.delete("/:id", async (req, res) => {
  const id = uuid.parse(req.params.id);
  const deleted = await prisma.$transaction(async (tx) => {
    const result = await tx.splitGroup.updateMany({
      where: { id, ownerId: req.session.userId!, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count !== 1) return false;
    await tx.splitInvitation.updateMany({
      where: { groupId: id, status: "PENDING" },
      data: { status: "CANCELLED", respondedAt: new Date() },
    });
    return true;
  });
  if (!deleted) {
    res.status(404).json({ message: "Group not found or not owned by you." });
    return;
  }
  res.json({ message: "Group deleted. Pending invitations were cancelled." });
});

const groupErrorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  next
) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      message: error.issues[0]?.message ?? "Invalid group details.",
    });
    return;
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    res.status(409).json({
      message:
        "This group or invitation already exists. Refresh to see its status.",
    });
    return;
  }

  next(error);
};

groupsRouter.use(groupErrorHandler);