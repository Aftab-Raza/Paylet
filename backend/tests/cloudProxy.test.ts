import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import session from "express-session";
import { rateLimit } from "express-rate-limit";
import { authenticatedCloudProxy } from "../src/lib/cloudProxy.js";
import { runtimeConfig } from "../src/lib/runtimeConfig.js";

test("authenticated cloud traffic receives secure cookies; direct traffic cannot create sessions", async () => {
  const secret = "ab".repeat(32);
  const config = runtimeConfig({ NODE_ENV: "production", APP_ORIGIN: "https://paylet-iota.vercel.app", TRUST_PROXY: "render-vercel", RENDER: "true", ORIGIN_SECRET: secret });
  const app = express();
  app.set("trust proxy", config.trustProxy);
  app.use("/api", authenticatedCloudProxy(config.proxySecret!));
  app.get("/api/health/db", (_req, res) => { res.json({ status: "ok" }); });
  app.use(session({ secret: "session-test-only-secret", resave: false, saveUninitialized: false, cookie: { secure: true, httpOnly: true, sameSite: "lax" } }));
  app.use("/api/test-session", rateLimit({ windowMs: 60000, limit: 2, standardHeaders: true, legacyHeaders: false }));
  app.get("/api/test-session", (req, res) => {
    req.session.userId = "test-only";
    res.json({ ip: req.ip, secure: req.secure });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((done) => server.once("listening", done));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const forwarding = { "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.1, 198.51.100.2" };
  try {
    for (const headers of [forwarding, { ...forwarding, "x-paylet-origin-secret": "wrong" }]) {
      const response = await fetch(base + "/api/test-session", { headers });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("set-cookie"), null);
    }
    const http = await fetch(base + "/api/test-session", { headers: { "x-paylet-origin-secret": secret } });
    assert.equal(http.status, 403);
    const allowed = await fetch(base + "/api/test-session", { headers: { ...forwarding, "x-paylet-origin-secret": secret } });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { ip: "203.0.113.1", secure: true });
    assert.match(allowed.headers.get("set-cookie") ?? "", /; Secure/);
    assert.match(allowed.headers.get("set-cookie") ?? "", /HttpOnly/);
    assert.match(allowed.headers.get("set-cookie") ?? "", /SameSite=Lax/);
    assert.equal((await fetch(base + "/api/health/db")).status, 200);
  } finally {
    await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
  }
});
