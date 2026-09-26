import "dotenv/config";
import express from "express";

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

app.listen(port, "127.0.0.1", () => {
  console.log(`Paylet API: http://localhost:${port}`);
});