import multer from "multer";
import sharp from "sharp";
import { Router } from "express";
import type { ErrorRequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { AiError, normalizeContact, parseQuickAdd, todayIn } from "../lib/aiParser.js";
import { createExpenseInTransaction } from "./expenses.js";
import { createLedgerInTransaction, LedgerError } from "./loans.js";

export const aiRouter = Router();
aiRouter.use(async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!req.session.userId) { res.status(401).json({ message: "Please log in." }); return; }
  const user = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { id: true, defaultCurrency: true, timezone: true } });
  if (!user) { res.status(401).json({ message: "Please log in again." }); return; }
  res.locals.aiUser = user;
  next();
});

const previewLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false,
  keyGenerator: (req) => req.session.userId!, message: { message: "You have used 20 AI previews. Try again in 15 minutes, or use the normal form." } });

aiRouter.post("/preview", previewLimiter, async (req, res) => {
  const { text } = z.object({ text: z.string().trim().min(3).max(2000) }).strict().parse(req.body);
  const user = res.locals.aiUser as { defaultCurrency: string; timezone: string };
  const draft = await parseQuickAdd(text, { today: todayIn(user.timezone), currency: user.defaultCurrency });
  // Names are matched locally. The provider never receives the contact directory.
  const contacts = await prisma.contact.findMany({ where: { userId: req.session.userId! }, select: { id: true, name: true, nickname: true } });
  const wanted = normalizeContact(draft.contactName ?? "");
  const matchedContactIds = wanted ? contacts.filter((contact) =>
    normalizeContact(contact.name) === wanted || normalizeContact(contact.nickname ?? "") === wanted
  ).map((contact) => contact.id) : [];
  res.json({ draft, matchedContactIds });
});

// Multipart bodies avoid the JSON body limit. Authenticate/rate-limit before
// accepting bytes. No uploaded photo is written to disk or the database.
const receiptUpload = multer({ storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 1, fields: 1, fieldSize: 8000, parts: 2 },
  fileFilter: (_req, file, callback) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      callback(new AiError("Upload a JPG, PNG or WebP photo (up to 6 MB). PDF/HEIC are not supported."));
    } else callback(null, true);
  },
});

aiRouter.post("/receipt-preview", previewLimiter, receiptUpload.single("bill"), async (req, res) => {
  if (!req.file) throw new AiError("Choose a bill photo first.");
  const { text } = z.object({ text: z.string().trim().max(2000).default("") }).strict().parse(req.body ?? {});
  let image: Buffer;
  try {
    const decoder = sharp(req.file.buffer, { limitInputPixels: 40_000_000, failOn: "error" });
    const meta = await decoder.metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format) || (meta.pages ?? 1) > 1) throw new Error("Unsupported image");
    image = await decoder.rotate().resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
  } catch {
    throw new AiError("The photo could not be opened. Use a clear, non-animated JPG, PNG or WebP under 6 MB and 40 megapixels.");
  }
  const user = res.locals.aiUser as { defaultCurrency: string; timezone: string };
  const draft = await parseQuickAdd(text, { today: todayIn(user.timezone), currency: user.defaultCurrency }, `data:image/jpeg;base64,${image.toString("base64")}`);
  res.json({ draft, matchedContactIds: [] });
});

const confirmedSchema = z.object({
  id: z.string().uuid(),
  intent: z.enum(["EXPENSE", "LENT", "BORROWED", "REPAYMENT_RECEIVED", "REPAYMENT_PAID"]),
  amount: z.string().max(30), currency: z.string().length(3), date: z.string().max(10),
  purpose: z.string().trim().max(200).default(""), category: z.string().max(40),
  contact: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("existing"), id: z.string().uuid(), version: z.number().int().positive() }).strict(),
    z.object({ mode: z.literal("new"), id: z.string().uuid(), name: z.string().trim().min(1).max(100) }).strict(),
  ]).nullable(),
}).strict();

type Receipt = { id: string; type: "EXPENSE" | "LEDGER"; contactId: string | null; alreadySaved: boolean };

// A client-generated entry UUID remains fixed for retries. The advisory transaction
// lock serializes simultaneous retries; contact/entry/history commit atomically.
aiRouter.post("/confirm", async (req, res) => {
  const data = confirmedSchema.parse(req.body);
  const userId = req.session.userId!;
  const result = await prisma.$transaction(async (tx): Promise<Receipt> => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`paylet-ai:${userId}:${data.id}`}, 0))::text`;
    const previousExpense = await tx.expense.findFirst({ where: { id: data.id, userId } });
    if (previousExpense) {
      if (previousExpense.voidedAt) throw new AiError("This entry was already saved and then deleted. Open your history before adding a new entry.", 409);
      return { id: data.id, type: "EXPENSE", contactId: null, alreadySaved: true };
    }
    const previousEntry = await tx.contactMoneyEntry.findFirst({ where: { id: data.id, contact: { userId } } });
    if (previousEntry) {
      if (previousEntry.voidedAt) throw new AiError("This entry was already saved and then deleted. Open the person's history before adding a new entry.", 409);
      return { id: data.id, type: "LEDGER", contactId: previousEntry.contactId, alreadySaved: true };
    }
    const common = { id: data.id, amount: data.amount, currency: data.currency, purpose: data.purpose, date: data.date };
    if (data.intent === "EXPENSE") {
      if (data.contact !== null) throw new AiError("A personal expense must not include a contact.");
      await createExpenseInTransaction(tx, userId, { ...common, category: data.category });
      return { id: data.id, type: "EXPENSE", contactId: null, alreadySaved: false };
    }
    if (!data.contact) throw new AiError("Choose a person before saving.");
    const repayment = data.intent === "REPAYMENT_RECEIVED" || data.intent === "REPAYMENT_PAID";
    let version: number;
    if (data.contact.mode === "new") {
      if (repayment) throw new AiError("Select an existing person with money owed to record a repayment.");
      // Deliberately create a private contact only, never a registered user.
      await tx.contact.create({ data: { id: data.contact.id, userId, name: data.contact.name } });
      version = 1;
    } else version = data.contact.version;
    await createLedgerInTransaction(tx, userId, { ...common, contactId: data.contact.id, version,
      direction: data.intent === "LENT" || data.intent === "REPAYMENT_RECEIVED" ? "LENT" : "BORROWED",
      kind: repayment ? "REPAYMENT" : "ADVANCE" });
    return { id: data.id, type: "LEDGER", contactId: data.contact.id, alreadySaved: false };
  });
  res.status(result.alreadySaved ? 200 : 201).json({ receipt: result });
});

const errors: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ message: "Upload one JPG, PNG or WebP photo up to 6 MB, with optional notes up to 2000 characters." }); return;
  }
  if (error instanceof AiError || error instanceof LedgerError) { res.status(error.status).json({ message: error.message }); return; }
  if (error instanceof z.ZodError) { res.status(400).json({ message: error.issues[0]?.message ?? "Check your entry." }); return; }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    res.status(409).json({ message: "An entry or contact with this ID already exists. Check your records before creating another." }); return;
  }
  next(error);
};
aiRouter.use(errors);
