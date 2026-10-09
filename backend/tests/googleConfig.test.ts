import assert from "node:assert/strict";
import test from "node:test";
import { googleConfig } from "../src/lib/googleConfig.js";
const local = { APP_ORIGIN: "http://localhost:8080", GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret" };
test("Google callback defaults to the public frontend origin", () => {
  assert.equal(googleConfig(local).redirectUri, "http://localhost:8080/api/auth/google/callback");
});
test("rejects mismatched callback hosts, ports and paths", () => {
  for (const callback of ["http://localhost:5000/api/auth/google/callback", "http://127.0.0.1:8080/api/auth/google/callback", "http://localhost:8080/api/auth/google/callback/"]) {
    assert.throws(() => googleConfig({ ...local, GOOGLE_REDIRECT_URI: callback }), /GOOGLE_REDIRECT_URI must be/);
  }
});
test("existing development and production origins remain supported", () => {
  for (const APP_ORIGIN of ["http://localhost:5173", "https://finance.example.com"]) {
    assert.equal(googleConfig({ ...local, APP_ORIGIN }).redirectUri, `${APP_ORIGIN}/api/auth/google/callback`);
  }
});
