import type { Locator, Page } from "@playwright/test";
import type {
  Account,
  Category,
  ParsedRow,
  PendingBatch,
  Transaction,
} from "../../src/domain/types";
import { messageFor, notifications } from "../../src/ui/messages";
import { addAccount, addTransaction, choose, storedRecords } from "../support/app";
import { importWithProfile, saveDebitCreditProfile, saveMyBankProfile } from "../support/import";
import { euros, expect, setToday, test } from "../support/test";

// contracts/ui.md, review; User Story 2 scenarios 4–11 and 16; FR-022, FR-025, FR-028.

const header = (page: Page) => page.getByRole("region", { name: "Batch" });
const reviewList = (page: Page) => page.getByRole("region", { name: "Rows to review" });
const group = (page: Page, name: string) =>
  reviewList(page).getByRole("group", { name, exact: true });
const vendorGroups = (page: Page) =>
  reviewList(page).getByRole("group", { name: /^(?!Assignment of ).+, (expenses|income)$/ });
const assignment = (scope: Page | Locator, name: string) =>
  scope.getByRole("group", { name: `Assignment of ${name}`, exact: true });
const plainRows = (page: Page) =>
  reviewList(page).getByRole("list", { name: "Plain rows" }).getByRole("listitem");

async function storedRow(page: Page, rowNumber: number): Promise<ParsedRow> {
  const [batch] = await storedRecords<PendingBatch>(page, "pendingBatch");
  return batch!.rows.find((row) => row.rowNumber === rowNumber) as ParsedRow;
}

async function categoryId(page: Page, side: "expense" | "income", name: string) {
  const categories = await storedRecords<Category>(page, "categories");
  return categories.find((c) => c.side === side && c.name === name)!.id;
}

test.beforeEach(async ({ page }) => {
  await setToday(page, "2026-09-20");
});

async function importAugust(page: Page) {
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
}

