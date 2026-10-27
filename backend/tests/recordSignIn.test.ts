import assert from "node:assert/strict";
import test from "node:test";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const { prisma } = await import("../src/lib/prisma.js");
const { recordSignIn } = await import("../src/lib/recordSignIn.js");

test("successful sign-ins record a private timestamp without changing consent; ordering failure does not fail login", async (t) => {
  const original=prisma.user.update;
  const originalWarn=console.warn;
  let query:any;
  prisma.user.update=(async(args:any)=>{query=args;return {id:'alex'};}) as typeof prisma.user.update;
  t.after(()=>{prisma.user.update=original;console.warn=originalWarn;});
  await recordSignIn('alex');
  assert.deepEqual(query.where,{id:'alex'});
  assert.deepEqual(Object.keys(query.data),['lastLoginAt']);
  assert.ok(query.data.lastLoginAt instanceof Date);
  console.warn=()=>{};
  prisma.user.update=(async()=>{throw new Error('unavailable');}) as typeof prisma.user.update;
  await assert.doesNotReject(()=>recordSignIn('alex'));
});
