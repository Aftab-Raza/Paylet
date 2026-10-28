import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import session from "express-session";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const { prisma } = await import("../src/lib/prisma.js");
const { groupsRouter } = await import("../src/routes/groups.js");

test("group invitations reuse one record on resend and retain owner and membership checks", async (t) => {
  const owner = randomUUID(), recipient = randomUUID(), groupId = randomUUID();
  let owned = true, member = false, known = true, writes = 0;
  function replace(target: any, key: string, fn: Function) { const original = target[key]; target[key] = fn; t.after(() => { target[key] = original; }); }
  replace(prisma.user, "findUnique", async () => ({ id: owner }));
  replace(prisma, "$transaction", async (fn: Function) => fn({
    splitGroup: { updateMany: async ({ where }: any) => { assert.equal(where.ownerId, owner); assert.equal(where.deletedAt, null); return { count: owned ? 1 : 0 }; } },
    user: { findUnique: async () => known ? { id: recipient } : null },
    splitMember: { findUnique: async () => member ? { id: randomUUID() } : null },
    splitInvitation: { upsert: async ({ where, create, update }: any) => {
      assert.deepEqual(where, { groupId_recipientId: { groupId, recipientId: recipient } });
      assert.deepEqual(create, { groupId, recipientId: recipient });
      assert.equal(update.status, "PENDING"); assert.equal(update.respondedAt, null);
      assert.ok(update.createdAt instanceof Date); writes++;
    } },
  }));
  const app = express();
  app.use(express.json(), session({ secret: "test-only-group-session-secret", resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => { req.session.userId = owner; next(); });
  app.use("/groups", groupsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const send = () => fetch(`http://127.0.0.1:${address.port}/groups/${groupId}/invitations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "priya" }) });
  try {
    assert.equal((await send()).status, 201); assert.equal((await send()).status, 201);
    member = true; assert.equal((await send()).status, 409); member = false;
    known = false; assert.equal((await send()).status, 404); known = true;
    owned = false; assert.equal((await send()).status, 404); assert.equal(writes, 2);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
