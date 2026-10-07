import type { Page } from "@playwright/test";
import { addAccount, addTransaction, choose } from "../support/app";
import { euros, expect, setToday, test } from "../support/test";

// contracts/ui.md, transactions; FR-016, FR-030, FR-063.

test.beforeEach(async ({ page }) => {
  await setToday(page, "2026-09-03");
});

const list = (page: Page) => page.getByRole("list", { name: "Transactions" });
const rows = (page: Page) => list(page).getByRole("listitem");
const columnHeaders = (page: Page) => page.locator("[data-column-headers] > *");
const filters = (page: Page) => page.getByRole("region", { name: "Filters" });

async function descriptions(page: Page): Promise<string[]> {
  return rows(page).evaluateAll((items) =>
    items.map((item) => item.querySelector("[data-description]")?.textContent ?? ""),
  );
}

test("Transactions is the first entry in the sidebar", async ({ page }) => {
  await page.goto("/#/accounts");
  const links = page.getByRole("navigation", { name: "Screens" }).getByRole("link");
  await expect(links).toHaveText([
    "Transactions",
    "Import",
    "Categories",
    "Accounts",
    "Budgets",
    "Backup",
    "Insights",
  ]);
  await links.first().click();
  await expect(page.getByRole("main").getByRole("heading", { name: "Transactions" })).toBeVisible();
});

test("with no transactions at all, it says so and offers Add transaction", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("main");
  await expect(main).toContainText("No transactions yet");
  await main.getByRole("button", { name: "Add transaction" }).click();
  await expect(page.getByRole("dialog", { name: "Add transaction" })).toBeVisible();
});

test("lists newest first, the later entry first on the same date", async ({ page }) => {
  await page.goto("/");
  await addTransaction(page, { amount: "1.00", date: "2026-09-01", description: "Oldest" });
  await addTransaction(page, { amount: "2.00", date: "2026-09-03", description: "Earlier today" });
  await addTransaction(page, { amount: "3.00", date: "2026-09-03", description: "Later today" });
  await addTransaction(page, { amount: "4.00", date: "2026-09-02", description: "Yesterday" });
  await expect
    .poll(() => descriptions(page))
    .toEqual(["Later today", "Earlier today", "Yesterday", "Oldest"]);
});

test("shows each kind distinctly, a transfer's destination, and an empty description", async ({
  page,
}) => {
  await addAccount(page, "Checking", "100.00");
  await addTransaction(page, { amount: "40.00", category: "Groceries", description: "Shop" });
  await addTransaction(page, { kind: "Income", amount: "5.00", category: "Gifts" });
  await addTransaction(page, {
    kind: "Transfer",
    amount: "10.00",
    account: "Checking",
    destination: "Cash",
    description: "Top up",
  });
  await page.goto("/");
  const shop = rows(page).filter({ hasText: "Shop" });
  await expect(shop).toContainText(euros(-4000));
  await expect(shop).toContainText("Groceries");
  const gift = rows(page).filter({ hasText: "Gifts" });
  await expect(gift).toContainText(`+${euros(500)}`);
  await expect(gift).toContainText("No description");
  const topUp = rows(page).filter({ hasText: "Top up" });
  await expect(topUp).toContainText("→ Cash");
  await expect(topUp).toContainText(euros(1000));
});

test("names the columns above the rows, each over its own column", async ({ page }) => {
  await page.goto("/");
  await addTransaction(page, { amount: "40.00", category: "Groceries", description: "Shop" });
  await expect(columnHeaders(page)).toHaveText([
    "Date",
    "Description",
    "Category",
    "Account",
    "Amount",
  ]);
  const cells = rows(page).first().getByRole("button").locator(":scope > *");
  for (const [index, header] of (await columnHeaders(page).all()).entries()) {
    const headerBox = await header.boundingBox();
    const cellBox = await cells.nth(index).boundingBox();
    expect(headerBox?.x).toBeCloseTo(cellBox!.x, 0);
    expect(headerBox?.width).toBeCloseTo(cellBox!.width, 0);
  }
  await expect(columnHeaders(page).last()).toHaveCSS("text-align", "right");
});