test("with no batch pending, says so and leads to Import", async ({ page }) => {
  await page.goto("/#/import/review");
  const main = page.getByRole("main");
  await expect(main).toContainText("No import is waiting for review");
  await main.getByRole("button", { name: "Go to Import" }).click();
  await expect(page).toHaveURL(/#\/import$/);
});

test("the header shows the account, the file and the three counts", async ({ page }) => {
  await importAugust(page);
  await expect(header(page)).toContainText("Cash");
  await expect(header(page)).toContainText("mybank-2026-08.csv");
  await expect(header(page)).toContainText("13 rows to review");
  await expect(header(page).getByRole("button", { name: "1 duplicate" })).toBeVisible();
  await expect(header(page).getByRole("button", { name: "2 unparsable" })).toBeVisible();
});

test("keeps matches of the ledger out of review, lists them, and includes any single one (scenario 8)", async ({
  page,
}) => {
  // The ledger already holds the last week of August, entered by hand with other descriptions.
  await page.goto("/");
  await addTransaction(page, {
    amount: "9.99",
    date: "2026-08-27",
    description: "Streaming, by hand",
  });
  await addTransaction(page, { amount: "8.90", date: "2026-08-28", description: "Cake" });
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-09.csv" });

  await expect(header(page)).toContainText("5 rows to review");
  await expect(reviewList(page)).not.toContainText("STREAMING MONTHLY 0827");
  await header(page).getByRole("button", { name: "2 duplicates" }).click();
  const drawer = page.getByRole("dialog", { name: "Duplicates" });
  await expect(drawer).toContainText("STREAMING MONTHLY 0827");
  await expect(drawer).toContainText("Kuchen Kartenzahlung");

  await drawer.getByRole("switch", { name: "Include row 2" }).click();
  await expect(drawer.getByRole("switch", { name: "Include row 2" })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(header(page)).toContainText("6 rows to review");
  await expect(reviewList(page)).toContainText("STREAMING MONTHLY 0827");

  // The choice is saved at once, so it survives a reload (FR-022).
  await page.reload();
  await expect(header(page)).toContainText("6 rows to review");
  const [batch] = await storedRecords<PendingBatch>(page, "pendingBatch");
  expect(batch?.rows.find((row) => row.rowNumber === 2)).toMatchObject({
    duplicate: true,
    included: true,
  });
});

test("lists unparsable rows with their cells and reason, outside review (scenario 11)", async ({
  page,
}) => {
  await importAugust(page);
  await expect(reviewList(page)).not.toContainText("Newspaper");
  await header(page).getByRole("button", { name: "2 unparsable" }).click();
  const drawer = page.getByRole("dialog", { name: "Unparsable rows" });
  const newspaper = drawer.getByRole("listitem").filter({ hasText: "Row 14" });
  await expect(newspaper).toContainText("32.08.2026");
  await expect(newspaper).toContainText("Newspaper");
  await expect(newspaper).toContainText(
    messageFor({ code: "date-unreadable", details: { cell: "32.08.2026", format: "DD.MM.YYYY" } }),
  );
  await expect(drawer.getByRole("listitem").filter({ hasText: "Row 15" })).toContainText(
    messageFor({ code: "amount-missing" }),
  );
  // These rows cannot be included.
  await expect(drawer.getByRole("switch")).toHaveCount(0);
});

test("shows vendor groups collapsed and largest first, then plain rows by date (scenario 16)", async ({
  page,
}) => {
  await importAugust(page);
  await expect(vendorGroups(page)).toHaveCount(2);
  await expect(vendorGroups(page).nth(0)).toHaveAccessibleName("Shop, expenses");
  await expect(vendorGroups(page).nth(1)).toHaveAccessibleName("Bäckerei Krüger, expenses");

  // Three purchases from Shop form one group, collapsed.
  const shop = group(page, "Shop, expenses");
  await expect(shop).toContainText("3 rows");
  await expect(shop).toContainText("-€88.19");
  await expect(shop).not.toContainText("Groceries");

  // The refund and both rows without a counterparty are plain rows, by date.
  await expect(plainRows(page)).toHaveCount(7);
  await expect(plainRows(page).nth(1)).toContainText("Return of goods");
  await expect(plainRows(page).nth(4)).toContainText("Cash withdrawal");
  await expect(plainRows(page).nth(5)).toContainText("Account fee €");
});

test("starts every row in its side's Uncategorised, and offers no Unaccounted (FR-029, FR-030)", async ({
  page,
}) => {
  await importAugust(page);
  const category = assignment(page, "Shop, expenses").getByLabel("Category", { exact: true });
  await expect(category).toHaveText("Uncategorised");
  await category.click();
  await expect(page.getByRole("option", { name: "Groceries", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Unaccounted", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Salary", exact: true })).toHaveCount(0);
});

test("assigning a category to a group assigns it to every row in it, at once (scenario 4)", async ({
  page,
}) => {
  await importAugust(page);
  await choose(page, assignment(page, "Shop, expenses"), "Category", "Groceries");
  const groceries = {
    type: "category",
    categoryId: await categoryId(page, "expense", "Groceries"),
  };
  await expect.poll(async () => (await storedRow(page, 3)).assignment).toEqual(groceries);
  expect((await storedRow(page, 5)).assignment).toEqual(groceries);
  expect((await storedRow(page, 7)).assignment).toEqual(groceries);
  // The refund is a plain row on the income side.
  expect((await storedRow(page, 6)).assignment).toEqual({
    type: "category",
    categoryId: await categoryId(page, "income", "Uncategorised"),
  });
});

test("an unfolded group gives each row its own category without affecting the others (scenario 5)", async ({
  page,
}) => {
  await importAugust(page);
  const shop = group(page, "Shop, expenses");
  await choose(page, assignment(shop, "Shop, expenses"), "Category", "Groceries");
  await shop.getByRole("button", { name: "Show rows" }).click();
  await expect(shop).toContainText("Groceries");
  await choose(page, assignment(shop, "row 5"), "Category", "Eating out");

  const eatingOut = await categoryId(page, "expense", "Eating out");
  await expect
    .poll(async () => (await storedRow(page, 5)).assignment)
    .toEqual({ type: "category", categoryId: eatingOut });
  const groceries = await categoryId(page, "expense", "Groceries");
  expect((await storedRow(page, 3)).assignment).toEqual({
    type: "category",
    categoryId: groceries,
  });
  await expect(
    assignment(shop, "Shop, expenses").getByLabel("Category", { exact: true }),
  ).toHaveText("Mixed");
});

test("without a counterparty column, every row is a plain row with its own category (scenario 6)", async ({
  page,
}) => {
  await saveDebitCreditProfile(page);
  await importWithProfile(page, { account: "Cash", file: "debit-credit.csv" });
  await expect(vendorGroups(page)).toHaveCount(0);
  await expect(plainRows(page)).toHaveCount(4);
  for (const row of await plainRows(page).all()) {
    await expect(row.getByLabel("Category", { exact: true })).toBeVisible();
  }
});

test("marks a payment to the user's own credit card as a transfer, and back (scenario 7)", async ({
  page,
}) => {
  await addAccount(page, "Credit card");
  await importAugust(page);
  const control = assignment(page, "row 11");
  await control.getByRole("switch", { name: "Transfer" }).click();
  await choose(page, control, "Transfer account", "Credit card");
  const accounts = await storedRecords<Account>(page, "accounts");
  const card = accounts.find((a) => a.name === "Credit card")!.id;
  await expect
    .poll(async () => (await storedRow(page, 11)).assignment)
    .toEqual({ type: "transfer", counterAccountId: card });

  // The counter-account select lists every account except the batch account.
  await control.getByLabel("Transfer account", { exact: true }).click();
  await expect(page.getByRole("option", { name: "Cash", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Credit card", exact: true }).click();

  // Switching back restores the side's Uncategorised.
  await control.getByRole("switch", { name: "Transfer" }).click();
  await expect(control.getByLabel("Category", { exact: true })).toHaveText("Uncategorised");
  const uncategorised = await categoryId(page, "expense", "Uncategorised");
  await expect
    .poll(async () => (await storedRow(page, 11)).assignment)
    .toEqual({ type: "category", categoryId: uncategorised });
});

test("assignments survive a reload (FR-022)", async ({ page }) => {
  await importAugust(page);
  await choose(page, assignment(page, "Shop, expenses"), "Category", "Groceries");
  await choose(page, assignment(page, "row 2"), "Category", "Salary");
  await expect(assignment(page, "row 2").getByLabel("Category", { exact: true })).toHaveText(
    "Salary",
  );
  await page.reload();
  await expect(
    assignment(page, "Shop, expenses").getByLabel("Category", { exact: true }),
  ).toHaveText("Groceries");
  await expect(assignment(page, "row 2").getByLabel("Category", { exact: true })).toHaveText(
    "Salary",
  );
});

const footer = (page: Page) => page.getByRole("region", { name: "Finish review" });

test("confirming states the count, books the rows as reviewed and opens Transactions (scenario 9)", async ({
  page,
}) => {
  await importAugust(page);
  await choose(page, assignment(page, "Shop, expenses"), "Category", "Groceries");
  await choose(page, assignment(page, "row 2"), "Category", "Salary");
  await expect(assignment(page, "row 2").getByLabel("Category", { exact: true })).toHaveText(
    "Salary",
  );

  // Cancelling the confirmation keeps the batch.
  await footer(page).getByRole("button", { name: "Confirm 13 transactions" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("13 transactions");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(await storedRecords(page, "pendingBatch")).toHaveLength(1);

  await footer(page).getByRole("button", { name: "Confirm 13 transactions" }).click();
  await dialog.getByRole("button", { name: "Add 13 transactions" }).click();

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByText(notifications.importConfirmed(13, "Cash"))).toBeVisible();
  expect(await storedRecords(page, "pendingBatch")).toEqual([]);
  const transactions = await storedRecords<Transaction>(page, "transactions");
  expect(transactions).toHaveLength(13);
  const groceries = await categoryId(page, "expense", "Groceries");
  const shop = transactions.filter((t) => t.kind === "expense" && t.categoryId === groceries);
  expect(shop.map((t) => t.amountCents).sort()).toEqual([1299, 3000, 4520]);
  const untouched = transactions.find((t) => t.description === "Cash withdrawal");
  expect(untouched).toMatchObject({
    kind: "expense",
    categoryId: await categoryId(page, "expense", "Uncategorised"),
  });

  // Balances update: Cash now holds the net of the 13 rows (FR-002).
  await page.goto("/#/accounts");
  await expect(page.getByRole("row").filter({ hasText: "Cash" })).toContainText(euros(199141));
});

test("discarding asks first, then books nothing (scenario 10)", async ({ page }) => {
  await importAugust(page);
  await footer(page).getByRole("button", { name: "Discard" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Discard import" }).click();

  await expect(page).toHaveURL(/#\/import$/);
  await expect(page.getByText(notifications.importDiscarded("mybank-2026-08.csv"))).toBeVisible();
  expect(await storedRecords(page, "pendingBatch")).toEqual([]);
  expect(await storedRecords(page, "transactions")).toEqual([]);
});
