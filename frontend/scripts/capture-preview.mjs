import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const user = { id: "demo-user", displayName: "Alex", username: "alex_demo", email: "demo@example.com", defaultCurrency: "INR", timezone: "Asia/Kolkata", avatarUrl: null, bio: null };
  const expenses = [
    { id: "demo-1", amount: "250.00", currency: "INR", purpose: "Lunch with friends", category: "Food", date: "2026-10-10", version: 1, voidedAt: null },
    { id: "demo-2", amount: "850.00", currency: "INR", purpose: "Weekly groceries", category: "Groceries", date: "2026-10-09", version: 1, voidedAt: null },
  ];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api", "");
    let data;
    if (path === "/auth/me") data = { user };
    else if (path === "/expenses/options") data = { currencies: ["INR", "USD"], categories: ["Food", "Groceries", "Travel", "Other"] };
    else if (path === "/expenses") data = { expenses, count: 2, totals: [{ currency: "INR", amount: "1100.00" }] };
    else if (path === "/groups/invitations") data = { invitations: [] };
    else if (path === "/groups/settlement-requests") data = { requests: [] };
    else if (path === "/loans/summary") data = { totals: [] };
    else throw new Error(`Unexpected preview request: ${path}`);
    await route.fulfill({ json: data });
  });
  await page.goto(`${process.env.PAYLET_PREVIEW_ORIGIN || "http://127.0.0.1:5190"}/?view=dashboard`);
  await page.getByRole("heading", { name: "Weekly groceries" }).waitFor();
  await mkdir("public", { recursive: true });
  await page.screenshot({ path: "public/paylet-preview.png" });
} finally { await browser.close(); }
