import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const { prisma } = await import("../src/lib/prisma.js");
const { testimonialsRouter } = await import("../src/routes/testimonials.js");

test("testimonials require login and consent, restrict writes to the session owner, and select public fields only", async (t) => {
  const calls: any[] = [];
  for (const method of ["findMany", "findUnique", "upsert", "deleteMany"] as const) {
    const original = prisma.testimonial[method];
    (prisma.testimonial as any)[method] = async (args: any) => {
      calls.push({ method, args });
      if (method === "findMany") return [];
      if (method === "deleteMany") return { count: 1 };
      return { id: "review", body: args.create?.body ?? "My experience", user: { displayName: "Alex" } };
    };
    t.after(() => { (prisma.testimonial as any)[method] = original; });
  }
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.session = { userId: req.get("x-test-user") } as any; next(); });
  app.use(testimonialsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const request = (path: string, method = "GET", body?: unknown, user?: string) => fetch(base + path, {
    method, headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": user } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal((await request("/")).status, 200);
  const select = calls[0].args.select;
  assert.deepEqual(select.user.select, { displayName: true });
  assert.equal(select.userId, undefined); assert.equal(calls[0].args.take, 12);
  for (const method of ["GET", "PUT", "DELETE"]) assert.equal((await request("/mine", method)).status, 401);
  assert.equal((await request("/mine", "PUT", { body: "A helpful app indeed", consent: false }, "alex")).status, 400);
  assert.equal((await request("/mine", "PUT", { body: "short", consent: true }, "alex")).status, 400);
  assert.equal((await request("/mine", "PUT", { body: "x".repeat(601), consent: true }, "alex")).status, 400);
  assert.equal((await request("/mine", "PUT", { body: "A helpful app indeed", consent: true, userId: "victim" }, "alex")).status, 400);
  assert.equal((await request("/mine", "PUT", { body: "  A helpful app indeed  ", consent: true }, "alex")).status, 200);
  const saved = calls.find((call) => call.method === "upsert").args;
  assert.deepEqual(saved.where, { userId: "alex" });
  assert.deepEqual(saved.create, { userId: "alex", body: "A helpful app indeed" });
  assert.equal((await request("/mine", "DELETE", undefined, "alex")).status, 200);
  assert.deepEqual(calls.find((call) => call.method === "deleteMany").args.where, { userId: "alex" });
});
