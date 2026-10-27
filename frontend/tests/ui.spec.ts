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
    else if (path === "/loans/people-summary") data = { summaries: [] };
    else if (path === "/groups/invitations") data = { invitations: [] };
    else if (path === "/groups/settlement-requests") data = { requests: [] };
    else if (path === "/groups") data = { viewerId: user.id, groups: [] };
    else if (path === "/contacts/link-requests") data = { requests: [] };
    else if (path === "/contacts/shared-entries") data = { entries: [] };
    else if (path === "/contacts") data = { contacts: [] };
    else if (path === "/profile") data = { user };
    else if (path === "/community/stats") data = { users: 1250 };
    else if (path === "/testimonials/community") data = { users: [] };
    else if (path === "/testimonials") data = { testimonials: [] };
    else if (path === "/testimonials/mine") data = { testimonial: null };
    else if (path.startsWith("/reports")) data = { month: "2026-10", name: "October 2026", count: 0, currencies: [], expenses: [] };
    else { status = 404; data = { message: `Unmocked endpoint: ${path}` }; }
    await route.fulfill({ status, json: data });
  });
  return writes;
}

test("expense modal saves the existing API contract and edit keeps the version", async ({ page }) => {
  const writes = await mockApi(page);
  await page.goto("/?view=dashboard");
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
  await page.goto("/?view=dashboard");
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
  await page.goto("/?view=dashboard");
  await page.getByRole("button", { name: "Add expense", exact: true }).first().click();
  await page.getByLabel("Amount", { exact: true }).fill("12");
  await page.getByLabel("Purpose", { exact: true }).fill("Keep this draft");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("Please try again.");
  await expect(page.getByLabel("Purpose", { exact: true })).toHaveValue("Keep this draft");
});

