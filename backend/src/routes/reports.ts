import { Router } from "express";
import { prisma } from "../lib/prisma.js";

import { monthlySpending } from "../lib/monthlySpending.js";

export const reportsRouter = Router();

function decimalString(amount: bigint, digits: number): string {
  const value = amount.toString().padStart(digits + 1, "0");

  if (digits === 0) return value;

  return `${value.slice(0, -digits)}.${value.slice(-digits)}`;
}

reportsRouter.use(async (req, res, next) => {
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

reportsRouter.get("/monthly", async (req, res) => {
  const month = req.query.month;

  if (
    typeof month !== "string" ||
    !/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month)
  ) {
    res.status(400).json({ message: "Choose a valid month." });
    return;
  }

  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.session.userId! },
    select: { displayName: true },
  });

  const expenses = (await monthlySpending(req.session.userId!, start, end))
    .filter((expense) => !expense.voidedAt)
    .sort((a, b) => a.spentOn.getTime() - b.spentOn.getTime() || a.createdAt.getTime() - b.createdAt.getTime());

  const groups = new Map<string, {
    currency: string;
    minorUnit: number;
    total: bigint;
    count: number;
    categories: Map<string, { total: bigint; count: number }>;
  }>();

  for (const expense of expenses) {
    const key = `${expense.currency}:${expense.minorUnit}`;

    const group = groups.get(key) ?? {
      currency: expense.currency,
      minorUnit: expense.minorUnit,
      total: 0n,
      count: 0,
      categories: new Map<
        string,
        { total: bigint; count: number }
      >(),
    };

    group.total += expense.amountMinor;
    group.count += 1;

    const category = group.categories.get(expense.category) ?? {
      total: 0n,
      count: 0,
    };

    category.total += expense.amountMinor;
    category.count += 1;

    group.categories.set(expense.category, category);
    groups.set(key, group);
  }

  res.json({
    month,
    name: user.displayName,
    count: expenses.length,

    currencies: [...groups.values()]
      .sort((a, b) => a.currency.localeCompare(b.currency))
      .map((group) => ({
        currency: group.currency,
        minorUnit: group.minorUnit,
        total: decimalString(group.total, group.minorUnit),
        count: group.count,
        categories: [...group.categories.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([category, value]) => ({
            category,
            count: value.count,
            total: decimalString(value.total, group.minorUnit),
          })),
      })),

    expenses: expenses.map((expense) => ({
      id: expense.id,
      date: expense.spentOn.toISOString().slice(0, 10),
      purpose: expense.source === "SHARED" ? `${expense.purpose} (your shared portion)` : expense.purpose,
      category: expense.category,
      currency: expense.currency,
      amount: decimalString(
        expense.amountMinor,
        expense.minorUnit
      ),
    })),
  });
});