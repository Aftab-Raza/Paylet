import { Router } from "express";
import type { ErrorRequestHandler } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import type { ContactMoneyEntry } from "../generated/prisma/client.js";

export const loansRouter = Router();

const currencies = Intl.supportedValuesOf("currency");

class LedgerError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "LedgerError";
    this.status = status;
  }
}

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

function parseAmount(amount: string, digits: number): bigint {
  const [whole, fraction = ""] = amount.split(".");

  if (fraction.length > digits) {
    throw new LedgerError(
      `This currency allows at most ${digits} decimal places.`
    );
  }

  const value = BigInt(whole + fraction.padEnd(digits, "0"));

  if (value <= 0n) {
    throw new LedgerError("Amount must be greater than zero.");
  }

  return value;
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

const createSchema = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid(),
  version: z.number().int().positive(),
  direction: z.enum(["LENT", "BORROWED"]),
  kind: z.enum(["ADVANCE", "REPAYMENT"]),
  amount: z.string().regex(
    /^\d{1,12}(?:\.\d{1,4})?$/,
    "Enter a positive amount without commas."
  ),
  currency: z.string().refine(
    (value) => currencies.includes(value),
    "Choose a supported currency."
  ),
  purpose: z.string().trim().min(1).max(300),
  date: dateSchema,
}).strict();

function serialize(entry: ContactMoneyEntry) {
  return {
    id: entry.id,
    contactId: entry.contactId,
    direction: entry.direction,
    kind: entry.kind,
    amount: decimalString(entry.amountMinor, entry.minorUnit),
    currency: entry.currency,
    minorUnit: entry.minorUnit,
    purpose: entry.purpose,
    date: entry.entryDate.toISOString().slice(0, 10),
    deletedAt: entry.voidedAt?.toISOString() ?? null,
    legacyLoanId: entry.legacyLoanId,
    createdAt: entry.createdAt.toISOString(),
  };
}

function summarize(entries: ContactMoneyEntry[]) {
  const grouped = new Map<string, {
    currency: string;
    minorUnit: number;
    lent: bigint;
    borrowed: bigint;
    received: bigint;
    repaid: bigint;
  }>();

  for (const entry of entries) {
    if (entry.voidedAt) continue;

    const key = `${entry.currency}:${entry.minorUnit}`;

    const total = grouped.get(key) ?? {
      currency: entry.currency,
      minorUnit: entry.minorUnit,
      lent: 0n,
      borrowed: 0n,
      received: 0n,
      repaid: 0n,
    };

    if (entry.direction === "LENT") {
      if (entry.kind === "ADVANCE") {
        total.lent += entry.amountMinor;
      } else {
        total.received += entry.amountMinor;
      }
    } else if (entry.kind === "ADVANCE") {
      total.borrowed += entry.amountMinor;
    } else {
      total.repaid += entry.amountMinor;
    }

    grouped.set(key, total);
  }

  return [...grouped.values()]
    .sort((a, b) => a.currency.localeCompare(b.currency))
    .map((total) => ({
      currency: total.currency,
      minorUnit: total.minorUnit,
      totalLent: decimalString(total.lent, total.minorUnit),
      repaymentsReceived: decimalString(
        total.received,
        total.minorUnit
      ),
      owedToYou: decimalString(
        total.lent - total.received,
        total.minorUnit
      ),
      totalBorrowed: decimalString(
        total.borrowed,
        total.minorUnit
      ),
      repaymentsMade: decimalString(
        total.repaid,
        total.minorUnit
      ),
      youOwe: decimalString(
        total.borrowed - total.repaid,
        total.minorUnit
      ),
    }));
}

async function lockContact(
  tx: Prisma.TransactionClient,
  contactId: string,
  userId: string,
  version: number
) {
  const contact = await tx.contact.findFirst({
    where: { id: contactId, userId },
  });

  if (!contact) {
    throw new LedgerError("Contact not found.", 404);
  }

  const updated = await tx.contact.updateMany({
    where: {
      id: contactId,
      userId,
      version,
    },
    data: {
      version: { increment: 1 },
    },
  });

  if (updated.count !== 1) {
    throw new LedgerError(
      "This person’s records changed. Cancel your draft and reload.",
      409
    );
  }

  return contact;
}

// Validate running totals by person, direction, and currency.
// On the same date, advances are counted before repayments.
async function validateLedger(
  tx: Prisma.TransactionClient,
  contactId: string
) {
  const entries = await tx.contactMoneyEntry.findMany({
    where: {
      contactId,
      voidedAt: null,
    },
    orderBy: [
      { entryDate: "asc" },
      { kind: "asc" },
      { createdAt: "asc" },
    ],
  });

  const balances = new Map<string, bigint>();

  for (const entry of entries) {
    const key =
      `${entry.direction}:${entry.currency}:${entry.minorUnit}`;

    const previous = balances.get(key) ?? 0n;

    const next = entry.kind === "ADVANCE"
      ? previous + entry.amountMinor
      : previous - entry.amountMinor;

    if (next < 0n) {
      throw new LedgerError(
        "Repayments would exceed the money lent or borrowed on a recorded date. Check the amount/date, or delete the incorrect repayment first."
      );
    }

    balances.set(key, next);
  }
}