test("invitation is a private-data-free signup link and opens registration", async ({ page, context }) => {
  const writes = await mockApi(page);
  await page.goto("/?view=dashboard");
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
  await page.goto("/?view=dashboard");
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

test("past money entries remain hidden until individually shared", async ({ page }) => {
  await mockApi(page);
  let shared = false;
  await page.route("**/api/contacts/shared-entries", (route) => route.fulfill({ json: {
    entries: shared ? [{ id: "entry-1", owner: { displayName: "Alex" }, direction: "BORROWED", kind: "REPAYMENT", amount: "100.00", currency: "INR", purpose: "Old repayment", date: "2026-10-01" }] : [],
  } }));
  await page.goto("/?view=dashboard");
  await page.getByRole("button", { name: "People", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Shared with you" })).toHaveCount(0);
  await expect(page.getByText("Old repayment")).toHaveCount(0);
  shared = true;
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("Old repayment")).toBeVisible();
  await expect(page.getByText(/repayment · borrowed from you/)).toBeVisible();
});

test("People still shows contacts when optional sharing requests fail", async ({ page }) => {
  await mockApi(page);
  const contacts = [{
    id: "contact-1", name: "Priya", nickname: null, notes: null,
    isArchived: false, version: 1, createdAt: "2026-10-01", updatedAt: "2026-10-01",
    linkedUser: null, linkRequest: null,
  }];
  await page.route("**/api/contacts", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      contacts.push({ ...contacts[0], ...body, nickname: body.nickname || null, notes: body.notes || null });
      return route.fulfill({ status: 201, json: { contact: contacts.at(-1) } });
    }
    return route.fulfill({ json: { contacts } });
  });
  await page.route("**/api/contacts/link-requests", (route) => route.fulfill({ status: 503, json: { message: "Request failed. Please try again." } }));
  await page.route("**/api/contacts/shared-entries", (route) => route.fulfill({ status: 503, json: { message: "Request failed. Please try again." } }));
  await page.goto("/?view=dashboard");
  await page.getByRole("button", { name: "People", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Priya" })).toBeVisible();
  await expect(page.getByText("Connection requests or shared entries are temporarily unavailable. Your contacts are still here.")).toHaveCount(0);
  await page.getByRole("button", { name: "Add person" }).click();
  await page.getByLabel("Name", { exact: true }).fill("New contact");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByRole("heading", { name: "New contact" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Priya" })).toBeVisible();
});

test("People sends username requests and preserves the form after a failure", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/contacts", (route) => route.fulfill({ json: { contacts: [{ id: "contact-1", name: "Priya", nickname: null, notes: null, isArchived: false, version: 1, linkedUser: null, linkRequest: null }] } }));
  let fail = true;
  await page.route("**/api/contacts/contact-1/link-request", (route) => {
    expect(route.request().postDataJSON()).toEqual({ username: "@Priya_123" });
    return route.fulfill({ status: fail ? 409 : 201, json: { message: fail ? "No Paylet account has that username." : "Connection request sent." } });
  });
  await page.goto("/?view=dashboard");
  await page.getByRole("button", { name: "People", exact: true }).click();
  await page.getByRole("button", { name: "Connect to Paylet account" }).click();
  await page.getByLabel("Their exact Paylet username").fill("@Priya_123");
  await page.getByRole("button", { name: "Send connection request" }).click();
  await expect(page.getByRole("alert")).toHaveText("No Paylet account has that username.");
  await expect(page.getByLabel("Their exact Paylet username")).toHaveValue("@Priya_123");
  fail = false;
  await page.getByRole("button", { name: "Send connection request" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Connection request sent." })).toBeVisible();
});

for (const owner of [true, false]) {
  test(`group payer is self and other member bill deletion is ${owner ? "allowed for owner" : "hidden for member"}`, async ({ page }) => {
    await mockApi(page);
    const other = { id: "other-user", displayName: "Priya", username: "priya" };
    const members = [{ id: "self-member", userId: user.id, user }, { id: "other-member", userId: other.id, user: other }, { id: "offline-member", userId: null, user: { id: "", displayName: "Offline friend", username: "" } }];
    await page.route("**/api/groups", (route) => route.fulfill({ json: { viewerId: user.id, groups: [{ id: "group-1", name: "Weekend", ownerId: owner ? user.id : other.id, members }] } }));
    await page.route("**/api/groups/group-1/invitations", (route) => route.fulfill({ json: { invitations: [] } }));
    let deleted = false;
    await page.route("**/api/groups/group-1/bills", (route) => {
      if (route.request().method() === "POST") {
        expect(route.request().postDataJSON().payerId).toBe("self-member");
        expect(route.request().postDataJSON().participants).toContainEqual({ memberId: "offline-member" });
        return route.fulfill({ status: 201, json: {} });
      }
      return route.fulfill({ json: { balances: [], bills: [{ ...initialExpense, id: "bill-1", creatorId: other.id, creator: other, payer: other, deletedAt: deleted ? "2026-10-12" : null, shares: [] }] } });
    });
    await page.route("**/api/groups/group-1/bills/bill-1", (route) => { expect(route.request().method()).toBe("DELETE"); deleted = true; return route.fulfill({ json: {} }); });
    await page.goto("/?view=dashboard");
    await page.getByRole("button", { name: "Groups", exact: true }).click();
    await page.getByRole("button", { name: /Open group/ }).click();
    const bill = page.getByRole("article").filter({ hasText: "Lunch with friends" });
    await expect(bill).toBeVisible();
    await expect(bill.getByRole("button", { name: "Delete", exact: true })).toHaveCount(owner ? 1 : 0);
    await page.getByRole("button", { name: "+ Add expense", exact: true }).click();
    await expect(page.getByLabel("Who paid?")).toHaveAttribute("readonly", "");
    await expect(page.getByLabel("Who paid?")).toHaveValue("Aftab (You)");
    await page.getByLabel("Total amount").fill("100");
    await page.getByLabel("Purpose", { exact: true }).fill("Dinner");
    await page.getByRole("button", { name: "Save shared expense" }).click();
    await expect(page.getByText(/Bill saved/)).toBeVisible();
    if (owner) {
      page.once("dialog", (dialog) => dialog.accept());
      await bill.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(bill).toHaveCount(0);
      await page.getByLabel("Show deleted bills").check();
      await expect(bill).toBeVisible();
      await expect(bill.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
    }
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Your groups", exact: true })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole("heading", { name: "Weekend", exact: true })).toBeVisible();
  });
}

test("public homepage opens login and registration and supports browser back", async ({ page }) => {
  await mockApi(page, false);
  await page.route("**/api/auth/login", (route) => route.fulfill({ json: { user } }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Paylet.", exact: true })).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText("About Paylet");
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await expect(page.getByLabel("Your name")).toBeVisible();
  await expect(page).toHaveURL(/view=register/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Paylet.", exact: true })).toBeVisible();
  await page.getByRole("banner").getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByLabel("Email address").fill("test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: /Hello, Aftab/ })).toBeVisible();
  await expect(page).toHaveURL(/view=dashboard/);
  await page.reload();
  await expect(page.getByLabel("Email address")).toBeVisible();
});

test("logout requires confirmation, cancel preserves session, and failure can retry", async ({ page }) => {
  await mockApi(page);
  let logoutCalls = 0;
  await page.route("**/api/auth/logout", (route) => {
    logoutCalls++;
    return route.fulfill({ status: logoutCalls === 1 ? 503 : 200, json: { message: logoutCalls === 1 ? "Please try again." : "Logged out." } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Log out of Paylet?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button")).toHaveCount(2);
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(logoutCalls).toBe(0);
  await page.getByRole("banner").getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "My profile" }).click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await dialog.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Please try again.");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Paylet.", exact: true })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("button", { name: "Log in", exact: true })).toBeVisible();
  expect(logoutCalls).toBe(2);
});

test("Google error returns still open authentication instead of hiding on homepage", async ({ page }) => {
  await mockApi(page, false);
  await page.goto("/?google=expired");
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByText("Google sign-in expired. Please try again.")).toBeVisible();
});

for (const width of [320, 390, 1440]) {
  test(`lending balances are legible and homepage fits ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await page.route("**/api/loans/summary", (route) => route.fulfill({ json: { totals: [{ currency: "INR", minorUnit: 2, totalLent: "5000.00", repaymentsReceived: "1000.00", owedToYou: "4000.00", totalBorrowed: "3000.00", repaymentsMade: "500.00", youOwe: "2500.00" }] } }));
    await page.goto("/?view=dashboard");
    const outstanding = page.locator(".outstanding-line");
    await expect(outstanding).toContainText("You still owe");
    await expect(outstanding).toContainText("₹ 2500.00");
    const contrast = await outstanding.evaluate((element) => {
      const luminance = (color: string) => {
        const linear = color.match(/\d+/g)!.slice(0, 3).map(Number).map((value) => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; });
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
      };
      const text = luminance(getComputedStyle(element.querySelector("dt")!).color);
      const background = luminance(getComputedStyle(element.closest(".loan-summary-card")!).backgroundColor);
      return (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await outstanding.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/lending-${width}.png`, fullPage: true });
    await page.goto("/");
    const hero = page.locator(".landing-interactive-hero");
    await expect(hero).toBeVisible();
    const preview = page.locator(".landing-product");
    await preview.scrollIntoViewIfNeeded();
    await expect.poll(() => preview.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.evaluate(() => scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const nextSection = await page.locator("#about").boundingBox();
    expect(nextSection!.y).toBeLessThan(900);
    const copy = await page.locator(".landing-hero-copy").boundingBox();
    const image = await hero.boundingBox();
    expect(copy!.y).toBeGreaterThanOrEqual(image!.y);
    expect(copy!.y + copy!.height).toBeLessThanOrEqual(image!.y + image!.height);
    const header = await page.getByRole("banner").boundingBox();
    const title = await page.locator("#landing-title").boundingBox();
    expect(header!.y + header!.height).toBeLessThanOrEqual(title!.y);
    await page.getByText("Do I need to connect my bank account?", { exact: true }).click();
    await expect(page.getByText("No. Paylet records the expenses and money entries you add.", { exact: false })).toBeVisible();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `test-results/landing-${width}.png`, fullPage: true });
  });
}

test("cinematic hero fits short phones and wide screens with a visible next section", async ({ page }) => {
  await mockApi(page, false);
  for (const [width, height] of [[320, 568], [390, 844], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Get started", exact: true })).toBeVisible();
    const hero = await page.locator(".landing-hero").boundingBox();
    const title = await page.locator("#landing-title").boundingBox();
    const header = await page.getByRole("banner").boundingBox();
    const action = await page.getByRole("button", { name: "Get started", exact: true }).boundingBox();
    expect(header!.y + header!.height).toBeLessThanOrEqual(title!.y);
    expect(action!.y + action!.height).toBeLessThanOrEqual(hero!.y + hero!.height);
    expect((await page.locator("#about").boundingBox())!.y).toBeLessThan(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator(".hero-split")).toBeVisible();
    await page.screenshot({ path: `test-results/cinematic-${width}-${height}.png` });
  }
});

test("theme preference persists and compact expense rows retain their actions", async ({ page }) => {
  await mockApi(page);
  await page.goto("/?view=dashboard");
  if (await page.locator("html").getAttribute("data-theme") === "dark") await page.getByRole("button", { name: "Switch to light mode" }).click();
  const expense = page.getByRole("article").filter({ hasText: "Lunch with friends" });
  await expect(expense).toBeVisible();
  expect(await expense.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  for (const name of ["Edit", "Void", "History"]) {
    const action = expense.getByRole("button", { name, exact: true });
    await expect(action).toBeVisible();
    await expect(action).toHaveAttribute("title", name);
    expect(await action.evaluate((element) => element.getBoundingClientRect().width)).toBe(40);
  }
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("heading", { name: "Lunch with friends" })).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard-dark.png", fullPage: true });
  await page.getByRole("button", { name: "Add expense", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.getByRole("dialog").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(10, 10, 10)");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page.screenshot({ path: "test-results/dashboard-purple-light.png", fullPage: true });
});

test("phone Back closes an expense dialog before leaving the dashboard", async ({ page }) => {
  await mockApi(page);
  await page.goto("/?view=dashboard");
  await page.getByRole("button", { name: "Add expense", exact: true }).first().click();
  await expect(page.getByRole("dialog", { name: "Add expense", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Hello, Aftab/ })).toBeVisible();
});

test("phone Back returns from a person's history to People and then dashboard", async ({ page }) => {
  await mockApi(page);
  const contact = { id: "contact-1", name: "Priya", nickname: null, notes: null, isArchived: false, version: 1, linkedUser: null, linkRequest: null };
  await page.route("**/api/contacts", (route) => route.fulfill({ json: { contacts: [contact] } }));
  await page.route(/\/api\/loans\?/, (route) => route.fulfill({ json: { contact, entries: [], totals: [] } }));
  await page.goto("/?view=dashboard");
  await page.getByRole("button", { name: "People", exact: true }).click();
  await expect(page).toHaveURL(/screen=people/);
  await page.getByRole("button", { name: "Money history" }).click();
  await expect(page).toHaveURL(/person=contact-1/);
  await expect(page.getByRole("heading", { name: "Priya", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Priya", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Money history" })).toBeVisible();
  await expect(page).not.toHaveURL(/person=/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: /Hello, Aftab/ })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("button", { name: "Money history" })).toBeVisible();
});

test("password recovery sends an email request, rejects mismatches, and submits a reset token", async ({ page }) => {
  await mockApi(page, false);
  await page.route("**/api/auth/forgot-password", (route) => {
    expect(route.request().postDataJSON()).toEqual({ email: "alex@example.com" });
    return route.fulfill({ json: { message: "If an account uses that email, you will receive a password-reset link." } });
  });
  const token = "a".repeat(64);
  let resets = 0;
  await page.route("**/api/auth/reset-password", (route) => { resets++; expect(route.request().postDataJSON()).toEqual({ token, password: "new-password-for-test" }); return route.fulfill({ json: { message: "Password updated. Sign in with your new password." } }); });
  await page.goto("/?view=login");
  await expect(page.getByRole("button", { name: "Sign in with Google" }).locator("svg")).toBeVisible();
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email address").fill("alex@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account uses that email");
  await page.goto(`/?view=reset#token=${token}`);
  await page.getByLabel("New password", { exact: true }).fill("new-password-for-test");
  await page.getByLabel("Confirm new password").fill("a-different-password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("alert")).toHaveText("The passwords do not match.");
  expect(resets).toBe(0);
  await page.getByLabel("Confirm new password").fill("new-password-for-test");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  await expect(page).not.toHaveURL(/token=/);
  await page.getByRole("button", { name: "Back to log in" }).click();
  await expect(page.getByLabel("Email address")).toBeVisible();
  expect(resets).toBe(1);
});

test("AI text and photo previews require review and reuse the same ID on a failed save", async ({ page }) => {
  await mockApi(page);
  const draft = { intent: "EXPENSE", amount: "120.00", currency: "INR", date: "2026-10-25", purpose: "Canteen lunch", category: "Food", contactName: null, questions: [], defaultsUsed: [] };
  await page.route("**/api/ai/preview", (route) => { expect(route.request().postDataJSON()).toEqual({ text: "Spent 120 on canteen lunch" }); return route.fulfill({ json: { draft, matchedContactIds: [] } }); });
  await page.route("**/api/ai/receipt-preview", (route) => {
    expect(route.request().headers()["content-type"]).toContain("multipart/form-data");
    expect(route.request().postDataBuffer()?.toString()).toContain('name="bill"');
    return route.fulfill({ json: { draft, matchedContactIds: [] } });
  });
  const ids: string[] = [];
  await page.route("**/api/ai/confirm", (route) => { ids.push(route.request().postDataJSON().id); return route.fulfill({ status: ids.length === 1 ? 503 : 201, json: ids.length === 1 ? { message: "Try again." } : { receipt: { id: ids[0], type: "EXPENSE", contactId: null, alreadySaved: true } } }); });
  await page.goto("/?view=dashboard");
  await page.getByRole("button", { name: "AI Quick Add", exact: true }).first().click();
  await page.getByLabel("Your entry").fill("Spent 120 on canteen lunch");
  await page.getByRole("button", { name: "Review with AI" }).click();
  await expect(page.getByRole("button", { name: "Confirm and save" })).toBeDisabled();
  await page.getByLabel(/I checked the type/).check();
  await page.getByRole("button", { name: "Confirm and save" }).click();
  await expect(page.getByRole("button", { name: "Retry same entry" })).toBeVisible();
  await page.getByRole("button", { name: "Retry same entry" }).click();
  await expect(page.getByRole("status")).toContainText("No duplicate was added");
  expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
  await page.getByRole("button", { name: "Scan a bill", exact: true }).click();
  await expect(page.getByRole("button", { name: "Scan with camera" }).locator("svg")).toBeVisible();
  await page.getByLabel("Bill photo", { exact: true }).setInputFiles({ name: "bill.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=", "base64") });
  await expect(page.getByAltText("Selected bill to scan")).toBeVisible();
  await page.getByRole("button", { name: "Scan and review" }).click();
  await expect(page.getByLabel("Purpose (optional)")).toHaveValue("Canteen lunch");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/ai-photo-review-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Add it in your own words." })).toBeVisible();
});

for (const width of [320, 360, 390, 768, 1440]) {
  test(`layout and dialogs fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await page.goto("/?view=dashboard");
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
test("theme controls live inside page headers on desktop and mobile", async ({ page }) => {
  await mockApi(page, false);
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ["", "?view=login", "?view=forgot"]) {
      await page.goto(`/${view}`);
      const toggle = page.getByRole("button", { name: /Switch to .* mode/ });
      await expect(toggle).toHaveCount(1);
      await expect(page.locator("header").getByRole("button", { name: /Switch to .* mode/ })).toBeVisible();
      await expect(page.locator(".theme-toolbar")).toHaveCount(0);
      await toggle.click();
      const theme = await page.locator("html").getAttribute("data-theme");
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme!);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.screenshot({ path: `test-results/navbar-theme-${width}.png`, fullPage: true });
  }
});
test("testimonials publish with consent, render as text, edit and delete on mobile", async ({ page }) => {
  await mockApi(page);
  let mine: { id: string; body: string; rating: number; createdAt: string; user: { displayName: string; memberSince: string } } | null = null;
  await page.route("**/api/testimonials**", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      const data = request.postDataJSON(); expect(data.consent).toBe(true);
      mine = { id: "review-1", body: data.body, rating: data.rating, createdAt: new Date().toISOString(), user: { displayName: "Alex", memberSince: "2026-01" } };
    }
    if (request.method() === "DELETE") mine = null;
    await route.fulfill({ json: request.url().endsWith("/mine") ? { testimonial: mine } : { testimonials: mine ? [mine] : [] } });
  });
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Write a testimonial", exact: true }).click();
  await page.getByLabel("Your experience").fill("Paylet helps me track college expenses. <script>alert(1)</script>");
  await expect(page.getByRole("button", { name: "Publish testimonial" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /Publish my words/ }).check();
  await expect(page.getByRole("button", { name: "Publish testimonial" })).toBeDisabled();
  await page.getByRole("radio", { name: "4 out of 5 stars" }).check();
  await page.getByRole("button", { name: "Publish testimonial" }).click();
  await expect(page.locator(".testimonial-card blockquote")).toContainText("<script>alert(1)</script>");
  await expect(page.locator(".testimonial-card script")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "4 out of 5 stars" })).toBeVisible();
  await expect(page.getByText("User since January 2026")).toBeVisible();
  await page.locator("#testimonials").screenshot({ path: "test-results/testimonials-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Edit your testimonial", exact: true }).click();
  await expect(page.getByLabel("Your experience")).toContainText("college expenses");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete testimonial", exact: true }).click();
  await expect(page.getByText("No testimonials yet.", { exact: false })).toBeVisible();
});

test("public photos require opt-in, show in reviews and community, and fall back when unavailable", async ({ page }) => {
  await mockApi(page);
  let optedIn = false;
  const photo = "https://example.com/public-avatar.webp";
  await page.route(photo, (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="purple"/></svg>' }));
  await page.route("**/api/testimonials**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "PUT") { optedIn = route.request().postDataJSON().photoConsent; expect(optedIn).toBe(true); }
    const review = { id: "photo-review", body: "A helpful app for shared expenses", rating: 4, photoConsent: optedIn, createdAt: "2026-10-27T00:00:00Z", user: { displayName: "Alex", memberSince: "2026-01", avatarUrl: optedIn ? photo : null } };
    await route.fulfill({ json: url.pathname.endsWith("/community") ? { users: [{ displayName: "Alex", avatarUrl: photo }] } : url.pathname.endsWith("/mine") ? { testimonial: review } : { testimonials: [review] } });
  });
  await page.goto("/");
  await expect(page.locator(".community-faces img")).toBeVisible();
  await expect(page.locator(".testimonial-author img")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit your testimonial", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Also show my profile photo/ })).not.toBeChecked();
  await page.getByRole("checkbox", { name: /Also show my profile photo/ }).check();
  await page.getByRole("checkbox", { name: /Publish my words/ }).check();
  await page.getByRole("button", { name: "Publish testimonial" }).click();
  await expect(page.locator(".testimonial-author img")).toBeVisible();
  for (const theme of ["light", "dark"]) {
    if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: `Switch to ${theme} mode` }).click();
    expect(await page.locator(".review-stars .star-selected").first().evaluate((el) => getComputedStyle(el).color)).toBe(theme === "dark" ? "rgb(255, 209, 102)" : "rgb(194, 138, 8)");
  }
  await page.route(photo, (route) => route.abort());
  await page.reload();
  await expect(page.locator(".testimonial-author .public-avatar")).toHaveText("A");
  await expect(page.locator(".testimonial-author img")).toHaveCount(0);
});

test("visitors can read testimonials but must log in to write", async ({ page }) => {
  await mockApi(page, false);
  await page.goto("/");
  await page.getByRole("button", { name: "Log in to write", exact: true }).click();
  await expect(page.getByLabel("Email address")).toBeVisible();
});
test("hero shows the real aggregate count and omits unavailable counts", async ({ page }) => {
  await mockApi(page, false);
  await page.goto("/");
  await expect(page.locator(".landing-hero").getByText("1,250+ strong users", { exact: true })).toBeVisible();
  await page.route("**/api/community/stats", (route) => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Paylet.", exact: true })).toBeVisible();
  await expect(page.locator(".landing-community-count strong")).toHaveCount(0);
});
test("landing redesign separates sections and supports hover and reduced motion", async ({ page }) => {
  await mockApi(page, false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  if (await page.locator("html").getAttribute("data-theme") !== "dark") await page.getByRole("button", { name: "Switch to dark mode" }).click();
  const card = page.locator(".landing-money-card").first();
  await card.scrollIntoViewIfNeeded();
  await card.hover();
  await expect.poll(() => card.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
  const background = (selector: string) => page.locator(selector).evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(await background(".landing-feature-band")).not.toBe(await background(".landing-showcase"));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/landing-redesign-dark.png", fullPage: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => card.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await card.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/landing-redesign-mobile.png", fullPage: true });
});

test("capture current Paylet dashboard for landing product preview", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user: { ...user, displayName: "Alex", username: "alex" } } }));
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/?view=dashboard");
  if (await page.locator("html").getAttribute("data-theme") === "dark") await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.getByRole("heading", { name: "Lunch with friends" })).toBeVisible();
  await page.screenshot({ path: "test-results/paylet-preview-current.png" });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.screenshot({ path: "test-results/paylet-preview-dark.png" });
});
test("deep black theme applies across the app without changing light mode", async ({ page }) => {
  await mockApi(page);
  await page.goto("/?view=dashboard");
  if (await page.locator("html").getAttribute("data-theme") !== "dark") await page.getByRole("button", { name: "Switch to dark mode" }).click();
  expect(await page.locator("body").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(0, 0, 0)");
  expect(await page.locator(".summary-card").first().evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(10, 10, 10)");
  await page.getByRole("button", { name: "AI Quick Add", exact: true }).first().click();
  expect(await page.locator(".pqa").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(0, 0, 0)");
  await page.goto("/");
  expect(await page.locator(".landing-page").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(0, 0, 0)");
  await page.screenshot({ path: "test-results/landing-deep-black.png" });
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  expect(await page.locator("body").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(247, 247, 251)");
});
test("hero bill demo splits every paisa locally and validates input", async ({ page }) => {
  const writes = await mockApi(page, false);
  await page.goto("/");
  const demo = page.getByRole("group", { name: "Split the next bill" });
  await expect(demo.locator(".hero-split-result strong")).toContainText("300.00");
  await page.getByRole("button", { name: "Fewer friends" }).click();
  await page.getByLabel("Bill amount").fill("1000");
  await expect(demo.locator(".hero-split-result strong")).toContainText("333.33");
  await expect(demo.locator(".hero-split-note")).toContainText("333.34");
  await page.getByLabel("Bill amount").fill("-10");
  await expect(page.getByLabel("Bill amount")).toHaveAttribute("aria-invalid", "true");
  await expect(demo.locator(".hero-split-result strong")).toHaveText("--");
  await page.getByLabel("Bill amount").fill("0.01");
  await expect(demo.locator(".hero-split-note")).toContainText("Every paisa accounted for");
  await page.getByRole("button", { name: "Fewer friends" }).click();
  await expect(page.getByRole("button", { name: "Fewer friends" })).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.screenshot({ path: "test-results/hero-split-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(writes).toHaveLength(0);
});
test("hero and dashboard preview switch together with the selected theme", async ({ page }) => {
  await mockApi(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  if (await page.locator("html").getAttribute("data-theme") === "dark") await page.getByRole("button", { name: "Switch to light mode" }).click();
  const hero = page.locator(".landing-interactive-hero");
  const image = page.locator(".landing-product");
  expect(await hero.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(247, 247, 251)");
  expect(await page.locator(".hero-split").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 255, 255)");
  await expect(image).toHaveAttribute("src", "/paylet-preview.png");
  await page.screenshot({ path: "test-results/hero-theme-light.png" });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  expect(await hero.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(0, 0, 0)");
  await expect(image).toHaveAttribute("src", "/paylet-preview-dark.png");
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(1440);
  await image.evaluate((element) => (element as HTMLImageElement).decode());
  await page.screenshot({ path: "test-results/dashboard-preview-theme-dark.png" });
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(image).toHaveAttribute("src", "/paylet-preview.png");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("all testimonials page loads more and expands long reviews", async ({ page }) => {
  await mockApi(page, false);
  const review = (id: string) => ({ id, body: "My Paylet experience has been useful. ".repeat(10), rating: id === "old" ? null : 5, createdAt: "2026-10-26T00:00:00Z", user: { displayName: id, memberSince: "2026-01" } });
  await page.route("**/api/testimonials?**", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({ json: url.searchParams.has("cursor") ? { testimonials: [review("old")], nextCursor: null } : { testimonials: [review("Alex")], nextCursor: "next" } });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "View all testimonials" }).click();
  await expect(page).toHaveURL(/view=testimonials/);
  await page.getByRole("button", { name: "Read more", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Show less", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(page.locator(".testimonial-card")).toHaveCount(2);
  await expect(page.getByText("Not rated yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more", exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/testimonials-all-mobile.png", fullPage: true });
});
test("balance cards open People and horizontal contact cards show recorded and outstanding money", async ({ page }) => {
  await mockApi(page);
  const total = { currency: "INR", minorUnit: 2, totalLent: "500.00", repaymentsReceived: "100.00", owedToYou: "400.00", totalBorrowed: "200.00", repaymentsMade: "50.00", youOwe: "150.00" };
  await page.route("**/api/loans/summary", (route) => route.fulfill({ json: { totals: [total] } }));
  await page.route("**/api/contacts", (route) => route.fulfill({ json: { contacts: ["Priya", "Rahul"].map((name, index) => ({ id: `person-${index}`, name, nickname: null, notes: null, isArchived: false, version: 1, createdAt: "2026-10-01", updatedAt: "2026-10-01", linkedUser: null, linkRequest: null })) } }));
  await page.route("**/api/loans/people-summary", (route) => route.fulfill({ json: { summaries: [{ contactId: "person-0", totals: [total, { ...total, currency: "USD", owedToYou: "5.00" }] }] } }));
  await page.goto("/?view=dashboard");
  await page.getByRole("button", { name: "Owed to you ₹ 400.00. Open People" }).click();
  await expect(page.getByRole("heading", { name: "People", exact: true })).toBeVisible();
  const card = page.locator(".person-card").filter({ hasText: "Priya" });
  await expect(card.locator(".person-recorded").first()).toContainText("500.00");
  await expect(card.locator(".person-outstanding").first()).toContainText("400.00");
  await expect(card.locator(".person-outstanding").first()).toContainText("150.00");
  await expect(card).toContainText("USD");
  await expect(page.getByText("No money records", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/people-horizontal-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 360, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/people-horizontal-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Total borrowed ₹ 200.00. Open People" }).click();
  await expect(page.getByRole("heading", { name: "People", exact: true })).toBeVisible();
});
test("dashboard shortcuts are monochrome except the blue AI highlight in both themes", async ({ page }) => {
  await mockApi(page);
  await page.goto("/?view=dashboard");
  for (const theme of ["light", "dark"]) {
    if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: `Switch to ${theme} mode` }).click();
    const icons = page.locator(".quick-actions > button:not(.dashboard-ai-shortcut) .action-symbol");
    await expect(icons).toHaveCount(5);
    for (const icon of await icons.all()) {
      expect(await icon.evaluate((element) => getComputedStyle(element).color)).toBe(theme === "dark" ? "rgb(255, 255, 255)" : "rgb(32, 32, 36)");
      expect(await icon.locator("svg").evaluate((element) => getComputedStyle(element).strokeWidth)).toBe("2.5px");
    }
    expect(await page.locator(".dashboard-ai-shortcut .action-symbol").evaluate((element) => getComputedStyle(element).backgroundImage)).toContain("linear-gradient");
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.screenshot({ path: `test-results/dashboard-ivory-${theme}.png` });
    await page.setViewportSize({ width: 320, height: 700 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
test("logout gradient fits mobile in both themes with only two buttons", async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  for (const theme of ["light", "dark"]) {
    if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: `Switch to ${theme} mode` }).click();
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Log out of Paylet?" });
    await expect(dialog.getByRole("button")).toHaveCount(2);
    expect(await dialog.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain("linear-gradient");
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    await dialog.screenshot({ path: `test-results/logout-simple-${theme}.png` });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  }
});
test("dashboard refresh uses neutral expense rows and solid blue/pink lending cards", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/loans/summary", (route) => route.fulfill({ json: { totals: [{ currency: "INR", minorUnit: 2, totalLent: "5000.00", repaymentsReceived: "1000.00", owedToYou: "4000.00", totalBorrowed: "3000.00", repaymentsMade: "500.00", youOwe: "2500.00" }] } }));
  await page.goto("/?view=dashboard");
  for (const theme of ["light", "dark"]) {
    if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: `Switch to ${theme} mode` }).click();
    for (const selector of [".lent-summary", ".borrowed-summary"]) {
      expect(await page.locator(selector).evaluate((element) => getComputedStyle(element).backgroundImage)).toBe("none");
    }
    await expect(page.locator(".expense-direction .lucide-arrow-up-left")).toBeVisible();
    await expect(page.getByRole("button", { name: "Owed to you ₹ 4000.00. Open People" })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.screenshot({ path: `test-results/dashboard-refresh-${theme}.png`, fullPage: true });
    const listWidth = await page.locator(".expense-list").evaluate((element) => element.getBoundingClientRect().width);
    expect(listWidth).toBeLessThanOrEqual(1040);
    await page.setViewportSize({ width: 360, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/dashboard-refresh-mobile-${theme}.png`, fullPage: true });
  }
});
test("rupee labels preserve currency codes and floating expense control works while scrolled", async ({ page }) => {
  await mockApi(page);
  await page.goto("/?view=dashboard");
  await expect(page.getByRole("img", { name: "waving hand" })).toBeVisible();
  await expect(page.locator(".expense-row-right > strong").first()).toContainText("₹ 250.00");
  const fab = page.locator(".dashboard-fab");
  await expect(fab).toBeEnabled();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    const box = await fab.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.y + box!.height).toBeLessThan(800);
    expect(await fab.evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
  }
  await fab.click();
  const dialog = page.getByRole("dialog", { name: "Add expense", exact: true });
  await expect(dialog).toBeVisible(); await expect(fab).toBeHidden();
  const currency = dialog.getByLabel("Currency", { exact: true });
  await expect(currency).toHaveValue("INR");
  await expect(currency.locator('option[value="INR"]')).toHaveText("₹");
  await currency.selectOption("USD"); await expect(currency).toHaveValue("USD");
  await expect(currency.locator('option[value="USD"]')).toHaveText("USD");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(fab).toBeVisible(); await expect(fab).toBeFocused();
  expect(await page.locator(".dashboard-add-expense").evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
  await page.screenshot({ path: "test-results/dashboard-rupee-fab.png" });
});
