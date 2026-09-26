import "dotenv/config";
import express from "express";
import type { ErrorRequestHandler } from "express";
import { prisma } from "./lib/prisma.js";
import { sessionMiddleware } from "./lib/session.js";
import { authRouter } from "./routes/auth.js";

const app = express();
const port = Number(process.env.PORT ?? 5000);
const appOrigin = process.env.APP_ORIGIN;

if (!appOrigin) {
  throw new Error("APP_ORIGIN is missing from backend/.env");
}

app.disable("x-powered-by");

// Check the origin of requests that change data.
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
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: "ok",
      message: "Paylet database is connected",
    });
  } catch (error) {
    console.error(
      "Database check failed:",
      error instanceof Error ? error.message : "Unknown database error"
    );

    res.status(503).json({
      status: "error",
      message: "Database is unavailable",
    });
  }
});

app.use("/api", sessionMiddleware);
app.use("/api/auth", authRouter);

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

  // Temporary diagnostics for local development.
  console.error("Request failed:", {
    name: error?.name,
    code: error?.code,
    message: error?.message,
  });

  res.status(500).json({
    message: "Something went wrong. Please try again.",
  });
};

app.use(errorHandler);

async function start() {
  try {
    await prisma.$connect();

    app.listen(port, "127.0.0.1", () => {
      console.log(`Paylet API: http://localhost:${port}`);
      console.log("Run /api/health/db to verify database queries.");
    });
  } catch (error) {
    console.error(
      "Startup failed:",
      error instanceof Error ? error.message : "Unknown startup error"
    );

    await prisma.$disconnect();
    process.exitCode = 1;
  }
}

void start();