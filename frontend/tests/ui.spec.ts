import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const user = { id: "user-1", displayName: "Aftab", username: "aftab", email: "test@example.com", defaultCurrency: "INR", timezone: "Asia/Kolkata", avatarUrl: null, bio: null };
const initialExpense = { id: "expense-1", amount: "250.00", currency: "INR", purpose: "Lunch with friends", category: "Food", date: "2026-10-10", version: 1, voidedAt: null };

// Intercept every API request so these UI checks never touch a real database.
async function mockApi(page: Page, signedIn = true) {
  let expenses = [{ ...initialExpense }];
  const writes: { method: string; path: string; body: Record<string, unknown> }[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api", "");
    const method = request.method();
    const body = request.postDataJSON() ?? {};
    if (method !== "GET") writes.push({ method, path, body });
    let data: unknown = {};
    let status = 200;
    if (path === "/auth/me") { data = signedIn ? { user } : { message: "Not signed in" }; status = signedIn ? 200 : 401; }
    else if (path === "/expenses/options") data = { currencies: ["INR", "USD"], categories: ["Food", "Travel", "Other"] };
    else if (path === "/expenses" && method === "GET") data = { expenses, count: expenses.filter((item) => !item.voidedAt).length, totals: [{ currency: "INR", amount: "250.00" }] };
    else if (path === "/expenses" && method === "POST") { expenses.push({ ...body, version: 1, voidedAt: null } as typeof initialExpense); data = {}; }
    else if (path === "/expenses/expense-1" && method === "PATCH") { expenses = expenses.map((item) => item.id === "expense-1" ? { ...item, ...body } : item); }
    else if (path.endsWith("/history")) data = { history: [{ id: "rev-1", action: "CREATED", createdAt: "2026-10-10T09:00:00Z", snapshot: initialExpense }] };
    else if (path === "/loans/summary") data = { totals: [] };
    else if (path === "/groups/invitations") data = { invitations: [] };
    else if (path === "/groups/settlement-requests") data = { requests: [] };
    else if (path === "/groups") data = { viewerId: user.id, groups: [] };
    else if (path === "/contacts") data = { contacts: [] };
    else if (path === "/profile") data = { user };
    else if (path.startsWith("/reports")) data = { month: "2026-10", name: "October 2026", count: 0, currencies: [], expenses: [] };
    else { status = 404; data = { message: `Unmocked endpoint: ${path}` }; }
    await route.fulfill({ status, json: data });
  });
  return writes;
}

test("expense modal saves the existing API contract and edit keeps the version", async ({ page }) => {
  const writes = await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Add expense", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add expense", exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("Amount", { exact: true })).toBeFocused();
  await page.getByLabel("Amount", { exact: true }).fill("125.50");
  await page.getByLabel("Purpose", { exact: true }).fill("Bus ticket");
  await page.getByLabel("Category", { exact: true }).selectOption("Travel");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Bus ticket" })).toBeVisible();
  expect(writes[0]).toMatchObject({ method: "POST", path: "/expenses", body: { amount: "125.50", purpose: "Bus ticket", category: "Travel", currency: "INR" } });
  expect(writes[0].body.id).toEqual(expect.any(String));
  await page.getByRole("article").filter({ hasText: "Lunch with friends" }).getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Amount", { exact: true }).fill("300");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes[1]).toMatchObject({ method: "PATCH", path: "/expenses/expense-1", body: { version: 1, amount: "300" } });
});

test("dialog traps focus, Escape closes, filters and history work", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  const add = page.getByRole("button", { name: "Add expense", exact: true }).first();
  await add.click();
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(add).toBeFocused();
  await page.getByLabel("Search expenses").fill("unmatched");
  await expect(page.getByText("No matching expenses")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Expense history" })).toContainText("CREATED");
});

test("failed save stays in the dialog and retains the draft", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/expenses", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({ status: 503, json: { message: "Please try again." } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Add expense", exact: true }).first().click();
  await page.getByLabel("Amount", { exact: true }).fill("12");
  await page.getByLabel("Purpose", { exact: true }).fill("Keep this draft");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("Please try again.");
  await expect(page.getByLabel("Purpose", { exact: true })).toHaveValue("Keep this draft");
});

test("invitation is a private-data-free signup link and opens registration", async ({ page, context }) => {
  const writes = await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Invite a friend" }).click();
  const invite = await page.getByLabel("Invitation link").inputValue();
  expect(invite).toBe("http://127.0.0.1:5187/?join=paylet");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy invite link" }).click();
  await expect(page.getByRole("status")).toContainText("Invitation link copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(invite);
  expect(writes).toHaveLength(0);
  const recipient = await context.newPage();
  await mockApi(recipient, false);
  await recipient.goto(invite);
  await expect(recipient.getByLabel("Your name")).toBeVisible();
  await expect(recipient.getByRole("button", { name: "Create account", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
});

test("void requires confirmation and keeps the version contract", async ({ page }) => {
  const writes = await mockApi(page);
  await page.route("**/api/expenses/expense-1/void", (route) => route.fulfill({ json: {} }));
  await page.goto("/");
  await page.getByRole("button", { name: "Void", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Lunch with friends");
  await page.getByRole("button", { name: "Keep expense" }).click();
  expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: "Void", exact: true }).click();
  const request = page.waitForRequest((item) => item.url().endsWith("/expense-1/void"));
  await page.getByRole("button", { name: "Void expense", exact: true }).click();
  expect((await request).postDataJSON()).toEqual({ version: 1 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const width of [320, 360, 390, 768, 1440]) {
  test(`layout and dialogs fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Lunch with friends" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/dashboard-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Add expense", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `test-results/expense-modal-${width}.png` });
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.getByRole("button", { name: "Invite a friend" }).click();
    await page.screenshot({ path: `test-results/invite-${width}.png` });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "People", exact: true }).click();
    await page.getByRole("button", { name: "Add person", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Add a person" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.screenshot({ path: `test-results/people-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await page.getByRole("button", { name: "Groups", exact: true }).click();
    await page.getByRole("button", { name: "Create group", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Create a group" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await page.screenshot({ path: `test-results/groups-${width}.png`, fullPage: true });
    const visitor = await page.context().newPage();
    await mockApi(visitor, false);
    await visitor.goto("/?join=paylet");
    await expect(visitor.getByLabel("Your name")).toBeVisible();
    expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await visitor.screenshot({ path: `test-results/signup-${width}.png`, fullPage: true });
  });
}
