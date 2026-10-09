import pg from "pg";

// Use the container's exact connection settings without printing credentials.
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  query_timeout: 5000,
});
try {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error(), { code: "MISSING_DATABASE_URL" });
  await client.connect();
  await client.query("SELECT 1");
  console.log("PostgreSQL connection and query: OK");
} catch (error) {
  const code = typeof error?.code === "string" && /^[A-Z0-9_]{2,40}$/.test(error.code)
    ? error.code : "UNKNOWN";
  console.error(`PostgreSQL check failed: ${code}`);
  const hints = {
    "28P01": "Password authentication failed. The root .env password may differ from the password stored when the Docker volume was initialized. Restore the original credentials; do not delete the volume.",
    "28000": "Database role/authentication rejected. Check the original Docker database user.",
    "3D000": "The configured database does not exist. Check the database name used when the Docker volume was initialized.",
    ECONNREFUSED: "Database connection refused. Check the db container logs and port.",
    ENOTFOUND: "Database hostname did not resolve. Run this check through the backend Compose service.",
    EAI_AGAIN: "Database hostname lookup failed. Check the Compose network and db service.",
  };
  if (hints[code]) console.error(hints[code]);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
