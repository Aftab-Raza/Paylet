import "dotenv/config";
import express from "express";
import type { ErrorRequestHandler } from "express";

import { prisma } from "./lib/prisma.js";
import { sessionMiddleware } from "./lib/session.js";

import { authRouter } from "./routes/auth.js";
import { googleRouter } from "./routes/google.js";
import { profileRouter } from "./routes/profile.js";
import { expensesRouter } from "./routes/expenses.js";
import { contactsRouter } from "./routes/contacts.js";
import { loansRouter } from "./routes/loans.js";
import { reportsRouter } from "./routes/reports.js";
import { groupsRouter } from "./routes/groups.js";

const app = express();
const port = Number(process.env.PORT ?? 5000);
const appOrigin = process.env.APP_ORIGIN;

if (!appOrigin) {
  throw new Error("APP_ORIGIN is missing from backend/.env");
}

app.disable("x-powered-by");

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
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: "ok",
      message: "Paylet database is connected",
    });
  } catch (error) {
    console.error(
      "Database check failed:",
      error instanceof Error
        ? error.message
        : "Unknown database error"
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

  console.error("Request failed:", {
    name: error?.name,
    code: error?.code,
  });

  res.status(500).json({
    message: "Something went wrong. Please try again.",
  });
};

app.use(errorHandler);

async function start() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    app.listen(port, "127.0.0.1", () => {
      console.log(`Paylet API: http://localhost:${port}`);
      console.log("PostgreSQL query succeeded");
    });
  } catch (error) {
    console.error(
      "Startup failed:",
      error instanceof Error
        ? error.message
        : "Unknown startup error"
    );

    await prisma.$disconnect();
    process.exitCode = 1;
  }
}

void start();