import { Router } from "express";
import type { ErrorRequestHandler } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { moneyString, parseMoney } from "../lib/splitMoney.js";
import { groupLedger, publicLedger } from "../lib/groupLedger.js";

export const groupSettlementsRouter = Router({ mergeParams: true });
type Params = { groupId: string; id: string };
class SettlementError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const uuid = z.string().uuid();
const date = z.string().refine((value) => {
  if (!/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Enter a valid date between 1900 and 2199.");
const createInput = z.object({ id: uuid, fromMemberId: uuid, toMemberId: uuid,
  currency: z.string().length(3), amount: z.string(), paidOn: date, note: z.string().trim().max(300),
}).strict();
const actionInput = z.object({ version: z.number().int().positive(), action: z.enum([
  "CONFIRM", "REJECT", "CANCEL", "REQUEST_REVERSAL", "CONFIRM_REVERSAL", "REJECT_REVERSAL", "CANCEL_REVERSAL",
]) }).strict();
const personFields = { id: true, displayName: true, username: true } as const;
const include = {
  fromMember: { include: { user: { select: personFields } } },
  toMember: { include: { user: { select: personFields } } },
  creator: { select: personFields },
} as const;
type Payment = Prisma.GroupSettlementGetPayload<{ include: typeof include }>;
function serialize(s: Payment) {
  return { id: s.id, groupId: s.groupId, creatorId: s.creatorId, creator: s.creator,
    fromMemberId: s.fromMemberId, toMemberId: s.toMemberId, fromUser: s.fromMember.user, toUser: s.toMember.user,
    amount: moneyString(s.amountMinor, s.minorUnit), currency: s.currency,
    paidOn: s.paidOn.toISOString().slice(0, 10), note: s.note, status: s.status, version: s.version,
    reversalRequesterId: s.reversalRequesterId, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() };
}
async function lock(tx: Prisma.TransactionClient, groupId: string, userId: string) {
  const changed = await tx.splitGroup.updateMany({ where: { id: groupId, deletedAt: null, members: { some: { userId } } }, data: { updatedAt: new Date() } });
  if (changed.count !== 1) throw new SettlementError(404, "Group not found or you are not an accepted member.");
}
async function checkDebt(tx: Prisma.TransactionClient, groupId: string, from: string, to: string, currency: string, digits: number, amount: bigint) {
  const ledger = await groupLedger(tx, groupId);
  const debt = ledger.debts.find((d) => d.fromMemberId === from && d.toMemberId === to && d.currency === currency && d.minorUnit === digits);
  if (!debt || amount > debt.amountMinor) throw new SettlementError(409, "This payment exceeds the current amount owed between these people. Refresh the group; cancel and recreate an incorrect request.");
}
async function audit(tx: Prisma.TransactionClient, id: string, actorId: string, action: string) {
  const s = await tx.groupSettlement.findUniqueOrThrow({ where: { id }, include });
  await tx.groupSettlementHistory.create({ data: { settlementId: id, actorId, action, snapshot: serialize(s) } });
  return serialize(s);
}
// Authentication is provided by the parent groups router.
groupSettlementsRouter.get<Params>("/", async (req, res) => {
  const groupId = uuid.parse(req.params.groupId);
  const result = await prisma.$transaction(async (tx) => {
    const group = await tx.splitGroup.findFirst({ where: { id: groupId, deletedAt: null, members: { some: { userId: req.session.userId! } } }, select: { id: true } });
    if (!group) throw new SettlementError(404, "Group not found.");
    const payments = await tx.groupSettlement.findMany({ where: { groupId }, include, orderBy: { createdAt: "desc" } });
    return { settlements: payments.map(serialize), ...await publicLedger(tx, groupId) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  res.json(result);
});
groupSettlementsRouter.post<Params>("/", async (req, res) => {
  const groupId = uuid.parse(req.params.groupId);
  const userId = req.session.userId!;
  const body = createInput.parse(req.body);
  if (body.fromMemberId === body.toMemberId) throw new SettlementError(400, "Choose two different people.");
  const result = await prisma.$transaction(async (tx) => {
    await lock(tx, groupId, userId);
    const members = await tx.splitMember.findMany({ where: { groupId, id: { in: [body.fromMemberId, body.toMemberId] } }, select: { id: true, userId: true } });
    if (members.length !== 2 || !members.some((m) => m.userId === userId)) throw new SettlementError(403, "You can record payments only between yourself and another member of this group.");
    const ledger = await groupLedger(tx, groupId);
    const debt = ledger.debts.find((d) => d.fromMemberId === body.fromMemberId && d.toMemberId === body.toMemberId && d.currency === body.currency);
    if (!debt) throw new SettlementError(409, "There is no outstanding amount in that direction and currency.");
    let amount: bigint;
    try { amount = parseMoney(body.amount, debt.minorUnit); }
    catch (err) { throw new SettlementError(400, err instanceof Error ? err.message : "Invalid amount."); }
    if (amount <= 0n || amount > debt.amountMinor) throw new SettlementError(400, "Enter a positive amount no greater than the current amount owed.");
    await tx.groupSettlement.create({ data: { id: body.id, groupId, creatorId: userId,
      fromMemberId: body.fromMemberId, toMemberId: body.toMemberId, amountMinor: amount,
      currency: body.currency, minorUnit: debt.minorUnit, paidOn: new Date(`${body.paidOn}T00:00:00Z`), note: body.note,
    } });
    return audit(tx, body.id, userId, "REQUESTED");
  });
  res.status(201).json({ settlement: result });
});
groupSettlementsRouter.post<Params>("/:id/action", async (req, res) => {
  const groupId = uuid.parse(req.params.groupId);
  const id = uuid.parse(req.params.id);
  const body = actionInput.parse(req.body);
  const userId = req.session.userId!;
  const settlement = await prisma.$transaction(async (tx) => {
    await lock(tx, groupId, userId);
    const s = await tx.groupSettlement.findFirst({ where: { id, groupId }, include });
    if (!s) throw new SettlementError(404, "Payment not found.");
    const memberId = s.fromMember.userId === userId ? s.fromMemberId : s.toMember.userId === userId ? s.toMemberId : null;
    if (!memberId) throw new SettlementError(403, "Only the two people involved can act on this payment.");
    if (s.version !== body.version) throw new SettlementError(409, "This payment changed. Refresh before trying again.");
    const creator = s.creatorId === userId;
    let status = s.status;
    let requester = s.reversalRequesterId;
    const invalid = () => { throw new SettlementError(409, "This action is not available to you in the payment’s current state."); };
    switch (body.action) {
      case "CONFIRM":
        if (s.status !== "PENDING" || creator) invalid();
        await checkDebt(tx, groupId, s.fromMemberId, s.toMemberId, s.currency, s.minorUnit, s.amountMinor);
        status = "CONFIRMED"; break;
      case "REJECT":
        if (s.status !== "PENDING" || creator) invalid();
        status = "REJECTED"; break;
      case "CANCEL":
        if (s.status !== "PENDING" || !creator) invalid();
        status = "CANCELLED"; break;
      case "REQUEST_REVERSAL":
        if (s.status !== "CONFIRMED") invalid();
        status = "REVERSAL_PENDING"; requester = memberId; break;
      case "CONFIRM_REVERSAL":
        if (s.status !== "REVERSAL_PENDING" || requester === memberId) invalid();
        status = "REVERSED"; requester = null; break;
      case "REJECT_REVERSAL":
        if (s.status !== "REVERSAL_PENDING" || requester === memberId) invalid();
        status = "CONFIRMED"; requester = null; break;
      case "CANCEL_REVERSAL":
        if (s.status !== "REVERSAL_PENDING" || requester !== memberId) invalid();
        status = "CONFIRMED"; requester = null; break;
    }
    await tx.groupSettlement.update({ where: { id }, data: { status, reversalRequesterId: requester, version: { increment: 1 } } });
    return audit(tx, id, userId, body.action);
  });
  res.json({ settlement });
});
groupSettlementsRouter.get<Params>("/:id/history", async (req, res) => {
  const groupId = uuid.parse(req.params.groupId);
  const id = uuid.parse(req.params.id);
  const payment = await prisma.groupSettlement.findFirst({ where: { id, groupId, group: { members: { some: { userId: req.session.userId! } } } }, select: { id: true } });
  if (!payment) throw new SettlementError(404, "Payment not found.");
  const history = await prisma.groupSettlementHistory.findMany({ where: { settlementId: id }, orderBy: { createdAt: "asc" }, select: { id: true, action: true, snapshot: true, createdAt: true, actor: { select: personFields } } });
  res.json({ history });
});
const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof SettlementError) { res.status(error.status).json({ message: error.message }); return; }
  if (error instanceof z.ZodError) { res.status(400).json({ message: error.issues[0]?.message ?? "Invalid payment." }); return; }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { res.status(409).json({ message: "This payment may already be recorded. Refresh to check before submitting again." }); return; }
  next(error);
};
groupSettlementsRouter.use(errorHandler);
