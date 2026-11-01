import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { moneyString } from "../lib/splitMoney.js";
import { createLedgerInTransaction, LedgerError } from "./loans.js";

// Mounted inside contactsRouter, after its authentication middleware.
export const sharedPaymentsRouter = Router();
const uuid = z.string().uuid();

sharedPaymentsRouter.post("/shared-entries/:id/paid", async (req, res) => {
  const entryId = uuid.parse(req.params.id), recipientId = req.session.userId!;
  await prisma.$transaction(async (tx) => {
    const share = await tx.contactMoneyShare.findFirst({ where: { entryId, recipientId, entry: { voidedAt: null, kind: "ADVANCE", direction: "LENT", contact: { linkedUserId: recipientId } } }, include: { entry: true } });
    if (!share) throw new LedgerError("This shared debt is no longer available.", 404);
    const existing = await tx.sharedPaymentRequest.findUnique({ where: { entryId } });
    if (existing && existing.recipientId !== recipientId) throw new LedgerError("The linked account changed. Ask the sender to review it.", 409);
    if (existing && existing.status !== "DECLINED") return;
    if (existing) {
      await tx.sharedPaymentRequest.updateMany({ where: { entryId, status: "DECLINED", version: existing.version }, data: { status: "PENDING", requestedAt: new Date(), respondedAt: null, version: { increment: 1 } } });
    } else await tx.sharedPaymentRequest.create({ data: { entryId, recipientId } });
  });
  res.json({ message: "Payment confirmation requested. Your balance changes only after the sender confirms." });
});

sharedPaymentsRouter.get("/payment-requests", async (req, res) => {
  const requests = await prisma.sharedPaymentRequest.findMany({
    where: { status: "PENDING", entry: { voidedAt: null, contact: { userId: req.session.userId! }, share: { isNot: null } } },
    orderBy: { requestedAt: "desc" },
    include: { entry: { include: { contact: { select: { name: true, linkedUserId: true } }, share: true } } },
  });
  res.json({ requests: requests.filter(r => r.entry.contact.linkedUserId === r.recipientId && r.entry.share?.recipientId === r.recipientId).map(r => ({ id: r.entryId, version: r.version, name: r.entry.contact.name, purpose: r.entry.purpose, amount: moneyString(r.entry.amountMinor, r.entry.minorUnit), currency: r.entry.currency, date: r.entry.entryDate.toISOString().slice(0, 10) })) });
});

sharedPaymentsRouter.post("/payment-requests/:id/respond", async (req, res) => {
  const entryId = uuid.parse(req.params.id), ownerId = req.session.userId!;
  const { action, version } = z.object({ action: z.enum(["CONFIRM", "DECLINE"]), version: z.number().int().positive() }).strict().parse(req.body);
  await prisma.$transaction(async (tx) => {
    const request = await tx.sharedPaymentRequest.findFirst({ where: { entryId, entry: { contact: { userId: ownerId } } }, include: { entry: { include: { contact: true, share: true } } } });
    if (!request) throw new LedgerError("Payment request not found.", 404);
    if (request.status === "CONFIRMED" && action === "CONFIRM") return;
    const source = request.entry;
    if (source.voidedAt || source.kind !== "ADVANCE" || source.direction !== "LENT" || source.contact.linkedUserId !== request.recipientId || source.share?.recipientId !== request.recipientId) throw new LedgerError("The original shared entry or connection changed.", 409);
    const claimed = await tx.sharedPaymentRequest.updateMany({ where: { entryId, status: "PENDING", version }, data: { status: action === "CONFIRM" ? "CONFIRMED" : "DECLINED", respondedAt: new Date(), version: { increment: 1 } } });
    if (claimed.count !== 1) throw new LedgerError("This request changed. Refresh and try again.", 409);
    if (action === "CONFIRM") {
      const repaymentId = randomUUID();
      await createLedgerInTransaction(tx, ownerId, { id: repaymentId, contactId: source.contactId, version: source.contact.version, direction: source.direction, kind: "REPAYMENT", amount: moneyString(source.amountMinor, source.minorUnit), currency: source.currency, purpose: `Confirmed payment: ${source.purpose}`.slice(0, 300), date: new Date().toISOString().slice(0, 10) });
      await tx.sharedPaymentRequest.update({ where: { entryId }, data: { repaymentId } });
    }
  });
  res.json({ message: action === "CONFIRM" ? "Payment confirmed and balance updated." : "Payment marked as not received." });
});

sharedPaymentsRouter.use(((error, _req, res, next) => {
  if (error instanceof LedgerError) { res.status(error.status).json({ message: error.message }); return; }
  next(error);
}) as import("express").ErrorRequestHandler);
