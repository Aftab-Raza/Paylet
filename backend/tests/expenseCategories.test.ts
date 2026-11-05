import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const { prisma } = await import("../src/lib/prisma.js");
const { expensesRouter } = await import("../src/routes/expenses.js");
const { resolveCategory, categoryNameSchema } = await import("../src/lib/expenseCategories.js");

test("custom categories normalize, deduplicate and remain private across create, options and expense writes", async t => {
  const owner = randomUUID(), stranger = randomUUID();
  const rows = new Map<string, { userId: string; name: string; normalizedName: string }>();
  let expenseWrites = 0;
  function replace(target: any, key: string, implementation: Function) { const original = target[key]; target[key] = implementation; t.after(() => { target[key] = original; }); }
  replace(prisma.user, "findUnique", async ({ where }: any) => ({ id: where.id }));
  replace(prisma.expenseCategory, "upsert", async ({ where, create, update }: any) => {
    const scope = where.userId_normalizedName;
    assert.equal(scope.userId, create.userId); assert.equal(scope.normalizedName, create.normalizedName); assert.deepEqual(update, {});
    const key = `${scope.userId}:${scope.normalizedName}`;
    if (!rows.has(key)) rows.set(key, create);
    return rows.get(key);
  });
  replace(prisma.expenseCategory, "findMany", async ({ where, select }: any) => { assert.deepEqual(select, { name: true }); return [...rows.values()].filter(row => row.userId === where.userId); });
  replace(prisma.expenseCategory, "findUnique", async ({ where }: any) => { const scope = where.userId_normalizedName; return rows.get(`${scope.userId}:${scope.normalizedName}`) ?? null; });
  const tx = { expenseCategory: prisma.expenseCategory,
    expense: {
      create: async ({ data }: any) => { expenseWrites++; assert.equal(data.userId, owner); return { ...data, version: 1, voidedAt: null }; },
      update: async ({ where, data }: any) => { expenseWrites++; assert.equal(where.userId, owner); assert.equal(where.version, 1); return { ...data, id: where.id, version: 2, voidedAt: null }; },
    }, expenseRevision: { create: async ({ data }: any) => { assert.equal(data.snapshot.category, "Hostel Fees"); } },
  };
  replace(prisma, "$transaction", async (fn: Function) => fn(tx));
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.session = { userId: req.get("x-test-user") } as any; next(); });
  app.use("/expenses", expensesRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/expenses`;
  const request = (path: string, body?: object, user: string = owner, method = body ? "POST" : "GET") => fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": user } : {}) }, body: body ? JSON.stringify(body) : undefined });
  assert.equal((await request("/options", undefined, "")).status, 401);
  assert.equal((await request("/categories", { name: "Mine" }, "")).status, 401);
  for (const name of [" ", "x".repeat(41), "bad\u0000name", "\u200b"]) assert.equal((await request("/categories", { name })).status, 400);
  assert.equal((await request("/categories", { name: "Injected", userId: stranger })).status, 400);
  assert.deepEqual(await (await request("/categories", { name: "  Hostel   Fees  " })).json(), { category: "Hostel Fees" });
  assert.deepEqual(await (await request("/categories", { name: "hostel fees" })).json(), { category: "Hostel Fees" });
  assert.deepEqual(await (await request("/categories", { name: "Ｆｏｏｄ" })).json(), { category: "Food" });
  assert.equal(rows.size, 1);
  assert.ok((await (await request("/options")).json()).categories.includes("Hostel Fees"));
  assert.ok(!(await (await request("/options", undefined, stranger)).json()).categories.includes("Hostel Fees"));
  const input = { id: randomUUID(), amount: "12.50", currency: "INR", purpose: "Hostel", category: "HOSTEL FEES", date: "2026-11-05" };
  assert.equal((await request("/", input, stranger)).status, 400); assert.equal(expenseWrites, 0);
  const created = await request("/", input); assert.equal(created.status, 201); assert.equal((await created.json()).expense.category, "Hostel Fees");
  const { id, ...change } = input;
  const edited = await request(`/${id}`, { ...change, version: 1 }, owner, "PATCH"); assert.equal(edited.status, 200); assert.equal((await edited.json()).expense.category, "Hostel Fees");
  await assert.rejects(resolveCategory(prisma, stranger, categoryNameSchema.parse("Hostel Fees")), /Choose one of your categories/);
  assert.equal(expenseWrites, 2);
});
