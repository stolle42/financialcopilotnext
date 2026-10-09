import type { Locator, Page } from "@playwright/test";
import { messageFor } from "../../src/ui/messages";
import { addAccount, addTransaction, choose } from "../support/app";
import { euros, expect, setToday, test } from "../support/test";

// contracts/ui.md, transactions; FR-016, FR-030, FR-063, FR-073.

test.beforeEach(async ({ page }) => {
  await setToday(page, "2026-09-03");
});

const list = (page: Page) => page.getByRole("list", { name: "Transactions" });
const rows = (page: Page) => list(page).getByRole("listitem");
const columnHeaders = (page: Page) => page.locator("[data-column-headers] > *");
const filters = (page: Page) => page.getByRole("region", { name: "Filters" });
const editButton = (row: Locator) => row.getByRole("button", { name: "Edit transaction" });

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
  // The cells of the first row are the children of its grid, whether they are text or buttons.
  const cells = rows(page).first().locator(":scope > * > *");
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
    // The divider is visual only. A listbox may hold only options and groups, so Base UI renders
    // it presentational, and the group names tell the sides apart for assistive technology.
    const divider = page.getByRole("listbox").locator('[data-slot="select-separator"]');
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

test.describe("filters by date", () => {
  const from = (page: Page) => filters(page).getByLabel("From", { exact: true });
  const to = (page: Page) => filters(page).getByLabel("To", { exact: true });

  test.beforeEach(async ({ page }) => {
    const days: [description: string, date: string, category: string][] = [
      ["Late August", "2026-08-31", "Eating out"],
      ["First", "2026-09-01", "Groceries"],
      ["Second", "2026-09-02", "Eating out"],
      ["Third", "2026-09-03", "Groceries"],
    ];
    await page.goto("/");
    for (const [description, date, category] of days) {
      await addTransaction(page, { amount: "5.00", category, date, description });
    }
  });

  test("start empty, so every transaction shows", async ({ page }) => {
    await expect(from(page)).toHaveValue("");
    await expect(to(page)).toHaveValue("");
    await expect(rows(page)).toHaveCount(4);
  });

  test("From and To each limit the list alone, their own date included", async ({ page }) => {
    await from(page).fill("2026-09-01");
    await expect.poll(() => descriptions(page)).toEqual(["Third", "Second", "First"]);
    await from(page).fill("");
    await to(page).fill("2026-09-01");
    await expect.poll(() => descriptions(page)).toEqual(["First", "Late August"]);
  });

  test("both together keep the days between them, both ends included", async ({ page }) => {
    await from(page).fill("2026-09-01");
    await to(page).fill("2026-09-02");
    await expect.poll(() => descriptions(page)).toEqual(["Second", "First"]);
  });

  test("combine with the category filter", async ({ page }) => {
    await from(page).fill("2026-09-01");
    await choose(page, filters(page), "Category", "Groceries");
    await expect.poll(() => descriptions(page)).toEqual(["Third", "First"]);
  });

  test("Clear filters empties both fields", async ({ page }) => {
    await from(page).fill("2026-09-01");
    await to(page).fill("2026-09-02");
    await expect(rows(page)).toHaveCount(2);
    await filters(page).getByRole("button", { name: "Clear filters" }).click();
    await expect(from(page)).toHaveValue("");
    await expect(to(page)).toHaveValue("");
    await expect(rows(page)).toHaveCount(4);
  });

  test("a From after To shows date-range-invalid under the fields and keeps the last rows", async ({
    page,
  }) => {
    await from(page).fill("2026-09-01");
    await to(page).fill("2026-09-02");
    await expect.poll(() => descriptions(page)).toEqual(["Second", "First"]);

    await from(page).fill("2026-09-03");
    await expect(from(page)).toHaveAttribute("aria-invalid", "true");
    const error = filters(page).getByText(messageFor({ code: "date-range-invalid" }));
    await expect(error).toBeVisible();
    const fromBox = (await from(page).boundingBox())!;
    const errorBox = (await error.boundingBox())!;
    expect(errorBox.y).toBeGreaterThanOrEqual(fromBox.y + fromBox.height);
    await expect.poll(() => descriptions(page)).toEqual(["Second", "First"]);

    await to(page).fill("2026-09-03");
    await expect(error).toHaveCount(0);
    await expect(from(page)).not.toHaveAttribute("aria-invalid", "true");
    await expect.poll(() => descriptions(page)).toEqual(["Third"]);
  });
});