test.describe("filters", () => {
  test.beforeEach(async ({ page }) => {
    await addAccount(page, "Checking", "1000.00");
    await addTransaction(page, { amount: "3.00", category: "Eating out", description: "Coffee" });
    await addTransaction(page, {
      kind: "Transfer",
      amount: "50.00",
      account: "Checking",
      destination: "Cash",
      description: "Top up",
    });
    await addTransaction(page, {
      amount: "40.00",
      account: "Checking",
      category: "Groceries",
      description: "Shop",
    });
    await addTransaction(page, {
      kind: "Income",
      amount: "900.00",
      account: "Checking",
      category: "Salary",
      description: "Pay",
    });
    await page.goto("/");
  });

  test("by account, including transfers into it", async ({ page }) => {
    await choose(page, filters(page), "Account", "Cash");
    await expect.poll(() => descriptions(page)).toEqual(["Top up", "Coffee"]);
  });

  test("by category of either side, which leaves out transfers", async ({ page }) => {
    await choose(page, filters(page), "Category", "Groceries");
    await expect.poll(() => descriptions(page)).toEqual(["Shop"]);
    await choose(page, filters(page), "Category", "Salary");
    await expect.poll(() => descriptions(page)).toEqual(["Pay"]);
  });

  test("lists both sides as two named groups, with a divider between them", async ({ page }) => {
    await expect(filters(page).getByRole("button", { name: /^(Expenses|Income)$/ })).toHaveCount(0);
    await filters(page).getByLabel("Category", { exact: true }).click();
    const expenses = page.getByRole("group", { name: "Expenses", exact: true });
    const income = page.getByRole("group", { name: "Income", exact: true });
    await expect(expenses.getByRole("option", { name: "Groceries" })).toBeVisible();
    await expect(expenses.getByRole("option", { name: "Salary" })).toHaveCount(0);
    await expect(income.getByRole("option", { name: "Salary" })).toBeVisible();
    await expect(income.getByRole("option", { name: "Groceries" })).toHaveCount(0);
    const divider = page.getByRole("listbox").getByRole("separator");
    await expect(divider).toBeVisible();
    const expensesBox = (await expenses.boundingBox())!;
    const dividerBox = (await divider.boundingBox())!;
    const incomeBox = (await income.boundingBox())!;
    expect(dividerBox.y).toBeGreaterThanOrEqual(expensesBox.y + expensesBox.height);
    expect(incomeBox.y).toBeGreaterThanOrEqual(dividerBox.y + dividerBox.height);
  });

  test("offers each side's protected categories, since it is not a picker for entry", async ({
    page,
  }) => {
    await filters(page).getByLabel("Category", { exact: true }).click();
    for (const side of ["Expenses", "Income"]) {
      const group = page.getByRole("group", { name: side, exact: true });
      await expect(group.getByRole("option", { name: "Unaccounted", exact: true })).toBeVisible();
      await expect(group.getByRole("option", { name: "Uncategorised", exact: true })).toBeVisible();
    }
  });

  test("names the chosen category's group, since both sides have an Uncategorised", async ({
    page,
  }) => {
    const category = filters(page).getByLabel("Category", { exact: true });
    await category.click();
    await page
      .getByRole("group", { name: "Income", exact: true })
      .getByRole("option", { name: "Uncategorised", exact: true })
      .click();
    await expect(category).toContainText("Uncategorised");
    await expect(category).toContainText("Income");
    await choose(page, filters(page), "Category", "Groceries");
    await expect(category).toContainText("Expenses");
  });

  test("combine, and Clear filters resets them", async ({ page }) => {
    await choose(page, filters(page), "Account", "Cash");
    await choose(page, filters(page), "Category", "Eating out");
    await expect.poll(() => descriptions(page)).toEqual(["Coffee"]);
    await filters(page).getByRole("button", { name: "Clear filters" }).click();
    await expect(rows(page)).toHaveCount(4);
  });

  test("matching nothing says so and offers Clear filters", async ({ page }) => {
    await choose(page, filters(page), "Account", "Cash");
    await choose(page, filters(page), "Category", "Groceries");
    const main = page.getByRole("main");
    await expect(main).toContainText("No transactions match these filters");
    await main.getByRole("button", { name: "Clear filters" }).last().click();
    await expect(rows(page)).toHaveCount(4);
  });
});

test("selecting a row opens it for editing, and saving changes the row", async ({ page }) => {
  await page.goto("/");
  await addTransaction(page, { amount: "40.00", category: "Groceries", description: "Shop" });
  await rows(page).filter({ hasText: "Shop" }).getByRole("button").click();
  const form = page.getByRole("dialog", { name: "Edit transaction" });
  await expect(form.getByLabel("Amount")).toHaveValue("40.00");
  await expect(form.getByLabel("Category", { exact: true })).toHaveText("Groceries");
  await form.getByLabel("Amount").fill("42.50");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toHaveCount(0);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(euros(-4250));
});

test("deleting asks for confirmation first, then removes the row (FR-013, FR-069)", async ({
  page,
}) => {
  await page.goto("/");
  await addTransaction(page, { amount: "40.00", category: "Groceries", description: "Shop" });
  await rows(page).first().getByRole("button").click();
  await page
    .getByRole("dialog", { name: "Edit transaction" })
    .getByRole("button", { name: "Delete" })
    .click();

  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText(/balance/i);
  await confirmation.getByRole("button", { name: "Delete transaction" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("main")).toContainText("No transactions yet");
});