async function recordHistory(
  tx: Prisma.TransactionClient,
  entryId: string,
  action: string
) {
  const entry = await tx.contactMoneyEntry.findUniqueOrThrow({
    where: { id: entryId },
  });

  await tx.contactMoneyHistory.create({
    data: {
      entryId,
      action,
      snapshot: serialize(entry),
    },
  });

  return serialize(entry);
}

loansRouter.use(async (req, res, next) => {
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

// Keeps the existing dashboard LoanSummary component working.
loansRouter.get("/summary", async (req, res) => {
  const contactId = req.query.contactId === undefined
    ? undefined
    : z.string().uuid().parse(req.query.contactId);

  const entries = await prisma.contactMoneyEntry.findMany({
    where: {
      voidedAt: null,
      contact: {
        userId: req.session.userId!,
        ...(contactId ? { id: contactId } : {}),
      },
    },
  });

  res.json({ totals: summarize(entries) });
});

// Get one person's totals and timeline.
loansRouter.get("/", async (req, res) => {
  const contactId = z.string().uuid().parse(req.query.contactId);

  const contact = await prisma.contact.findFirst({
    where: {
      id: contactId,
      userId: req.session.userId!,
    },
    select: {
      id: true,
      name: true,
      nickname: true,
      isArchived: true,
      version: true,
    },
  });

  if (!contact) {
    throw new LedgerError("Contact not found.", 404);
  }

  const entries = await prisma.contactMoneyEntry.findMany({
    where: { contactId },
    orderBy: [
      { entryDate: "desc" },
      { createdAt: "desc" },
    ],
  });

  res.json({
    contact,
    entries: entries.map(serialize),
    totals: summarize(entries),
  });
});

// Create a money or repayment entry.
loansRouter.post("/", async (req, res) => {
  const data = createSchema.parse(req.body);
  const minorUnit = digitsFor(data.currency);
  const amountMinor = parseAmount(data.amount, minorUnit);

  const entry = await prisma.$transaction(async (tx) => {
    const contact = await lockContact(
      tx,
      data.contactId,
      req.session.userId!,
      data.version
    );

    if (contact.isArchived && data.kind === "ADVANCE") {
      throw new LedgerError(
        "Restore this contact before recording more money lent or borrowed."
      );
    }

    await tx.contactMoneyEntry.create({
      data: {
        id: data.id,
        contactId: data.contactId,
        direction: data.direction,
        kind: data.kind,
        amountMinor,
        currency: data.currency,
        minorUnit,
        purpose: data.purpose,
        entryDate: new Date(`${data.date}T00:00:00.000Z`),
      },
    });

    await validateLedger(tx, data.contactId);

    return recordHistory(tx, data.id, "CREATED");
  });

  res.status(201).json({ entry });
});

// Saved entries cannot be edited.
loansRouter.patch("/:id", (_req, res) => {
  res.setHeader("Allow", "DELETE");
  res.status(405).json({
    message: "Saved entries cannot be edited. Delete and recreate the entry.",
  });
});

// Delete from active totals, preserving the original record and history.
loansRouter.delete("/:id", async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);

  const data = z.object({
    version: z.number().int().positive(),
  }).strict().parse(req.body);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.contactMoneyEntry.findFirst({
      where: {
        id,
        contact: { userId: req.session.userId! },
      },
    });

    if (!existing || existing.voidedAt) {
      throw new LedgerError("Active entry not found.", 404);
    }

    await lockContact(
      tx,
      existing.contactId,
      req.session.userId!,
      data.version
    );

    const previousHistory = await tx.contactMoneyHistory.findFirst({
      where: { entryId: id },
      select: { id: true },
    });

    if (!previousHistory) {
      await recordHistory(tx, id, "IMPORTED_STATE");
    }

    await tx.contactMoneyEntry.update({
      where: { id },
      data: { voidedAt: new Date() },
    });

    await validateLedger(tx, existing.contactId);
    await recordHistory(tx, id, "DELETED");
  });

  res.json({ message: "Entry deleted and totals recalculated." });
});

loansRouter.get("/:id/history", async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);

  const entry = await prisma.contactMoneyEntry.findFirst({
    where: {
      id,
      contact: { userId: req.session.userId! },
    },
  });

  if (!entry) {
    throw new LedgerError("Entry not found.", 404);
  }

  const history = await prisma.contactMoneyHistory.findMany({
    where: { entryId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      action: true,
      snapshot: true,
      createdAt: true,
    },
  });

  const legacyHistory = entry.legacyLoanId
    ? await prisma.loanHistory.findMany({
        where: { loanId: entry.legacyLoanId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          action: true,
          snapshot: true,
          createdAt: true,
        },
      })
    : [];

  res.json({
    history,
    legacyHistory,
    entry: serialize(entry),
  });
});

const ledgerErrorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  next
) => {
  if (error instanceof LedgerError) {
    res.status(error.status).json({ message: error.message });
    return;
  }

  if (error instanceof z.ZodError) {
    res.status(400).json({
      message: error.issues[0]?.message ?? "Invalid entry.",
    });
    return;
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    res.status(409).json({
      message: "This entry may already be saved. Cancel and reload to check.",
    });
    return;
  }

  next(error);
};

loansRouter.use(ledgerErrorHandler);