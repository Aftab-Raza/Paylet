import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { setTimeout } from "node:timers/promises";
import { request as httpRequest } from "node:http";

if (!process.argv.includes("--allow-test-account")) {
  throw new Error("Pass --allow-test-account to create and remove a temporary test account.");
}
const origin = "http://localhost:8080";
const base = "http://frontend";
const marker = randomBytes(8).toString("hex");
const email = `docker_${marker}@example.invalid`;
const password = randomBytes(24).toString("hex");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const sessionIds = new Set();
let cookie = "";
let userId;
async function request(path, options = {}) {
  // node:http preserves an explicit Host header when reaching nginx by service DNS.
  const response = await new Promise((resolve, reject) => {
    const outgoing = httpRequest(base + path, {
      method: options.method ?? "GET",
      headers: { Host: "localhost:8080", Origin: origin, Cookie: cookie, "Content-Type": "application/json", ...options.headers },
    }, (incoming) => {
      const chunks = [];
      incoming.on("data", (chunk) => chunks.push(chunk));
      incoming.on("error", reject);
      incoming.on("end", () => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) {
          for (const item of Array.isArray(value) ? value : [value]) {
            if (item !== undefined) headers.append(key, item);
          }
        }
        resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode, headers }));
      });
    });
    outgoing.on("error", reject);
    outgoing.setTimeout(15000, () => outgoing.destroy(new Error("HTTP test timed out")));
    outgoing.end(options.body);
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    cookie = setCookie.split(";")[0];
    const signed = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
    if (signed.startsWith("s:")) sessionIds.add(signed.slice(2, signed.lastIndexOf(".")));
  }
  return response;
}
try {
  await db.connect();
  assert.equal((await request("/api/health/db")).status, 200);
  const alias = await request("/api/auth/google", { headers: { Host: "127.0.0.1:8080" } });
  assert.equal(alias.status, 302);
  assert.equal(alias.headers.get("location"), origin + "/api/auth/google");
  assert.equal(alias.headers.get("set-cookie"), null);
  const register = await request("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, username: `docker_${marker}`, displayName: "Docker verification" }) });
  assert.equal(register.status, 201);
  userId = (await register.json()).user.id;
  assert.match(register.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(register.headers.get("set-cookie"), /SameSite=Lax/i);
  assert.doesNotMatch(register.headers.get("set-cookie"), /; Secure/i);
  assert.equal((await (await request("/api/auth/me")).json()).user.id, userId);
  assert.equal((await request("/api/auth/logout", { method: "POST", body: "{}" })).status, 200);
  assert.equal((await request("/api/auth/me")).status, 401);
  assert.equal((await request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) })).status, 200);
  assert.equal((await (await request("/api/auth/me")).json()).user.id, userId);
  assert.equal((await request("/api/auth/logout", { method: "POST", body: "{}", headers: { Origin: "https://untrusted.example" } })).status, 403);
  await request("/api/auth/logout", { method: "POST", body: "{}" });
  cookie = "";
  const start = await request("/api/auth/google");
  assert.equal(start.status, 302);
  const authorization = new URL(start.headers.get("location"));
  assert.equal(authorization.hostname, "accounts.google.com");
  assert.equal(authorization.searchParams.get("redirect_uri"), origin + "/api/auth/google/callback");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  const state = authorization.searchParams.get("state");
  assert.ok(state && authorization.searchParams.get("nonce"));
  const stored = await db.query("SELECT sess FROM user_sessions WHERE sid = ANY($1::text[])", [[...sessionIds]]);
  assert.ok(stored.rows.some(({ sess }) => sess.googleOAuth?.state === state));
  if (process.argv.includes("--wait-for-restart")) {
    console.log("OAuth state saved. Waiting 30 seconds for a backend restart before checking the callback.");
    await setTimeout(30000);
  }
  const wrongState = await request("/api/auth/google/callback?state=wrong&error=access_denied");
  assert.equal(new URL(wrongState.headers.get("location")).searchParams.get("google"), "expired");
  const callback = `/api/auth/google/callback?state=${encodeURIComponent(state)}&error=access_denied`;
  const cancelled = await request(callback);
  assert.equal(new URL(cancelled.headers.get("location")).searchParams.get("google"), "cancelled");
  const replay = await request(callback);
  assert.equal(new URL(replay.headers.get("location")).searchParams.get("google"), "expired");
  console.log("PASS: frontend proxy, canonical hostname, password signup/login/logout, cookies, origin protection, Google callback URL, PKCE, database-backed OAuth state, cancellation and replay rejection.");
  console.log("Real Google consent/token exchange still requires the registered Google client and a browser login.");
} finally {
  if (userId) await db.query("DELETE FROM users WHERE id = $1 AND email = $2", [userId, email]);
  if (sessionIds.size) await db.query("DELETE FROM user_sessions WHERE sid = ANY($1::text[])", [[...sessionIds]]);
  await db.end();
}
