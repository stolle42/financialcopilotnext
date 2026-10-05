import type { Locator, Page } from "@playwright/test";
import type { Category, Side } from "../src/domain/types";
import { messageFor } from "../src/ui/messages";
import {
  addTransaction,
  budgetRow,
  openTransactionForm,
  setBudgetLimit,
  storedBudgets,
  storedRecords,
  storedTransactions,
} from "./support/app";
import { expect, setToday, test } from "./support/test";

// The journey of User Story 6, scenarios 1–5, in one fresh context. Scenario 2 checks the new name
// and colour wherever the category appears: the transaction list, the form and Budgets (FR-065).
// Scenario 3 sets its budget through Budgets and deletes the category with 12 transactions.

const main = (page: Page) => page.getByRole("main");
const rows = (page: Page) => main(page).getByRole("tabpanel").getByRole("listitem");
const row = (page: Page, name: string) =>
  rows(page).filter({ has: page.getByText(name, { exact: true }) });
const ledgerRows = (page: Page) =>
  page.getByRole("list", { name: "Transactions" }).getByRole("listitem");

/**
 * Opens Categories on a side's tab and waits until its panel is the only one. The panel it
 * replaces stays mounted, inert, until its exit transition ends, and it holds rows of the same
 * names, such as "Uncategorised".
 */
