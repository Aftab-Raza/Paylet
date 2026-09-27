import { Router } from "express";
import type { ErrorRequestHandler } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { equalShares, moneyString, parseMoney } from "../lib/splitMoney.js";

import { publicLedger } from "../lib/groupLedger.js";

export const groupBillsRouter = Router({ mergeParams: true });
class BillError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const idSchema = z.string().uuid();
const categories = ["Food", "Groceries", "Travel", "Shopping", "Rent", "Utilities", "Health", "Education", "Entertainment", "Other"];
const currencies = Intl.supportedValuesOf("currency");
const dateSchema = z.string().refine((value) => {
  if (!/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Enter a valid date between 1900 and 2199.");
const input = z.object({
  id: idSchema, amount: z.string(), currency: z.string().refine((v) => currencies.includes(v), "Unsupported currency."),
  purpose: z.string().trim().min(1).max(200), category: z.string().refine((v) => categories.includes(v), "Choose a category."),
  date: dateSchema, payerId: idSchema, splitMode: z.enum(["EQUAL", "CUSTOM"]),
  participants: z.array(z.object({ memberId: idSchema, amount: z.string().optional() }).strict()).min(1).max(100),
}).strict();
const userFields = { id: true, displayName: true, username: true } as const;
const includeBill = {
  payer: { include: { user: { select: userFields } } },
  creator: { select: userFields },
  shares: { orderBy: { memberId: "asc" as const }, include: { member: { include: { user: { select: userFields } } } } },
} as const;
type Bill = Prisma.SharedBillGetPayload<{ include: typeof includeBill }>;
function serialize(bill: Bill) {
  return {
    id: bill.id, groupId: bill.groupId, creatorId: bill.creatorId, creator: bill.creator,
    payerId: bill.payerId, payer: bill.payer.user, amount: moneyString(bill.amountMinor, bill.minorUnit),
    currency: bill.currency, minorUnit: bill.minorUnit, purpose: bill.purpose, category: bill.category,
    date: bill.spentOn.toISOString().slice(0, 10), splitMode: bill.splitMode,
    deletedAt: bill.deletedAt?.toISOString() ?? null, createdAt: bill.createdAt.toISOString(),
    shares: bill.shares.map((s) => ({ memberId: s.memberId, user: s.member.user, amount: moneyString(s.amountMinor, bill.minorUnit) })),
  };
}
async function lockGroup(tx: Prisma.TransactionClient, groupId: string, userId: string) {
  const locked = await tx.splitGroup.updateMany({
    where: { id: groupId, deletedAt: null, members: { some: { userId } } },
    data: { updatedAt: new Date() },
  });
  if (locked.count !== 1) throw new BillError(404, "Group unavailable or you are not a member.");
}
// Mounted after the parent group's authentication middleware.
groupBillsRouter.get<{ groupId: string }>("/", async (req, res) => {
  const groupId = idSchema.parse(req.params.groupId);
  const userId = req.session.userId!;
  const group = await prisma.splitGroup.findFirst({
    where: { id: groupId, deletedAt: null, members: { some: { userId } } }, select: { id: true },
  });
  if (!group) throw new BillError(404, "Group unavailable or you are not a member.");
  const result = await prisma.$transaction(async (tx) => {
    const bills = await tx.sharedBill.findMany({ where: { groupId }, orderBy: [{ spentOn: "desc" }, { createdAt: "desc" }], include: includeBill });
    return { bills: bills.map(serialize), ...await publicLedger(tx, groupId) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  res.json(result);
});
groupBillsRouter.post<{ groupId: string }>("/", async (req, res) => {
  const groupId = idSchema.parse(req.params.groupId);
  const userId = req.session.userId!;
  const body = input.parse(req.body);
  const digits = new Intl.NumberFormat("en", { style: "currency", currency: body.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  let amount: bigint;
  let shares: { memberId: string; amountMinor: bigint }[];
  try {
    amount = parseMoney(body.amount, digits);
    if (amount <= 0n) throw new Error("Enter an amount greater than zero.");
    const ids = body.participants.map((p) => p.memberId);
    if (new Set(ids).size !== ids.length) throw new Error("Each participant can appear only once.");
    shares = body.splitMode === "EQUAL" ? equalShares(amount, ids) : body.participants.map((p) => ({ memberId: p.memberId, amountMinor: parseMoney(p.amount ?? "", digits) }));
    if (shares.reduce((sum, s) => sum + s.amountMinor, 0n) !== amount) throw new Error("Custom shares must add up exactly to the bill amount.");
  } catch (error) { throw new BillError(400, error instanceof Error ? error.message : "Invalid amount."); }
  const bill = await prisma.$transaction(async (tx) => {
    await lockGroup(tx, groupId, userId);
    const members = await tx.splitMember.findMany({ where: { groupId }, select: { id: true } });
    const valid = new Set(members.map((m) => m.id));
    if (!valid.has(body.payerId) || shares.some((s) => !valid.has(s.memberId))) throw new BillError(400, "Payer and participants must be accepted members of this group.");
    const created = await tx.sharedBill.create({ data: {
      id: body.id, groupId, creatorId: userId, payerId: body.payerId, amountMinor: amount,
      currency: body.currency, minorUnit: digits, purpose: body.purpose, category: body.category,
      spentOn: new Date(`${body.date}T00:00:00.000Z`), splitMode: body.splitMode,
      shares: { create: shares },
    }, include: includeBill });
    await tx.sharedBillHistory.create({ data: { billId: created.id, actorId: userId, action: "CREATED", snapshot: serialize(created) } });
    return created;
  });
  res.status(201).json({ bill: serialize(bill) });
});
groupBillsRouter.delete<{ groupId: string; id: string }>("/:id", async (req, res) => {
  const groupId = idSchema.parse(req.params.groupId);
  const id = idSchema.parse(req.params.id);
  const userId = req.session.userId!;
  await prisma.$transaction(async (tx) => {
    await lockGroup(tx, groupId, userId);
    const updated = await tx.sharedBill.updateMany({ where: { id, groupId, creatorId: userId, deletedAt: null }, data: { deletedAt: new Date() } });
    if (updated.count !== 1) throw new BillError(409, "Only the person who recorded an active bill can delete it. Refresh and try again.");
    const bill = await tx.sharedBill.findUniqueOrThrow({ where: { id }, include: includeBill });
    await tx.sharedBillHistory.create({ data: { billId: id, actorId: userId, action: "DELETED", snapshot: serialize(bill) } });
  });
  res.json({ message: "Bill deleted. Everyone’s share and totals have been updated." });
});
groupBillsRouter.get<{ groupId: string; id: string }>("/:id/history", async (req, res) => {
  const groupId = idSchema.parse(req.params.groupId);
  const id = idSchema.parse(req.params.id);
  const bill = await prisma.sharedBill.findFirst({ where: { id, groupId, group: { members: { some: { userId: req.session.userId! } } } }, select: { id: true } });
  if (!bill) throw new BillError(404, "Bill not found.");
  const history = await prisma.sharedBillHistory.findMany({ where: { billId: id }, orderBy: { createdAt: "asc" }, select: { id: true, action: true, snapshot: true, createdAt: true, actor: { select: userFields } } });
  res.json({ history });
});
const errors: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof BillError) { res.status(error.status).json({ message: error.message }); return; }
  if (error instanceof z.ZodError) { res.status(400).json({ message: error.issues[0]?.message ?? "Invalid bill." }); return; }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    res.status(409).json({ message: "This bill may already be saved. Refresh before trying again." }); return;
  }
  next(error);
};
groupBillsRouter.use(errors);
