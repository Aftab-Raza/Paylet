import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { prisma } from "../lib/prisma.js";

export const communityRouter = Router();
let cached: { users: number; expiresAt: number } | undefined;
let pending: Promise<number> | undefined;
communityRouter.get("/stats", rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false,
  message: { message: "Too many requests. Please try again shortly." } }), async (_req, res) => {
  if (cached && cached.expiresAt > Date.now()) { res.json({ users: cached.users }); return; }
  // Collapse concurrent cache misses; expose only an aggregate, never account details.
  if (!pending) pending = prisma.user.count().then((users) => {
    cached = { users, expiresAt: Date.now() + 60_000 };
    return users;
  }).finally(() => { pending = undefined; });
  res.json({ users: await pending });
});
