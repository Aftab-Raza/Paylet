import { prisma } from "./prisma.js";
import type { Expense } from "../generated/prisma/client.js";
export type SpendingRow = Expense & { source: "PERSONAL" | "SHARED"; groupId?: string; billId?: string };
// A share is projected into monthly spending, never copied into the expense table.
export async function monthlySpending(userId: string, start: Date, end: Date): Promise<SpendingRow[]> {
  const [personal, shares] = await prisma.$transaction([
    prisma.expense.findMany({ where: { userId, spentOn: { gte: start, lt: end } } }),
    prisma.sharedBillShare.findMany({ where: { member: { userId }, amountMinor: { gt: 0n }, bill: { spentOn: { gte: start, lt: end } } }, include: { bill: true } }),
  ]);
  const rows: SpendingRow[] = personal.map((e) => ({ ...e, source: "PERSONAL" }));
  for (const share of shares) {
    const bill = share.bill;
    rows.push({
      id: share.id, userId, amountMinor: share.amountMinor, currency: bill.currency, minorUnit: bill.minorUnit,
      purpose: bill.purpose, category: bill.category, spentOn: bill.spentOn, version: 1,
      voidedAt: bill.deletedAt, createdAt: bill.createdAt, updatedAt: bill.deletedAt ?? bill.createdAt,
      source: "SHARED", groupId: bill.groupId, billId: bill.id,
    });
  }
  return rows.sort((a, b) => b.spentOn.getTime() - a.spentOn.getTime() || b.createdAt.getTime() - a.createdAt.getTime());
}
