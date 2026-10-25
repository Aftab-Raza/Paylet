import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import express from "express";
import argon2 from "argon2";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const { prisma } = await import("../src/lib/prisma.js");
const { passwordResetRouter } = await import("../src/routes/passwordReset.js");
const { sessionVersionGuard } = await import("../src/lib/sessionVersion.js");

test("reset tokens are hashed, expire, work once, and invalidate old sessions", async (t) => {
  const originalEnv = { key: process.env.RESEND_API_KEY, from: process.env.PASSWORD_RESET_FROM, origin: process.env.APP_ORIGIN };
  Object.assign(process.env, { RESEND_API_KEY: "fake-test-key", PASSWORD_RESET_FROM: "Paylet <test@example.com>", APP_ORIGIN: "https://example.com" });
  t.after(() => {
    for (const [key, value] of Object.entries({ RESEND_API_KEY: originalEnv.key, PASSWORD_RESET_FROM: originalEnv.from, APP_ORIGIN: originalEnv.origin })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const user = { id: randomUUID(), email: "alex@example.com", authVersion: 0, passwordHash: "" };
  let records: any[] = [];
  let link = "", sends = 0;
  function replace(target: any, key: string, fn: Function) { const old = target[key]; target[key] = fn; t.after(() => { target[key] = old; }); }
  replace(prisma.user, "findUnique", async ({ where }: any) => where.email ? (where.email === user.email ? user : null) : user);
  const tokens = {
    findUnique: async ({ where }: any) => records.find((r) => r.tokenHash === where.tokenHash) ?? null,
    count: async () => records.filter((r) => r.createdAt > new Date(Date.now() - 60_000)).length,
    create: async ({ data }: any) => { const record = { ...data, createdAt: new Date() }; records.push(record); return record; },
    deleteMany: async ({ where }: any) => {
      const matched = records.filter((r) => (!where.tokenHash || r.tokenHash === where.tokenHash) && (!where.userId || r.userId === where.userId) && (!where.expiresAt || r.expiresAt > where.expiresAt.gt));
      records = records.filter((r) => !matched.includes(r)); return { count: matched.length };
    },
  };
  replace(prisma.passwordResetToken, "findUnique", tokens.findUnique);
  replace(prisma.passwordResetToken, "deleteMany", tokens.deleteMany);
  replace(prisma, "$transaction", async (fn: Function) => fn({ $queryRaw: async () => [{ id: user.id }], passwordResetToken: tokens,
    user: { update: async ({ data }: any) => { user.passwordHash = data.passwordHash; user.authVersion++; return user; } } }));
  const actualFetch = globalThis.fetch;
  replace(globalThis, "fetch", async (input: any, init: any) => {
    if (input !== "https://api.resend.com/emails") return actualFetch(input, init);
    const body = JSON.parse(init.body);
    assert.deepEqual(body.to, [user.email]);
    link = body.text.match(/https:\/\/\S+/)[0]; sends++;
    return new Response(JSON.stringify({ id: randomUUID() }), { status: 200 });
  });
  const app = express(); app.use(express.json()); app.use(passwordResetRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const post = (path: string, body: unknown) => fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    const known = await post("/forgot-password", { email: " ALEX@example.com " });
    const knownBody = await known.json();
    const unknown = await post("/forgot-password", { email: "unknown@example.com" });
    assert.equal(known.status, 200); assert.deepEqual(await unknown.json(), knownBody);
    assert.equal(sends, 1);
    const url = new URL(link);
    assert.equal(url.origin, "https://example.com");
    assert.equal(url.searchParams.get("view"), "reset");
    const token = new URLSearchParams(url.hash.slice(1)).get("token")!;
    assert.equal(records[0].tokenHash, createHash("sha256").update(token).digest("hex"));
    assert.notEqual(records[0].tokenHash, token);
    assert.ok(records[0].expiresAt.getTime() > Date.now() + 29 * 60_000);
    await post("/forgot-password", { email: user.email });
    assert.equal(sends, 1, "per-account cooldown prevents email floods");
    const password = "my-new-long-password";
    const responses = await Promise.all([post("/reset-password", { token, password }), post("/reset-password", { token, password })]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 400]);
    assert.ok(await argon2.verify(user.passwordHash, password)); assert.equal(user.authVersion, 1);
    assert.equal((await post("/reset-password", { token, password })).status, 400);
    records = [{ tokenHash: createHash("sha256").update(token).digest("hex"), userId: user.id, expiresAt: new Date(Date.now() - 1), createdAt: new Date() }];
    assert.equal((await post("/reset-password", { token, password })).status, 400);
    delete process.env.RESEND_API_KEY;
    assert.equal((await post("/forgot-password", { email: user.email })).status, 503);
    let regenerated = false;
    const req: any = { session: { userId: user.id, authVersion: 0, regenerate: (callback: Function) => { regenerated = true; req.session = {}; callback(); } } };
    await sessionVersionGuard(req, {} as any, () => {});
    assert.ok(regenerated); assert.equal(req.session.userId, undefined);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
