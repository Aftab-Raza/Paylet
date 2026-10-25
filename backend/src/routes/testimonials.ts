import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

export const testimonialsRouter = Router();
const publicFields = { id: true, body: true, rating: true, createdAt: true, user: { select: { displayName: true, createdAt: true } } } as const;
function serialize(item: { id: string; body: string; rating: number | null; createdAt: Date; user: { displayName: string; createdAt: Date } }) {
  return { id: item.id, body: item.body, rating: item.rating, createdAt: item.createdAt,
    user: { displayName: item.user.displayName, memberSince: item.user.createdAt.toISOString().slice(0, 7) } };
}
const cursorSchema = z.object({ id: z.uuid(), createdAt: z.iso.datetime() }).strict();
testimonialsRouter.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false,
  message: { message: "Too many requests. Please try again shortly." } }));

testimonialsRouter.get("/", async (req, res) => {
  const query = z.object({ limit: z.coerce.number().int().min(1).max(12).default(12), cursor: z.string().max(512).optional() }).strict().safeParse(req.query);
  if (!query.success) { res.status(400).json({ message: "Invalid testimonial page." }); return; }
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (query.data.cursor) {
    try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(query.data.cursor, "base64url").toString())); }
    catch { res.status(400).json({ message: "Invalid testimonial cursor." }); return; }
  }
  const rows = await prisma.testimonial.findMany({ select: publicFields, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: query.data.limit + 1,
    ...(cursor ? { where: { OR: [{ createdAt: { lt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } }] } } : {}) });
  const page = rows.slice(0, query.data.limit);
  const last = page.at(-1);
  const nextCursor = rows.length > query.data.limit && last ? Buffer.from(JSON.stringify({ id: last.id, createdAt: last.createdAt.toISOString() })).toString("base64url") : null;
  res.json({ testimonials: page.map(serialize), nextCursor });
});

testimonialsRouter.use((req, res, next) => {
  if (!req.session.userId) { res.status(401).json({ message: "Sign in to write a testimonial." }); return; }
  next();
});
testimonialsRouter.get("/mine", async (req, res) => {
  const item = await prisma.testimonial.findUnique({ where: { userId: req.session.userId! }, select: publicFields });
  res.json({ testimonial: item ? serialize(item) : null });
});
const writeLimit = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { message: "Too many testimonial changes. Try again in 15 minutes." } });
const schema = z.object({ body: z.string().trim().min(10).max(600), rating: z.number().int().min(1).max(5).optional(), consent: z.literal(true) }).strict();
testimonialsRouter.put("/mine", writeLimit, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Write 10-600 characters, choose a valid rating, and confirm public sharing." }); return; }
  const testimonial = await prisma.testimonial.upsert({ where: { userId: req.session.userId! },
    create: { userId: req.session.userId!, body: parsed.data.body, rating: parsed.data.rating ?? null },
    update: { body: parsed.data.body, ...(parsed.data.rating !== undefined ? { rating: parsed.data.rating } : {}) }, select: publicFields });
  res.json({ testimonial: serialize(testimonial) });
});
testimonialsRouter.delete("/mine", writeLimit, async (req, res) => {
  await prisma.testimonial.deleteMany({ where: { userId: req.session.userId! } });
  res.json({ message: "Your testimonial has been removed." });
});
