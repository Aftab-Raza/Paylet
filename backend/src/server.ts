import "dotenv/config";
import express from "express";
import type { ErrorRequestHandler } from "express";

import { prisma } from "./lib/prisma.js";
import { sessionMiddleware, sessionPool } from "./lib/session.js";

import { authRouter } from "./routes/auth.js";
import { googleRouter } from "./routes/google.js";
import { profileRouter } from "./routes/profile.js";
import { expensesRouter } from "./routes/expenses.js";
import { contactsRouter } from "./routes/contacts.js";
import { loansRouter } from "./routes/loans.js";
import { reportsRouter } from "./routes/reports.js";
import { groupsRouter } from "./routes/groups.js";

import { aiRouter } from "./routes/ai.js";

import { runtimeConfig } from "./lib/runtimeConfig.js";

const app = express();
const { port, host, appOrigin, trustProxy } = runtimeConfig(process.env);
app.disable("x-powered-by");
app.set("trust proxy", trustProxy);
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

// Protect requests that change data.
app.use("/api", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  if (req.get("origin") !== appOrigin) {
    res.status(403).json({
      message: "Request origin is not allowed.",
    });
    return;
  }

  next();
});

app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "Paylet backend is connected",
  });
});

app.get("/api/health/db", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");

  try {
    await prisma.$queryRaw`SELECT 1 FROM users LIMIT 1`;

    res.json({
      status: "ok",
      message: "Paylet database is connected",
    });
  } catch (error) {
    console.error(
      "Database check failed:",
      error instanceof Error ? error.name : "Unknown database error"
    );

    res.status(503).json({
      status: "error",
      message: "Database is unavailable",
    });
  }
});

app.use("/api", sessionMiddleware);

app.use("/api/auth", googleRouter);
app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/ai", aiRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/contacts", contactsRouter);
app.use("/api/loans", loansRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/groups", groupsRouter);

const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next
) => {
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({
      message: "Invalid JSON.",
    });
    return;
  }

  // Avoid logging Prisma query arguments, personal data, or provider credentials.
  console.error("Request failed:", { name: error?.name, code: error?.code });
  res.status(500).json({
    message: "Something went wrong. Please try again.",
  });
};

app.use(errorHandler);

async function closeDatabaseConnections() {
  await Promise.all([prisma.$disconnect(), sessionPool.end()]);
}

async function start() {
  try {
    await prisma.$queryRaw`SELECT 1 FROM users LIMIT 1`;
    const server = app.listen(port, host, () => {
      console.log(`Paylet API listening on ${host}:${port}`);
      console.log("PostgreSQL query succeeded");
    });
    let stopping = false;
    const shutdown = (exitCode = 0) => {
      if (stopping) return;
      stopping = true;
      // Allow in-flight requests and session writes to finish before closing pools.
      const deadline = setTimeout(() => process.exit(1), 10_000);
      deadline.unref();
      server.close(() => {
        void closeDatabaseConnections().then(() => {
          clearTimeout(deadline);
          process.exitCode = exitCode;
        }).catch(() => {
          console.error("Database cleanup failed");
          process.exit(1);
        });
      });
    };
    server.on("error", (error: NodeJS.ErrnoException) => {
      console.error("HTTP server failed:", { code: error.code });
      shutdown(1);
    });
    process.once("SIGTERM", () => shutdown());
    process.once("SIGINT", () => shutdown());
  } catch (error) {
    // Log codes only: Prisma messages and metadata can contain connection details.
    const failure = error as {
      code?: unknown;
      meta?: { code?: unknown; driverAdapterError?: { cause?: { originalCode?: unknown } } };
    } | null;
    const safeCode = (value: unknown) =>
      typeof value === "string" && /^[A-Z0-9_]{2,40}$/.test(value) ? value : undefined;
    console.error("Startup failed:", {
      name: error instanceof Error ? error.name : "UnknownError",
      code: safeCode(failure?.code),
      databaseCode: safeCode(failure?.meta?.code),
      driverCode: safeCode(failure?.meta?.driverAdapterError?.cause?.originalCode),
    });
    await closeDatabaseConnections();
    process.exitCode = 1;
  }
}

void start();
