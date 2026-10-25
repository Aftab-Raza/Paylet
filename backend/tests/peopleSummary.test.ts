import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const { prisma } = await import("../src/lib/prisma.js");
const { loansRouter } = await import("../src/routes/loans.js");

test("people totals are owner-scoped, exclude voids, and keep directions and currencies separate", async (t) => {
  const originalUser = prisma.user.findUnique;
  const originalEntries = prisma.contactMoneyEntry.findMany;
  prisma.user.findUnique = (async () => ({ id: "owner" })) as any;
  let scope: unknown;
  prisma.contactMoneyEntry.findMany = (async ({ where }: any) => {
    scope = where;
    return [
      { direction: "LENT", kind: "ADVANCE", amountMinor: 10000n },
      { direction: "LENT", kind: "REPAYMENT", amountMinor: 2500n },
      { direction: "BORROWED", kind: "ADVANCE", amountMinor: 6000n },
      { direction: "BORROWED", kind: "REPAYMENT", amountMinor: 1000n },
      { direction: "LENT", kind: "ADVANCE", amountMinor: 50000n, voidedAt: new Date() },
      { direction: "LENT", kind: "ADVANCE", amountMinor: 500n, currency: "USD" },
    ].map((entry) => ({ contactId: "contact-1", currency: "INR", minorUnit: 2, voidedAt: null, ...entry }));
  }) as any;
  t.after(() => { prisma.user.findUnique = originalUser; prisma.contactMoneyEntry.findMany = originalEntries; });
  const app = express();
  app.use((req, _res, next) => { req.session = { userId: req.get("x-test-user") } as any; next(); });
  app.use(loansRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/people-summary`;
  assert.equal((await fetch(url)).status, 401);
  const response = await fetch(url, { headers: { "x-test-user": "owner" } });
  assert.equal(response.status, 200);
  assert.deepEqual(scope, { voidedAt: null, contact: { userId: "owner" } });
  const { summaries } = await response.json();
  assert.equal(summaries.length, 1); assert.equal(summaries[0].contactId, "contact-1");
  const [inr, usd] = summaries[0].totals;
  assert.equal(inr.totalLent, "100.00"); assert.equal(inr.totalBorrowed, "60.00");
  assert.equal(inr.owedToYou, "75.00"); assert.equal(inr.youOwe, "50.00");
  assert.equal(usd.currency, "USD"); assert.equal(usd.owedToYou, "5.00");
});
