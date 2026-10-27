import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const { prisma } = await import("../src/lib/prisma.js");
const { communityRouter } = await import("../src/routes/community.js");

test("community statistics expose only a cached aggregate account count", async (t) => {
  const original = prisma.user.count;
  let reads = 0;
  prisma.user.count = (async () => { reads++; return 1250; }) as typeof prisma.user.count;
  t.after(() => { prisma.user.count = original; });
  const app = express(); app.use(communityRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/stats`;
  const responses = await Promise.all([fetch(url), fetch(url)]);
  for (const response of responses) { assert.equal(response.status, 200); assert.deepEqual(await response.json(), { users: 1250 }); }
  assert.equal(reads, 1);
});

test("community faces come from opted-in sign-ins without testimonial or private login fields", async (t) => {
  const original = prisma.user.findMany;
  let query: any;
  prisma.user.findMany = (async (args: any) => { query=args; return [{ displayName: "Alex", avatarUrl: "https://example.com/alex.webp" }, { displayName: "Unsafe", avatarUrl: "javascript:alert(1)" }]; }) as typeof prisma.user.findMany;
  t.after(() => { prisma.user.findMany=original; });
  const app=express(); app.use(communityRouter);
  const server=app.listen(0,"127.0.0.1");
  await new Promise<void>((resolve)=>server.once("listening",resolve));
  t.after(()=>new Promise<void>((resolve)=>server.close(()=>resolve())));
  const response=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/recent-users`);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{users:[{displayName:"Alex",avatarUrl:"https://example.com/alex.webp"}]});
  assert.deepEqual(query.where,{communityPhotoConsent:true,lastLoginAt:{not:null},avatarUrl:{not:null}});
  assert.deepEqual(query.orderBy,[{lastLoginAt:"desc"},{id:"desc"}]);
  assert.deepEqual(query.select,{displayName:true,avatarUrl:true});
  assert.equal(query.take,5);
  assert.equal(response.headers.get('cache-control'),'no-store');
});
