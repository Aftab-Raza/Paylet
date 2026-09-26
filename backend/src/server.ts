import "dotenv/config";
import express from "express";
import { prisma } from "./lib/prisma.js";

const app = express();
const port = Number(process.env.PORT ?? 5000);

app.disable("x-powered-by");
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
  } catch {
    res.status(503).json({
      status: "error",
      message: "Database is unavailable",
    });
  }
});

async function start() {
  try {
    await prisma.$connect();

    app.listen(port, "127.0.0.1", () => {
      console.log(`Paylet API: http://localhost:${port}`);
      console.log("PostgreSQL connected");
    });
  } catch {
    console.error(
      "Could not connect to PostgreSQL. Check the service and backend/.env."
    );

    await prisma.$disconnect();
    process.exitCode = 1;
  }
}

void start();