test.describe("editing in place", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "40.00", category: "Groceries", description: "Shop" });
  });

  test("a description saves on Enter without the form, and focus returns to the cell", async ({
    page,
  }) => {
    const row = rows(page).first();
    await row.getByRole("button", { name: "Shop", exact: true }).click();
    const field = row.getByRole("textbox", { name: "Description" });
    await expect(field).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await field.fill("Weekly shop");
    await field.press("Enter");
    await expect(row.getByRole("button", { name: "Weekly shop", exact: true })).toBeFocused();
    await page.reload();
    await expect(rows(page).first()).toContainText("Weekly shop");
  });

  test("Escape cancels, and leaving the field saves", async ({ page }) => {
    const row = rows(page).first();
    const cell = row.getByRole("button", { name: "Shop", exact: true });
    await cell.click();
    await row.getByRole("textbox", { name: "Description" }).fill("Oops");
    await page.keyboard.press("Escape");
    await expect(row.getByRole("textbox")).toHaveCount(0);
    await expect(cell).toBeFocused();

    await cell.click();
    await row.getByRole("textbox", { name: "Description" }).fill("Weekly shop");
    await page.getByRole("heading", { name: "Transactions" }).click();
    await expect(row.getByRole("textbox")).toHaveCount(0);
    await page.reload();
    await expect(rows(page).first()).toContainText("Weekly shop");
  });

  test("an amount opens without its sign, and amount-invalid stays under the cell until fixed", async ({
    page,
  }) => {
    const row = rows(page).first();
    await row.getByRole("button", { name: euros(-4000) }).click();
    const field = row.getByRole("textbox", { name: "Amount" });
    await expect(field).toHaveValue("40.00");
    await field.fill("12,34.5");
    await field.press("Enter");
    await expect(row.getByRole("alert")).toHaveText(messageFor({ code: "amount-invalid" }));
    await expect(field).toHaveValue("12,34.5");
    await field.fill("42.50");
    await field.press("Enter");
    await expect(row.getByRole("alert")).toHaveCount(0);
    await expect(row.getByRole("button", { name: euros(-4250) })).toBeVisible();
    await page.reload();
    await expect(rows(page).first()).toContainText(euros(-4250));
  });

  test("a date moves the row to its place, and date-invalid stays under the cell until fixed", async ({
    page,
  }) => {
    await addTransaction(page, { amount: "1.00", date: "2026-09-01", description: "Older" });
    const row = rows(page).filter({ hasText: "Shop" });
    await row.getByRole("button", { name: "Sep 3, 2026" }).click();
    const field = row.getByLabel("Date");
    await field.fill("");
    await field.press("Enter");
    await expect(row.getByRole("alert")).toHaveText(messageFor({ code: "date-invalid" }));
    await field.fill("2026-08-31");
    await field.press("Enter");
    await expect.poll(() => descriptions(page)).toEqual(["Older", "Shop"]);
    await page.reload();
    await expect.poll(() => descriptions(page)).toEqual(["Older", "Shop"]);
  });

  test("a category picks in place from its own side, and Escape keeps it", async ({ page }) => {
    const row = rows(page).first();
    await row.getByRole("button", { name: "Groceries" }).click();
    await expect(page.getByRole("option", { name: "Eating out", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Salary", exact: true })).toHaveCount(0);
    await expect(page.getByRole("option", { name: "Unaccounted", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Groceries" })).toBeFocused();

    await row.getByRole("button", { name: "Groceries" }).click();
    await page.getByRole("option", { name: "Eating out", exact: true }).click();
    await expect(row.getByRole("button", { name: "Eating out" })).toBeFocused();
    await page.reload();
    await expect(rows(page).first()).toContainText("Eating out");
  });

  test("a transfer's destination and account never offer the same account", async ({ page }) => {
    await addAccount(page, "Checking", "100.00");
    await addAccount(page, "Savings");
    await page.goto("/");
    await addTransaction(page, {
      kind: "Transfer",
      amount: "10.00",
      account: "Checking",
      destination: "Cash",
      description: "Top up",
    });
    const row = rows(page).filter({ hasText: "Top up" });

    await row.getByRole("button", { name: "→ Cash" }).click();
    await expect(page.getByRole("option", { name: "Checking", exact: true })).toHaveCount(0);
    await page.getByRole("option", { name: "Savings", exact: true }).click();
    await expect(row).toContainText("→ Savings");

    await row.getByRole("button", { name: "Checking", exact: true }).click();
    await expect(page.getByRole("option", { name: "Savings", exact: true })).toHaveCount(0);
    await page.getByRole("option", { name: "Cash", exact: true }).click();
    await expect(row.getByRole("button", { name: "Cash", exact: true })).toBeVisible();

    await page.reload();
    const reloaded = rows(page).filter({ hasText: "Top up" });
    await expect(reloaded).toContainText("→ Savings");
    await expect(reloaded.getByRole("button", { name: "Cash", exact: true })).toBeVisible();
  });

  test("a failed save shows save-failed under the cell and keeps the field open", async ({
    page,
  }) => {
    const row = rows(page).first();
    await row.getByRole("button", { name: "Shop", exact: true }).click();
    // Every write from here on fails, as when the disk is full (FR-073).
    await page.evaluate(() => {
      IDBDatabase.prototype.transaction = () => {
        throw new DOMException("The disk is full.", "QuotaExceededError");
      };
    });
    const field = row.getByRole("textbox", { name: "Description" });
    await field.fill("Weekly shop");
    await field.press("Enter");
    await expect(row.getByRole("alert")).toHaveText(messageFor({ code: "save-failed" }));
    await expect(field).toHaveValue("Weekly shop");
  });
});

test("the Edit transaction button opens the form, and saving changes the row", async ({ page }) => {
  await page.goto("/");
  await addTransaction(page, { amount: "40.00", category: "Groceries", description: "Shop" });
  await editButton(rows(page).filter({ hasText: "Shop" })).click();
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
  await editButton(rows(page).first()).click();
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
