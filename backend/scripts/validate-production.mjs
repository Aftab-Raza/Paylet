import { access } from "node:fs/promises";

function requireSecret(name, minimum = 1) {
  const value = process.env[name] ?? "";
  if (value.length < minimum || /CHANGE_ME|replace_with|local-disabled|validation-only/i.test(value)) {
    throw new Error(`${name} must contain real production credentials`);
  }
}
if (process.env.NODE_ENV !== "production") throw new Error("NODE_ENV must be production");
requireSecret("SESSION_SECRET", 64);
requireSecret("GOOGLE_CLIENT_ID");
requireSecret("GOOGLE_CLIENT_SECRET");
const origin = new URL(process.env.APP_ORIGIN);
if (origin.protocol !== "https:" || origin.origin !== process.env.APP_ORIGIN ||
    ["localhost", "127.0.0.1"].includes(origin.hostname) || origin.hostname.endsWith(".example.com")) {
  throw new Error("APP_ORIGIN must be your real HTTPS domain");
}
if (process.env.GOOGLE_REDIRECT_URI !== origin.origin + "/api/auth/google/callback") {
  throw new Error("Google callback must match the production HTTPS origin");
}
requireSecret("DATABASE_URL");
const database = new URL(process.env.DATABASE_URL);
if (!["postgres:", "postgresql:"].includes(database.protocol) ||
    database.searchParams.get("sslmode") !== "verify-full") {
  throw new Error("DATABASE_URL must use PostgreSQL with sslmode=verify-full");
}
const certificate = database.searchParams.get("sslrootcert");
if (!certificate?.startsWith("/run/db-certs/")) throw new Error("Mount the provider CA under /run/db-certs");
await access(certificate);
console.log("Production HTTPS, credential, and database TLS configuration checks passed.");
