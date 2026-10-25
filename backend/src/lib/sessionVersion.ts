import type { RequestHandler } from "express";
import { prisma } from "./prisma.js";

export const sessionVersionGuard: RequestHandler = async (req, _res, next) => {
  if (req.session.userId) {
    const user = await prisma.user.findUnique({ where: { id: req.session.userId }, select: { authVersion: true } });
    if (!user || user.authVersion !== (req.session.authVersion ?? 0)) {
      await new Promise<void>((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    }
  }
  next();
};
