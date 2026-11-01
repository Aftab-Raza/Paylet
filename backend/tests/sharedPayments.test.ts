import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import session from "express-session";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const { prisma } = await import("../src/lib/prisma.js");
const { sharedPaymentsRouter } = await import("../src/routes/sharedPayments.js");

test("shared payments require two parties, enforce access and create one audited repayment", async (t) => {
  const owner = randomUUID(), borrower = randomUUID(), outsider = randomUUID(), entryId = randomUUID(), contactId = randomUUID();
  let viewer = borrower, shared = true, kind = "ADVANCE", direction = "LENT", priorRepayment = 0n;
  const source = { id: entryId, contactId, kind, direction, amountMinor: 10000n, currency: "INR", minorUnit: 2, purpose: "Dinner", entryDate: new Date("2026-01-01"), createdAt: new Date("2026-01-01"), voidedAt: null, contact: { userId: owner, linkedUserId: borrower, version: 1 }, share: { recipientId: borrower } };
  let request: any = null, entries: any[] = [], audit: any[] = [];
  const replace = (target: any, key: string, fn: Function) => { const old = target[key]; target[key] = fn; t.after(() => { target[key] = old; }); };
  const tx: any = {
    contactMoneyShare: { findFirst: async ({ where }: any) => shared && where.recipientId === borrower && where.entry.kind === kind && where.entry.direction === direction ? { entry: source } : null },
    sharedPaymentRequest: {
      findUnique: async () => request,
      create: async ({ data }: any) => { request = { ...data, status: "PENDING", version: 1 }; },
      findFirst: async ({ where }: any) => where.entry.contact.userId === owner && request ? { ...request, entry: { ...source, share: shared ? source.share : null } } : null,
      updateMany: async ({ where, data }: any) => {
        if (!request || request.status !== where.status || request.version !== where.version) return { count: 0 };
        request = { ...request, ...data, version: request.version + 1 }; return { count: 1 };
      },
      update: async ({ data }: any) => { request = { ...request, ...data }; },
    },
    contact: { findFirst: async ({ where }: any) => where.userId === owner ? source.contact : null, updateMany: async () => ({ count: 1 }) },
    contactMoneyEntry: {
      create: async ({ data }: any) => { entries.push({ ...data, createdAt: new Date(), voidedAt: null }); },
      findMany: async () => [source, ...(priorRepayment ? [{ ...source, kind: "REPAYMENT", amountMinor: priorRepayment }] : []), ...entries],
      findUniqueOrThrow: async ({ where }: any) => entries.find(e => e.id === where.id),
    },
    contactMoneyHistory: { create: async ({ data }: any) => { audit.push(data); } },
  };
  replace(prisma, "$transaction", async (fn: Function) => {
    const backup = structuredClone({ request, entries, audit });
    try { return await fn(tx); } catch (err) { ({ request, entries, audit } = backup); throw err; }
  });
  const app = express(); app.use(express.json(), session({ secret: "test-only-shared-payment-secret", resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => { req.session.userId = viewer; next(); }); app.use(sharedPaymentsRouter);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const post = (path: string, body = {}) => fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const paid = () => post(`/shared-entries/${entryId}/paid`);
  const respond = (action: string, version = request.version) => post(`/payment-requests/${entryId}/respond`, { action, version });
  try {
    viewer = outsider; assert.equal((await paid()).status, 404);
    viewer = borrower; kind = "REPAYMENT"; assert.equal((await paid()).status, 404); kind = "ADVANCE";
    direction = "BORROWED"; assert.equal((await paid()).status, 404); direction = "LENT";
    assert.equal((await paid()).status, 200); assert.equal((await paid()).status, 200); assert.equal(entries.length, 0);
    assert.equal((await respond("CONFIRM")).status, 404);
    viewer = owner; assert.equal((await respond("DECLINE")).status, 200); assert.equal(entries.length, 0);
    viewer = borrower; assert.equal((await paid()).status, 200);
    viewer = owner; assert.equal((await respond("CONFIRM", 1)).status, 409);
    shared = false; assert.equal((await respond("CONFIRM")).status, 409); shared = true;
    priorRepayment = 5000n; assert.equal((await respond("CONFIRM")).status, 400); assert.equal(entries.length, 0); assert.equal(request.status, "PENDING"); priorRepayment = 0n;
    assert.equal((await respond("CONFIRM")).status, 200); assert.equal(entries.length, 1); assert.equal(entries[0].kind, "REPAYMENT"); assert.equal(entries[0].amountMinor, 10000n); assert.equal(audit.length, 1);
    assert.equal((await respond("CONFIRM", 1)).status, 200); assert.equal(entries.length, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