async function openCategories(page: Page, tab: "Expenses" | "Income") {
  await page.goto("/#/categories");
  await main(page).getByRole("tab", { name: tab }).click();
  await expect(main(page).getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
  await expect(main(page).getByRole("tabpanel", { name: tab })).toBeVisible();
  await expect(main(page).getByRole("tabpanel")).toHaveCount(1);
}

/** The colour of the swatch in the category chip that shows `name` within `scope` (FR-065). */
function chipColour(scope: Locator, name: string): Promise<string> {
  return scope
    .getByText(name, { exact: true })
    .first()
    .locator("xpath=preceding-sibling::*[1]")
    .evaluate((swatch) => getComputedStyle(swatch).backgroundColor);
}

async function categoryWithRole(page: Page, side: Side, role: Category["role"]) {
  const categories = await storedRecords<Category>(page, "categories");
  return categories.find((c) => c.side === side && c.role === role)!;
}

const PROTECTED = [
  ["Uncategorised", "uncategorised"],
  ["Unaccounted", "unaccounted"],
] as const;

test("organises categories without breaking transactions or budgets", async ({ page }) => {
  test.setTimeout(240_000);
  await setToday(page, "2026-09-03");

  // 1. A first launch holds a predefined list on each side, each with both protected categories.
  await openCategories(page, "Expenses");
  await expect(rows(page)).toHaveCount(11);
  await openCategories(page, "Income");
  await expect(rows(page)).toHaveCount(5);
  for (const tab of ["Expenses", "Income"] as const) {
    await openCategories(page, tab);
    for (const [name] of PROTECTED) await expect(row(page, name)).toHaveCount(1);
  }

  // Twelve meals out, one grocery shop, and a monthly limit on eating out set through Budgets.
  await page.goto("/");
  for (let i = 1; i <= 12; i++) {
    await addTransaction(page, { amount: `${i + 4}.00`, category: "Eating out" });
  }
  await addTransaction(page, { amount: "40.00", category: "Groceries" });
  await setBudgetLimit(page, "Eating out", "150.00");

  // 2. Renamed and recoloured, "Restaurants" shows its new name and colour everywhere.
  await openCategories(page, "Expenses");
  await row(page, "Eating out").getByRole("button", { name: "Rename" }).click();
  const nameField = rows(page).getByRole("textbox", { name: "Name" });
  await nameField.fill("Restaurants");
  await nameField.press("Enter");
  await row(page, "Restaurants").getByRole("button", { name: "Colour" }).click();
  await page
    .getByRole("radiogroup", { name: "Colour" })
    .getByRole("radio", { name: "#e8590c", exact: true })
    .click();
  const orange = "rgb(232, 89, 12)";
  await expect.poll(() => chipColour(row(page, "Restaurants"), "Restaurants")).toBe(orange);

  await page.goto("/");
  const restaurantRows = ledgerRows(page).filter({ hasText: "Restaurants" });
  await expect(restaurantRows).toHaveCount(12);
  await expect(ledgerRows(page).filter({ hasText: "Eating out" })).toHaveCount(0);
  expect(await chipColour(restaurantRows.first(), "Restaurants")).toBe(orange);

  await restaurantRows.first().getByRole("button").click();
  const form = page.getByRole("dialog", { name: "Edit transaction" });
  const category = form.getByLabel("Category", { exact: true });
  await expect(category).toHaveText("Restaurants");
  expect(await chipColour(category, "Restaurants")).toBe(orange);
  await category.click();
  await expect(page.getByRole("option", { name: "Restaurants", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Eating out", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toHaveCount(0);

  await page.goto("/#/budgets");
  await expect(budgetRow(page, "Restaurants").getByLabel("Monthly limit")).toHaveValue("150.00");
  expect(await chipColour(budgetRow(page, "Restaurants"), "Restaurants")).toBe(orange);

  // 3. Deleting "Restaurants" moves its 12 transactions to expense "Uncategorised" and removes
  //    its budget.
  await openCategories(page, "Expenses");
  await row(page, "Restaurants").getByRole("button", { name: "Delete" }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("12 transactions");
  await expect(confirmation).toContainText(/monthly limit/i);
  await confirmation.getByRole("button", { name: "Delete category" }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(row(page, "Restaurants")).toHaveCount(0);

  const uncategorised = await categoryWithRole(page, "expense", "uncategorised");
  const transactions = await storedTransactions(page);
  expect(transactions).toHaveLength(13);
  expect(
    transactions.filter((t) => t.kind === "expense" && t.categoryId === uncategorised.id),
  ).toHaveLength(12);
  expect(await storedBudgets(page)).toEqual([]);
  await page.goto("/#/budgets");
  await expect(budgetRow(page, "Restaurants")).toHaveCount(0);
  await page.goto("/");
  await expect(ledgerRows(page).filter({ hasText: "Uncategorised" })).toHaveCount(12);

  // 4. The protected categories refuse deletion on both sides, and rename and recolour.
  for (const tab of ["Expenses", "Income"] as const) {
    await openCategories(page, tab);
    for (const [name, role] of PROTECTED) {
      await row(page, name).getByRole("button", { name: "Delete" }).click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      await expect(main(page).getByRole("alert")).toHaveText(
        messageFor({ code: "category-protected", details: { role } }),
      );
    }
  }
  await openCategories(page, "Expenses");
  await row(page, "Uncategorised").getByRole("button", { name: "Rename" }).click();
  await rows(page).getByRole("textbox", { name: "Name" }).fill("To sort");
  await rows(page).getByRole("textbox", { name: "Name" }).press("Enter");
  await row(page, "To sort").getByRole("button", { name: "Colour" }).click();
  await page
    .getByRole("radiogroup", { name: "Colour" })
    .getByRole("radio", { name: "#82c91e", exact: true })
    .click();
  expect(await categoryWithRole(page, "expense", "uncategorised")).toMatchObject({
    id: uncategorised.id,
    name: "To sort",
    color: "#82c91e",
  });
  // Still the form's default, found by its role (FR-014).
  await page.goto("/");
  await expect(ledgerRows(page).filter({ hasText: "To sort" })).toHaveCount(12);
  const newForm = await openTransactionForm(page);
  await expect(newForm.getByLabel("Category", { exact: true })).toHaveText("To sort");
  await newForm.getByRole("button", { name: "Cancel" }).click();

  // 5. "Refunds" may exist once on each side, but not twice on one.
  for (const tab of ["Expenses", "Income"] as const) {
    await openCategories(page, tab);
    await main(page).getByRole("button", { name: "New category" }).click();
    const dialog = page.getByRole("dialog", { name: "New category" });
    await dialog.getByLabel("Name").fill("Refunds");
    await dialog.getByRole("button", { name: "Create category" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row(page, "Refunds")).toBeVisible();
  }
  await openCategories(page, "Expenses");
  await main(page).getByRole("button", { name: "New category" }).click();
  const dialog = page.getByRole("dialog", { name: "New category" });
  await dialog.getByLabel("Name").fill("Refunds");
  await dialog.getByRole("button", { name: "Create category" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    messageFor({ code: "category-name-taken", details: { side: "expense" } }),
  );
  const refunds = (await storedRecords<Category>(page, "categories")).filter(
    (c) => c.name === "Refunds",
  );
  expect(refunds.map((c) => c.side).sort()).toEqual(["expense", "income"]);
});
