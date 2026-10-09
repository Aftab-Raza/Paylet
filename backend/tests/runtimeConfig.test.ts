import assert from "node:assert/strict";
import test from "node:test";
import { runtimeConfig } from "../src/lib/runtimeConfig.js";

const local = { APP_ORIGIN: "http://localhost:5173" };
test("local development does not trust forwarded headers", () => {
  assert.equal(runtimeConfig(local).trustProxy, false);
  assert.equal(runtimeConfig(local).host, "127.0.0.1");
});
test("production rejects HTTP origins and malformed origins", () => {
  assert.throws(() => runtimeConfig({ ...local, NODE_ENV: "production" }));
  for (const value of ["https://paylet.example/", "https://paylet.example/path", "https://user:pass@paylet.example", "file:///app"]) {
    assert.throws(() => runtimeConfig({ APP_ORIGIN: value }));
  }
});
test("production supports an explicitly trusted proxy and container binding", () => {
  const result = runtimeConfig({ NODE_ENV: "production", APP_ORIGIN: "https://paylet.example", HOST: "0.0.0.0", TRUST_PROXY: "172.30.0.2,::1" });
  assert.deepEqual(result.trustProxy, ["172.30.0.2", "::1"]);
  assert.equal(result.host, "0.0.0.0");
});
test("rejects blanket trust, hop counts, and invalid CIDRs", () => {
  for (const value of ["true", "1", "0.0.0.0/0", "::/0", "127.0.0.1/33", "::1/129", "127.0.0.1/a"]) {
    assert.throws(() => runtimeConfig({ ...local, TRUST_PROXY: value }));
  }
});
test("rejects invalid listen ports", () => {
  for (const value of ["0", "65536", "-1", "foo", "5000.5"]) {
    assert.throws(() => runtimeConfig({ ...local, PORT: value }));
  }
});
