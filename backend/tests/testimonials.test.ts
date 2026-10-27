import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { randomUUID } from "node:crypto";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const { prisma } = await import("../src/lib/prisma.js");
const { testimonialsRouter } = await import("../src/routes/testimonials.js");

test("testimonials require login and consent, restrict writes to the session owner, and select public fields only", async (t) => {
  const calls: any[] = [];
  let rows: any[] = [];
  for (const method of ["findMany", "findUnique", "upsert", "deleteMany"] as const) {
    const original = prisma.testimonial[method];
    (prisma.testimonial as any)[method] = async (args: any) => {
      calls.push({ method, args });
      if (method === "findMany") return rows;
      if (method === "deleteMany") return { count: 1 };
      return { id: randomUUID(), body: args.create?.body ?? "My experience", rating: args.create?.rating ?? null, photoConsent: args.create?.photoConsent ?? false, createdAt: new Date(), user: { displayName: "Alex", avatarUrl: "https://example.com/alex.webp", createdAt: new Date("2026-01-01T00:00:00Z") } };
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
  assert.deepEqual(select.user.select, { displayName: true, createdAt: true, avatarUrl: true });
  assert.equal(select.userId, undefined); assert.equal(calls[0].args.take, 13);
  for (const method of ["GET", "PUT", "DELETE"]) assert.equal((await request("/mine", method)).status, 401);
  assert.equal((await request("/mine", "PUT", { body: "A helpful app indeed", consent: false }, "alex")).status, 400);
  assert.equal((await request("/mine", "PUT", { body: "short", consent: true }, "alex")).status, 400);
  assert.equal((await request("/mine", "PUT", { body: "x".repeat(601), consent: true }, "alex")).status, 400);
  assert.equal((await request("/mine", "PUT", { body: "A helpful app indeed", consent: true, userId: "victim" }, "alex")).status, 400);
  assert.equal((await request("/mine", "PUT", { body: "  A helpful app indeed  ", consent: true }, "alex")).status, 200);
  const saved = calls.find((call) => call.method === "upsert").args;
  assert.deepEqual(saved.where, { userId: "alex" });
  assert.deepEqual(saved.create, { userId: "alex", body: "A helpful app indeed", rating: null, photoConsent: false });
  for (const rating of [0, 6, 2.5, "5"]) assert.equal((await request("/mine", "PUT", { body: "A helpful app indeed", consent: true, rating }, "alex")).status, 400);
  const rated = await request("/mine", "PUT", { body: "A helpful app indeed", consent: true, rating: 4 }, "alex");
  assert.equal(rated.status, 200);
  const ratedBody = await rated.json();
  assert.equal(ratedBody.testimonial.rating, 4);
  assert.deepEqual(ratedBody.testimonial.user, { displayName: "Alex", memberSince: "2026-01", avatarUrl: null });
  const optedIn = await (await request("/mine", "PUT", { body: "A helpful app indeed", consent: true, rating: 5, photoConsent: true }, "alex")).json();
  assert.equal(optedIn.testimonial.user.avatarUrl, "https://example.com/alex.webp");
  const optedOut = await (await request("/mine", "PUT", { body: "A helpful app indeed", consent: true, rating: 5, photoConsent: false }, "alex")).json();
  assert.equal(optedOut.testimonial.user.avatarUrl, null);
  rows = [{ user: { displayName: "Alex", avatarUrl: "https://example.com/alex.webp" } }, { user: { displayName: "Unsafe", avatarUrl: "javascript:alert(1)" } }];
  const community = await (await request("/community")).json();
  assert.deepEqual(community.users, [{ displayName: "Alex", avatarUrl: "https://example.com/alex.webp" }]);
  const communityQuery = calls.at(-1).args;
  assert.equal(communityQuery.where.photoConsent, true);
  assert.equal(communityQuery.take, 5);
  assert.deepEqual(communityQuery.select, { user: { select: { displayName: true, avatarUrl: true } } });
  rows = Array.from({ length: 7 }, () => ({ id: randomUUID(), body: "A public review", rating: null, createdAt: new Date("2026-10-26T00:00:00Z"), user: { displayName: "Alex", createdAt: new Date("2026-01-01T00:00:00Z") } }));
  const first = await (await request("/?limit=6")).json();
  assert.equal(first.testimonials.length, 6); assert.ok(first.nextCursor);
  await request(`/?limit=6&cursor=${first.nextCursor}`);
  assert.ok(calls.filter((call) => call.method === "findMany").at(-1).args.where.OR);
  assert.equal((await request("/?limit=100")).status, 400);
  assert.equal((await request("/?cursor=bad")).status, 400);
  assert.equal((await request("/mine", "DELETE", undefined, "alex")).status, 200);
  assert.deepEqual(calls.find((call) => call.method === "deleteMany").args.where, { userId: "alex" });
});
