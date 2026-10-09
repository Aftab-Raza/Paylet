import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export function authenticatedCloudProxy(secret: string): RequestHandler {
  const expected = Buffer.from(secret);
  return (req, res, next) => {
    // Render health checks do not pass through Vercel and never create sessions.
    if (req.method === "GET" && ["/health", "/health/db"].includes(req.path)) {
      next();
      return;
    }
    const supplied = Buffer.from(req.get("x-paylet-origin-secret") ?? "");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      res.status(403).json({ message: "Request must use the app's public address." });
      return;
    }
    if (!req.secure) {
      res.status(403).json({ message: "HTTPS is required." });
      return;
    }
    next();
  };
}
