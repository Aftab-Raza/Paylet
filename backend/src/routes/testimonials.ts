import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

export const testimonialsRouter = Router();
const publicFields = { id: true, body: true, createdAt: true, user: { select: { displayName: true } } } as const;
testimonialsRouter.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false,
  message: { message: "Too many requests. Please try again shortly." } }));

testimonialsRouter.get("/", async (_req, res) => {
  const testimonials = await prisma.testimonial.findMany({ select: publicFields, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 12 });
  res.json({ testimonials });
});

testimonialsRouter.use((req, res, next) => {
  if (!req.session.userId) { res.status(401).json({ message: "Sign in to write a testimonial." }); return; }
  next();
});
testimonialsRouter.get("/mine", async (req, res) => {
  res.json({ testimonial: await prisma.testimonial.findUnique({ where: { userId: req.session.userId! }, select: publicFields }) });
});
const writeLimit = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { message: "Too many testimonial changes. Try again in 15 minutes." } });
const schema = z.object({ body: z.string().trim().min(10).max(600), consent: z.literal(true) }).strict();
testimonialsRouter.put("/mine", writeLimit, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Write 10-600 characters and confirm public sharing." }); return; }
  const testimonial = await prisma.testimonial.upsert({ where: { userId: req.session.userId! },
    create: { userId: req.session.userId!, body: parsed.data.body }, update: { body: parsed.data.body }, select: publicFields });
  res.json({ testimonial });
});
testimonialsRouter.delete("/mine", writeLimit, async (req, res) => {
  await prisma.testimonial.deleteMany({ where: { userId: req.session.userId! } });
  res.json({ message: "Your testimonial has been removed." });
});
