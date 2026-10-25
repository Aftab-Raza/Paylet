import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createHash, randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { resetEmailConfig, sendResetEmail } from "../lib/resetEmail.js";

export const passwordResetRouter = Router();
const limit = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { message: "Too many password-reset attempts. Try again in 15 minutes." } });
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const generic = "If an account uses that email, you will receive a password-reset link. Check your inbox and spam folder.";

passwordResetRouter.post("/forgot-password", limit, async (req, res) => {
  const started = performance.now();
  const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Enter a valid email address." }); return; }
  if (!resetEmailConfig()) { res.status(503).json({ message: "Password-reset emails are temporarily unavailable. Please try again later." }); return; }
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true, email: true } });
  if (user) {
    const token = randomBytes(32).toString("hex");
    const tokenHash = digest(token);
    const created = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
      const recent = await tx.passwordResetToken.count({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60_000) } } });
      if (recent) return false;
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await tx.passwordResetToken.create({ data: { tokenHash, userId: user.id, expiresAt: new Date(Date.now() + 30 * 60_000) } });
      return true;
    });
    if (created) {
      void sendResetEmail(user.email, token).catch(async () => {
        await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
        console.error("Password reset email delivery failed");
      }).catch(() => console.error("Password reset cleanup failed"));
    }
  }
  // Avoid a fast response revealing that no matching account was found.
  await delay(Math.max(0, 500 - (performance.now() - started)));
  res.json({ message: generic });
});

passwordResetRouter.post("/reset-password", limit, async (req, res) => {
  const parsed = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(12).max(128) }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Use a valid reset link and a password with 12 to 128 characters." }); return; }
  const tokenHash = digest(parsed.data.token);
  const candidate = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!candidate || candidate.expiresAt <= new Date()) { res.status(400).json({ message: "This reset link is invalid or expired. Request a new link." }); return; }
  const passwordHash = await argon2.hash(parsed.data.password, { type: argon2.argon2id });
  const reset = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${candidate.userId}::uuid FOR UPDATE`;
    const consumed = await tx.passwordResetToken.deleteMany({ where: { tokenHash, expiresAt: { gt: new Date() } } });
    if (consumed.count !== 1) return false;
    await tx.user.update({ where: { id: candidate.userId }, data: { passwordHash, authVersion: { increment: 1 } } });
    await tx.passwordResetToken.deleteMany({ where: { userId: candidate.userId } });
    return true;
  });
  if (!reset) { res.status(400).json({ message: "This reset link is invalid or expired. Request a new link." }); return; }
  res.json({ message: "Password updated. Sign in with your new password." });
});
