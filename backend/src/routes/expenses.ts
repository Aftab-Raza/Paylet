import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import type { Expense } from "../generated/prisma/client.js";

export const expensesRouter = Router();

const categories = [
  "Food",
  "Groceries",
  "Travel",
  "Shopping",
  "Rent",
  "Utilities",
  "Health",
  "Education",
  "Entertainment",
  "Other",
];

const currencies = Intl.supportedValuesOf("currency");

function digitsFor(currency: string): number {
  return (
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

function decimalString(amount: bigint, digits: number): string {
  const value = amount.toString().padStart(digits + 1, "0");

  if (digits === 0) return value;

  return `${value.slice(0, -digits)}.${value.slice(-digits)}`;
}

function serialize(expense: Expense) {
  return {
    id: expense.id,
    amount: decimalString(expense.amountMinor, expense.minorUnit),
    currency: expense.currency,
    purpose: expense.purpose,
    category: expense.category,
    date: expense.spentOn.toISOString().slice(0, 10),
    version: expense.version,
    voidedAt: expense.voidedAt?.toISOString() ?? null,
  };
}

const dateSchema = z.string().refine((value) => {
  if (!/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}, "Enter a valid date between 1900 and 2199.");

const expenseSchema = z.object({
  amount: z.string().regex(
    /^\d{1,12}(?:\.\d{1,4})?$/,
    "Enter a positive amount without commas, using up to 12 whole digits."
  ),

  currency: z.string().refine(
    (value) => currencies.includes(value),
    "Choose a supported currency."
  ),

  purpose: z.string().trim().min(1).max(200),

  category: z.string().refine(
    (value) => categories.includes(value),
    "Choose a category."
  ),

  date: dateSchema,
});

function convertAmount(amount: string, currency: string) {
  const minorUnit = digitsFor(currency);
  const [whole, fraction = ""] = amount.split(".");

  if (fraction.length > minorUnit) {
    return null;
  }

  const amountMinor = BigInt(
    whole + fraction.padEnd(minorUnit, "0")
  );

  if (amountMinor <= 0n) {
    return null;
  }

  return { amountMinor, minorUnit };
}

// All routes require an authenticated user.
expensesRouter.use(async (req, res, next) => {
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

expensesRouter.get("/options", (_req, res) => {
  res.json({ categories, currencies });
});

// Monthly list and totals.
expensesRouter.get("/", async (req, res) => {
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

  const expenses = await prisma.expense.findMany({
    where: {
      userId: req.session.userId!,
      spentOn: {
        gte: start,
        lt: end,
      },
    },
    orderBy: [
      { spentOn: "desc" },
      { createdAt: "desc" },
    ],
  });

  const totals = new Map<
    string,
    {
      currency: string;
      minorUnit: number;
      amount: bigint;
    }
  >();

  for (const expense of expenses) {
    if (expense.voidedAt) continue;

    const key = `${expense.currency}:${expense.minorUnit}`;

    const total = totals.get(key) ?? {
      currency: expense.currency,
      minorUnit: expense.minorUnit,
      amount: 0n,
    };

    total.amount += expense.amountMinor;
    totals.set(key, total);
  }

  res.json({
    expenses: expenses.map(serialize),

    totals: [...totals.values()].map((total) => ({
      currency: total.currency,
      amount: decimalString(total.amount, total.minorUnit),
    })),

    count: expenses.filter((expense) => !expense.voidedAt).length,
  });
});

// Create a personal expense.
expensesRouter.post("/", async (req, res) => {
  const parsed = expenseSchema
    .extend({
      id: z.string().uuid(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Invalid expense.",
    });
    return;
  }

  const money = convertAmount(
    parsed.data.amount,
    parsed.data.currency
  );

  if (!money) {
    res.status(400).json({
      message:
        `Enter an amount greater than zero with at most ` +
        `${digitsFor(parsed.data.currency)} decimal places.`,
    });
    return;
  }

  try {
    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          id: parsed.data.id,
          userId: req.session.userId!,
          ...money,
          currency: parsed.data.currency,
          purpose: parsed.data.purpose,
          category: parsed.data.category,
          spentOn: new Date(
            `${parsed.data.date}T00:00:00.000Z`
          ),
        },
      });

      await tx.expenseRevision.create({
        data: {
          expenseId: created.id,
          action: "CREATED",
          snapshot: serialize(created),
        },
      });

      return created;
    });

    res.status(201).json({
      expense: serialize(expense),
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      res.status(409).json({
        message:
          "This entry may already be saved. Reload before trying again.",
      });
      return;
    }

    throw error;
  }
});

// Edit an active personal expense.
expensesRouter.patch("/:id", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);

  const parsed = expenseSchema
    .extend({
      version: z.number().int().positive(),
    })
    .safeParse(req.body);

  if (!id.success || !parsed.success) {
    res.status(400).json({
      message: "Invalid expense details.",
    });
    return;
  }

  const money = convertAmount(
    parsed.data.amount,
    parsed.data.currency
  );

  if (!money) {
    res.status(400).json({
      message: "Check the amount and this currency’s decimal places.",
    });
    return;
  }

  try {
    const expense = await prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: {
          id: id.data,
          userId: req.session.userId!,
          version: parsed.data.version,
          voidedAt: null,
        },
        data: {
          ...money,
          currency: parsed.data.currency,
          purpose: parsed.data.purpose,
          category: parsed.data.category,
          spentOn: new Date(
            `${parsed.data.date}T00:00:00.000Z`
          ),
          version: {
            increment: 1,
          },
        },
      });

      await tx.expenseRevision.create({
        data: {
          expenseId: updated.id,
          action: "EDITED",
          snapshot: serialize(updated),
        },
      });

      return updated;
    });

    res.json({
      expense: serialize(expense),
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      res.status(409).json({
        message:
          "This entry changed or is unavailable. Reload and reopen it.",
      });
      return;
    }

    throw error;
  }
});

// Void an expense while preserving its history.
expensesRouter.post("/:id/void", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);

  const version = z
    .number()
    .int()
    .positive()
    .safeParse(req.body?.version);

  if (!id.success || !version.success) {
    res.status(400).json({
      message: "Invalid request.",
    });
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: {
          id: id.data,
          userId: req.session.userId!,
          version: version.data,
          voidedAt: null,
        },
        data: {
          voidedAt: new Date(),
          version: {
            increment: 1,
          },
        },
      });

      await tx.expenseRevision.create({
        data: {
          expenseId: updated.id,
          action: "VOIDED",
          snapshot: serialize(updated),
        },
      });
    });

    res.json({
      message: "Expense voided.",
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      res.status(409).json({
        message:
          "This entry changed or is unavailable. Reload and try again.",
      });
      return;
    }

    throw error;
  }
});

// History is visible only to the expense owner.
expensesRouter.get("/:id/history", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);

  if (!id.success) {
    res.status(400).json({
      message: "Invalid expense ID.",
    });
    return;
  }

  const expense = await prisma.expense.findFirst({
    where: {
      id: id.data,
      userId: req.session.userId!,
    },
  });

  if (!expense) {
    res.status(404).json({
      message: "Expense not found.",
    });
    return;
  }

  const history = await prisma.expenseRevision.findMany({
    where: {
      expenseId: expense.id,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      action: true,
      snapshot: true,
      createdAt: true,
    },
  });

  res.json({ history });
});