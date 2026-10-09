import pg from "pg";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const backend = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const prismaPackagePath = require.resolve("prisma/package.json");
const prismaPackage = JSON.parse(readFileSync(prismaPackagePath, "utf8"));
const prismaCli = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
let args;
try {
  await client.connect();
  const { rows } = await client.query(`
    SELECT c.relname, c.relkind, n.nspname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  `);
  const appObjects = rows.filter((row) => !(row.nspname === "public" && row.relname === "user_sessions" && row.relkind === "r"));
  if (appObjects.length === 0) {
    args = [resolve(backend, "scripts/bootstrap-empty-db.mjs"), "--empty-database", "--allow-session-table"];
  } else if (rows.some((row) => row.nspname === "public" && row.relname === "_prisma_migrations")) {
    args = [prismaCli, "migrate", "deploy"];
  } else {
    throw Object.assign(new Error("Existing tables have no Prisma migration history."), { code: "UNMANAGED_SCHEMA" });
  }
} catch (error) {
  const code = typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? error.code : "UNKNOWN";
  console.error(`Docker database preparation failed (${code}). Check the original credentials and migration history. Keep the database volume; no reset or baseline was performed.`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
if (!process.exitCode && args) {
  const result = spawnSync(process.execPath, args, { cwd: backend, env: process.env, stdio: "inherit" });
  if (result.error || result.status !== 0) process.exitCode = 1;
  else console.log("Docker database schema is ready.");
}
