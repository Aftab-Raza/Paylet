import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import session from "express-session";

// No real database is used; every accessed Prisma method is mocked below.
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const { prisma } = await import("../src/lib/prisma.js");
const { contactsRouter } = await import("../src/routes/contacts.js");
const { groupBillsRouter } = await import("../src/routes/groupBills.js");

function replace(t: TestContext, target: any, key: string, implementation: Function) {
  const original = target[key];
  target[key] = implementation;
  t.after(() => { target[key] = original; });
}

test("contact requests normalize usernames, validate input, and enforce ownership", async (t) => {
  const owner = randomUUID(), recipient = randomUUID(), contactId = randomUUID();
  let contactOwned = true, requested = "", writes = 0;
  replace(t, prisma.user, "findUnique", async () => ({ id: owner }));
  replace(t, prisma, "$transaction", async (fn: Function) => fn({
    contact: { findFirst: async ({ where }: any) => { assert.equal(where.userId, owner); return contactOwned ? { linkedUserId: null } : null; } },
    user: { findUnique: async ({ where }: any) => { requested = where.username; return requested === "priya_123" ? { id: recipient } : null; } },
    contactLinkRequest: { upsert: async ({ create }: any) => { assert.deepEqual(create, { contactId, recipientId: recipient }); writes++; } },
  }));
  const app = express();
  app.use(express.json(), session({ secret: "test-only-session-secret", resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => { req.session.userId = owner; next(); });
  app.use("/contacts", contactsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const send = (username: string) => fetch(`http://127.0.0.1:${address.port}/contacts/${contactId}/link-request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username }) });
  try {
    assert.equal((await send(" @Priya_123 ")).status, 201);
    assert.equal(requested, "priya_123");
    assert.equal((await send("bad username")).status, 400);
    assert.equal((await send("unknown")).status, 409);
    contactOwned = false;
    assert.equal((await send("priya_123")).status, 404);
    assert.equal(writes, 1);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("group bill routes enforce self payer and allow creator or owner deletion with audit", async (t) => {
  const owner = randomUUID(), creator = randomUUID(), other = randomUUID(), groupId = randomUUID();
  const members = [owner, creator, other, null].map((userId) => ({ id: randomUUID(), userId }));
  let viewer = creator, deleted = false, creates = 0;
  const audit: any[] = [];
  const person = { id: creator, displayName: "Creator", username: "creator" };
  const bill = { id: randomUUID(), groupId, creatorId: creator, creator: person, payerId: members[1].id,
    payer: { user: person }, amountMinor: 10000n, minorUnit: 2, currency: "INR", purpose: "Dinner", category: "Food",
    spentOn: new Date("2026-10-12"), splitMode: "EQUAL", deletedAt: null, createdAt: new Date(), shares: [] };
  replace(t, prisma, "$transaction", async (fn: Function) => fn({
    splitGroup: { updateMany: async ({ where }: any) => ({ count: members.some((m) => m.userId === where.members.some.userId) ? 1 : 0 }) },
    splitMember: { findMany: async () => members },
    sharedBill: {
      create: async ({ data }: any) => { assert.equal(data.payerId, members.find((m) => m.userId === viewer)?.id); creates++; return bill; },
      updateMany: async ({ where }: any) => {
        assert.equal(where.groupId, groupId);
        assert.equal(where.deletedAt, null);
        const authorized = where.OR.some((rule: any) => rule.creatorId === creator || rule.group?.ownerId === owner);
        if (deleted || !authorized) return { count: 0 };
        deleted = true; return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ ...bill, deletedAt: new Date() }),
    },
    sharedBillHistory: { create: async ({ data }: any) => { audit.push(data); } },
  }));
  const app = express();
  app.use(express.json(), session({ secret: "test-only-session-secret", resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => { req.session.userId = viewer; next(); });
  app.use("/groups/:groupId/bills", groupBillsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/groups/${groupId}/bills`;
  const create = (payerId: string) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: randomUUID(), amount: "100", currency: "INR", purpose: "Dinner", category: "Food", date: "2026-10-12", payerId, splitMode: "EQUAL", participants: members.map((m) => ({ memberId: m.id })) }) });
  const remove = () => fetch(`${url}/${bill.id}`, { method: "DELETE" });
  try {
    assert.equal((await create(members[0].id)).status, 403);
    assert.equal((await create(members[3].id)).status, 403);
    assert.equal((await create(members[1].id)).status, 201);
    viewer = owner;
    assert.equal((await create(members[1].id)).status, 403);
    viewer = other;
    assert.equal((await remove()).status, 409);
    viewer = owner;
    assert.equal((await remove()).status, 200);
    assert.equal(audit.at(-1).actorId, owner);
    assert.equal(audit.at(-1).action, "DELETED");
    assert.equal((await remove()).status, 409);
    deleted = false; viewer = creator;
    assert.equal((await remove()).status, 200);
    viewer = randomUUID();
    assert.equal((await remove()).status, 404);
    assert.equal(creates, 1);
    assert.equal(audit.length, 3);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
