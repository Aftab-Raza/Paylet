import type { Prisma } from "../generated/prisma/client.js";
import { moneyString } from "./splitMoney.js";

type BillInput = { payerId: string; amountMinor: bigint; currency: string; minorUnit: number; shares: { memberId: string; amountMinor: bigint }[] };
type SettlementInput = { fromMemberId: string; toMemberId: string; amountMinor: bigint; currency: string; minorUnit: number; status: string };
export function computeLedger(bills: BillInput[], settlements: SettlementInput[]) {
  const totals = new Map<string, { memberId: string; currency: string; minorUnit: number; paid: bigint; share: bigint; sent: bigint; received: bigint }>();
  const pairs = new Map<string, { low: string; high: string; currency: string; minorUnit: number; debt: bigint }>();
  function total(memberId: string, currency: string, minorUnit: number) {
    const key = `${memberId}:${currency}:${minorUnit}`;
    let value = totals.get(key);
    if (!value) { value = { memberId, currency, minorUnit, paid: 0n, share: 0n, sent: 0n, received: 0n }; totals.set(key, value); }
    return value;
  }
  function obligation(from: string, to: string, amount: bigint, currency: string, minorUnit: number) {
    if (from === to) return;
    const [low, high] = [from, to].sort();
    const key = `${low}:${high}:${currency}:${minorUnit}`;
    let pair = pairs.get(key);
    if (!pair) { pair = { low, high, currency, minorUnit, debt: 0n }; pairs.set(key, pair); }
    pair.debt += from === low ? amount : -amount;
  }
  for (const bill of bills) {
    total(bill.payerId, bill.currency, bill.minorUnit).paid += bill.amountMinor;
    for (const share of bill.shares) {
      total(share.memberId, bill.currency, bill.minorUnit).share += share.amountMinor;
      obligation(share.memberId, bill.payerId, share.amountMinor, bill.currency, bill.minorUnit);
    }
  }
  for (const payment of settlements) {
    if (!["CONFIRMED", "REVERSAL_PENDING"].includes(payment.status)) continue;
    total(payment.fromMemberId, payment.currency, payment.minorUnit).sent += payment.amountMinor;
    total(payment.toMemberId, payment.currency, payment.minorUnit).received += payment.amountMinor;
    obligation(payment.fromMemberId, payment.toMemberId, -payment.amountMinor, payment.currency, payment.minorUnit);
  }
  return {
    balances: [...totals.values()].map((t) => ({ ...t, net: t.paid - t.share + t.sent - t.received })),
    debts: [...pairs.values()].filter((p) => p.debt !== 0n).map((p) => ({
      fromMemberId: p.debt > 0n ? p.low : p.high, toMemberId: p.debt > 0n ? p.high : p.low,
      amountMinor: p.debt > 0n ? p.debt : -p.debt, currency: p.currency, minorUnit: p.minorUnit,
    })),
  };
}
export async function groupLedger(tx: Prisma.TransactionClient, groupId: string) {
  const bills = await tx.sharedBill.findMany({ where: { groupId, deletedAt: null }, include: { shares: true } });
  const payments = await tx.groupSettlement.findMany({ where: { groupId, status: { in: ["CONFIRMED", "REVERSAL_PENDING"] } } });
  return computeLedger(bills, payments);
}
export async function publicLedger(tx: Prisma.TransactionClient, groupId: string) {
  const ledger = await groupLedger(tx, groupId);
  const members = await tx.splitMember.findMany({ where: { groupId }, include: { user: { select: { id: true, displayName: true, username: true } } } });
  const users = new Map(members.map((m) => [m.id, m.user]));
  return {
    balances: ledger.balances.map((b) => ({ memberId: b.memberId, user: users.get(b.memberId)!, currency: b.currency,
      paid: moneyString(b.paid, b.minorUnit), share: moneyString(b.share, b.minorUnit),
      sent: moneyString(b.sent, b.minorUnit), received: moneyString(b.received, b.minorUnit), net: moneyString(b.net, b.minorUnit) })),
    debts: ledger.debts.map((d) => ({ fromMemberId: d.fromMemberId, toMemberId: d.toMemberId,
      fromUser: users.get(d.fromMemberId)!, toUser: users.get(d.toMemberId)!, currency: d.currency, minorUnit: d.minorUnit,
      amount: moneyString(d.amountMinor, d.minorUnit) })),
  };
}
