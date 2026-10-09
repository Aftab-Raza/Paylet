import "dotenv/config";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Only for a NEW, EMPTY deployment database. Existing databases use migrate deploy.
const backend = fileURLToPath(new URL("../", import.meta.url));
const usersMigration = "20260926080728_create_users";
const require = createRequire(import.meta.url);
const prismaPackagePath = require.resolve("prisma/package.json");
const prismaPackage = JSON.parse(await readFile(prismaPackagePath, "utf8"));
const prismaCli = resolve(dirname(prismaPackagePath), prismaPackage.bin.prisma);
if (process.argv[2] !== "--empty-database") {
  throw new Error("Explicit --empty-database flag required. Do not use on your existing Paylet database.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const url = new URL(process.env.DATABASE_URL);
if (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public") {
  throw new Error("This bootstrap supports only the public schema.");
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
function prisma(args) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: backend, env: process.env, stdio: "inherit",
  });
  if (result.error || result.status !== 0) throw new Error(`Prisma ${args[1]} failed. Stop and inspect the output; do not reset the database.`);
}
let usersCreated = false;
try {
  await client.connect();
  // Serializes this bootstrap with itself. Do not run other migration jobs concurrently.
  await client.query("SELECT pg_advisory_lock(738194201)");
  const { rows } = await client.query(`
    SELECT c.relname, c.relkind, n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  `);
  // First sign-in attempts can create the session store before app migrations run.
  const allowSessionTable = process.argv.includes("--allow-session-table");
  const existingAppObjects = rows.filter((row) => !(allowSessionTable &&
    row.nspname === "public" && row.relname === "user_sessions" && row.relkind === "r"));
  if (existingAppObjects.length) throw new Error("Database is not empty. No changes made. Use migrate deploy for an existing database.");
  const sql = await readFile(new URL(`../prisma/migrations/${usersMigration}/migration.sql`, import.meta.url), "utf8");
  await client.query("BEGIN");
  await client.query("SET LOCAL search_path TO public");
  await client.query(sql);
  await client.query("COMMIT");
  usersCreated = true;
  // Mark only the original SQL we just executed, then apply the remaining history.
  prisma(["migrate", "resolve", "--applied", usersMigration]);
  prisma(["migrate", "deploy"]);
  console.log("Fresh Paylet database initialized. Original migration files remain unchanged.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(error instanceof Error ? error.message : "Bootstrap failed");
  if (usersCreated) {
    console.error("Users SQL was committed. Do not rerun bootstrap or reset. Inspect migration status; see docs/stage-1.md for recovery.");
  }
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
