import type { Locator, Page } from "@playwright/test";
import type {
  Account,
  Category,
  ParsedRow,
  PendingBatch,
  Transaction,
} from "../../src/domain/types";
import { openAiError } from "../../src/ai/testing";
import { messageFor, notifications, type MessageCode } from "../../src/ui/messages";
// A namespace import, so the spec loads even before the catalogue words a new message.
import * as catalogue from "../../src/ui/messages";
import {
  addAccount,
  addTransaction,
  choose,
  expectCategory,
  pickCategory,
  screenIntro,
  storedRecords,
} from "../support/app";
import { backupText, restoreBackup, storedData } from "../support/backup";
import {
  standInCategoriser,
  suggestBySide,
  suggestButton,
  suggestCategories,
  turnOnAiFeatures,
  type SuggestionReply,
} from "../support/ai";
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
  await expectCategory(assignment(page, "Shop, expenses"), "Uncategorised");
  await category.click();
  await expect(page.getByRole("option", { name: "Groceries", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Unaccounted", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Salary", exact: true })).toHaveCount(0);
});

test("assigning a category to a group assigns it to every row in it, at once (scenario 4)", async ({
  page,
}) => {
  await importAugust(page);
  await pickCategory(page, assignment(page, "Shop, expenses"), "Groceries");
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
  await pickCategory(page, assignment(shop, "Shop, expenses"), "Groceries");
  await shop.getByRole("button", { name: "Show rows" }).click();
  await expectCategory(shop, "Groceries");
  await pickCategory(page, assignment(shop, "row 5"), "Eating out");

  const eatingOut = await categoryId(page, "expense", "Eating out");
  await expect
    .poll(async () => (await storedRow(page, 5)).assignment)
    .toEqual({ type: "category", categoryId: eatingOut });
  const groceries = await categoryId(page, "expense", "Groceries");
  expect((await storedRow(page, 3)).assignment).toEqual({
    type: "category",
    categoryId: groceries,
  });
  await expectCategory(assignment(shop, "Shop, expenses"), "Mixed");
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
  await expectCategory(control, "Uncategorised");
  const uncategorised = await categoryId(page, "expense", "Uncategorised");
  await expect
    .poll(async () => (await storedRow(page, 11)).assignment)
    .toEqual({ type: "category", categoryId: uncategorised });
});

test("assignments survive a reload (FR-022)", async ({ page }) => {
  await importAugust(page);
  await pickCategory(page, assignment(page, "Shop, expenses"), "Groceries");
  await pickCategory(page, assignment(page, "row 2"), "Salary");
  await expectCategory(assignment(page, "row 2"), "Salary");
  await page.reload();
  await expectCategory(assignment(page, "Shop, expenses"), "Groceries");
  await expectCategory(assignment(page, "row 2"), "Salary");
});

const footer = (page: Page) => page.getByRole("region", { name: "Finish review" });

test("confirming states the count, books the rows as reviewed and opens Transactions (scenario 9)", async ({
  page,
}) => {
  await importAugust(page);
  await pickCategory(page, assignment(page, "Shop, expenses"), "Groceries");
  await pickCategory(page, assignment(page, "row 2"), "Salary");
  await expectCategory(assignment(page, "row 2"), "Salary");

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

test.describe("Suggest categories (FR-090 – FR-094)", () => {
  const suggestions = (page: Page) => page.getByRole("region", { name: "Suggestions" });

  const outcome = (page: Page) => suggestions(page).getByRole("status");
  const confirmButton = (page: Page) =>
    page.getByRole("region", { name: "Finish review" }).getByRole("button", { name: /^Confirm/ });

  /** The August file's rows under review in review order: Shop, Bäckerei, then plain rows by date. */
  const reviewOrder = [3, 5, 7, 4, 8, 17, 2, 6, 9, 11, 12, 13, 16];

  async function storedRows(page: Page): Promise<ParsedRow[]> {
    const [batch] = await storedRecords<PendingBatch>(page, "pendingBatch");
    return batch!.rows.filter((row): row is ParsedRow => row.status === "parsed");
  }

  test("with AI features off, the button is unavailable and review says they are needed, linking to Settings (FR-090)", async ({
    page,
  }) => {
    const standIn = await standInCategoriser(page);
    await importAugust(page);

    await expect(suggestButton(page)).toBeDisabled();
    await expect(suggestions(page)).toContainText(catalogue.aiFeaturesNeeded);
    expect(standIn.bodies).toEqual([]);
    await suggestions(page).getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/#\/settings$/);
  });

  test("with AI features on, the button names its rows, and nothing is sent before the click", async ({
    page,
  }) => {
    const standIn = await standInCategoriser(page);
    await importAugust(page);
    await turnOnAiFeatures(page);

    await expect(suggestButton(page)).toHaveText("Suggest categories for 13 rows");
    await expect(suggestButton(page)).toBeEnabled();
    await expect(suggestions(page)).not.toContainText(catalogue.aiFeaturesNeeded);
    await page.waitForTimeout(200);
    expect(standIn.bodies).toEqual([]);
  });

  test("with AI features on, selecting it sends at once, without a dialog (FR-095)", async ({
    page,
  }) => {
    const standIn = await standInCategoriser(page);
    await importAugust(page);
    await turnOnAiFeatures(page);

    await suggestButton(page).click();

    await expect(outcome(page)).toHaveText(notifications.categoriesSuggested(0, 13));
    expect(standIn.bodies).toHaveLength(1);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });

  test("sends the rows in review order, the category names and an earlier decision, and no amount or date (FR-091)", async ({
    page,
  }) => {
    const standIn = await standInCategoriser(page);
    await page.goto("/");
    await addTransaction(page, {
      amount: "12.50",
      category: "Groceries",
      description: "Weekly shop",
    });
    await importAugust(page);
    await turnOnAiFeatures(page);

    await suggestCategories(page);

    await expect.poll(() => standIn.bodies.length).toBe(1);
    const body = standIn.bodies[0]!;
    expect(body.rows.map((row) => row.rowNumber)).toEqual(reviewOrder);
    expect(body.rows[0]).toStrictEqual({
      rowNumber: 3,
      side: "expense",
      counterparty: "Shop",
      description: "Groceries",
    });
    expect(body.categories.expense).toContain("Groceries");
    expect(body.categories.expense).not.toContain("Uncategorised");
    expect(body.categories.expense).not.toContain("Unaccounted");
    expect(body.categories.income).toContain("Salary");
    expect(body.examples).toContainEqual({
      side: "expense",
      description: "Weekly shop",
      category: "Groceries",
    });
    const text = JSON.stringify(body);
    for (const leak of ["amountCents", '"date"', "2026-08", "accountId", "fileName", "mybank"]) {
      expect(text).not.toContain(leak);
    }
  });

  test("after the answer, counts the rows filled; named rows hold their category, marked, and bad names change nothing (FR-092, FR-094)", async ({
    page,
  }) => {
    await standInCategoriser(page, () => ({
      json: {
        suggestions: [
          { rowNumber: 3, category: "Groceries" },
          { rowNumber: 5, category: " groceries" },
          { rowNumber: 2, category: "Salary" },
          { rowNumber: 16, category: "Netflix" },
          { rowNumber: 9, category: "Salary" },
          { rowNumber: 11, category: "Unaccounted" },
        ],
      },
    }));
    await importAugust(page);
    await turnOnAiFeatures(page);

    await suggestCategories(page);

    await expect(outcome(page)).toHaveText(notifications.categoriesSuggested(3, 13));
    const groceries = await categoryId(page, "expense", "Groceries");
    const salary = await categoryId(page, "income", "Salary");
    for (const rowNumber of [3, 5]) {
      expect((await storedRow(page, rowNumber)).assignment).toEqual({
        type: "category",
        categoryId: groceries,
        suggested: true,
      });
    }
    expect((await storedRow(page, 2)).assignment).toEqual({
      type: "category",
      categoryId: salary,
      suggested: true,
    });
    for (const rowNumber of [16, 9, 11]) {
      expect((await storedRow(page, rowNumber)).assignment).not.toHaveProperty("suggested");
    }
  });

  test("while the AI answers, the button says so, Confirm waits, and a choice made meanwhile is kept (FR-027, FR-092)", async ({
    page,
  }) => {
    const standIn = await standInCategoriser(page, suggestBySide("Groceries", "Salary"));
    await importAugust(page);
    await turnOnAiFeatures(page);
    standIn.hold();

    await suggestCategories(page);

    await expect(suggestButton(page)).toHaveText("Asking the AI…");
    await expect(suggestButton(page)).toBeDisabled();
    await expect(confirmButton(page)).toBeDisabled();
    await pickCategory(page, assignment(page, "Shop, expenses"), "Travel");
    const travel = await categoryId(page, "expense", "Travel");
    await expect
      .poll(async () => (await storedRow(page, 3)).assignment)
      .toEqual({ type: "category", categoryId: travel });

    standIn.release();

    await expect(outcome(page)).toHaveText(notifications.categoriesSuggested(10, 13));
    for (const rowNumber of [3, 5, 7]) {
      expect((await storedRow(page, rowNumber)).assignment).toEqual({
        type: "category",
        categoryId: travel,
      });
    }
    await expect(confirmButton(page)).toBeEnabled();
  });

  test("leaving review while the AI answers cancels the request and fills nothing (FR-090)", async ({
    page,
  }) => {
    const standIn = await standInCategoriser(page, suggestBySide("Groceries", "Salary"));
    await importAugust(page);
    await turnOnAiFeatures(page);
    standIn.hold();
    await suggestCategories(page);
    await expect.poll(() => standIn.bodies.length).toBe(1);

    await page.goto("/#/");
    standIn.release();
    await page.waitForTimeout(300);
    await page.goto("/#/import/review");

    await expect(suggestButton(page)).toHaveText("Suggest categories for 13 rows");
    for (const row of await storedRows(page)) {
      expect(row.assignment).not.toHaveProperty("suggested");
    }
  });

  const failures: [MessageCode, SuggestionReply][] = [
    ["ai-unreachable", () => "unreachable"],
    [
      "ai-failed",
      () => ({ status: 429, json: openAiError("Rate limit reached.", "rate_limit_exceeded") }),
    ],
    ["ai-answer-invalid", () => ({ json: { message: "Workflow was started" } })],
  ];
  for (const [code, reply] of failures) {
    test(`${code}: shows its message in review's alert and changes no row (FR-094)`, async ({
      page,
    }) => {
      await standInCategoriser(page, reply);
      await importAugust(page);
      await turnOnAiFeatures(page);
      const before = await storedRows(page);

      await suggestCategories(page);

      await expect(page.getByRole("main").getByRole("alert")).toHaveText(messageFor({ code }));
      expect(await storedRows(page)).toEqual(before);
      await expect(suggestButton(page)).toBeEnabled();
    });
  }

  test("the button is unavailable once no row is left in Uncategorised", async ({ page }) => {
    await standInCategoriser(page, suggestBySide("Groceries", "Salary"));
    await importAugust(page);
    await turnOnAiFeatures(page);

    await suggestCategories(page);

    await expect(outcome(page)).toHaveText(notifications.categoriesSuggested(13, 13));
    await expect(suggestButton(page)).toHaveText("Suggest categories for 0 rows");
    await expect(suggestButton(page)).toBeDisabled();
  });
});

test.describe("the suggested mark (FR-093)", () => {
  const mark = (scope: Locator) => scope.getByText("Suggested", { exact: true });

  /**
   * Imports August with AI features on and lets the AI's stand-in suggest: Groceries for every
   * Shop purchase, a mix for the Bäckerei Krüger group, and Transport for the parking ticket.
   */
  async function withSuggestions(page: Page) {
    await standInCategoriser(page, () => ({
      json: {
        suggestions: [
          { rowNumber: 3, category: "Groceries" },
          { rowNumber: 5, category: "Groceries" },
          { rowNumber: 7, category: "Groceries" },
          { rowNumber: 4, category: "Eating out" },
          { rowNumber: 8, category: "Groceries" },
          { rowNumber: 17, category: "Eating out" },
          { rowNumber: 9, category: "Transport" },
        ],
      },
    }));
    await importAugust(page);
    await turnOnAiFeatures(page);
    await suggestCategories(page);

    await expect(page.getByRole("region", { name: "Suggestions" }).getByRole("status")).toHaveText(
      notifications.categoriesSuggested(7, 13),
    );
  }

  test("a suggested row shows the mark next to its category; a row the AI left alone does not", async ({
    page,
  }) => {
    await withSuggestions(page);

    const parking = assignment(page, "row 9");
    await expectCategory(parking, "Transport");
    await expect(mark(parking)).toBeVisible();
    await expect(mark(assignment(page, "row 11"))).toHaveCount(0);
  });

  test("a group shows the mark only when all its rows hold the same suggested category", async ({
    page,
  }) => {
    await withSuggestions(page);

    const shop = assignment(page, "Shop, expenses");
    await expectCategory(shop, "Groceries");
    await expect(mark(shop)).toBeVisible();

    const bakery = group(page, "Bäckerei Krüger, expenses");
    await expectCategory(assignment(bakery, "Bäckerei Krüger, expenses"), "Mixed");
    await expect(mark(assignment(bakery, "Bäckerei Krüger, expenses"))).toHaveCount(0);
    await bakery.getByRole("button", { name: "Show rows" }).click();
    for (const rowNumber of [4, 8, 17]) {
      await expect(mark(assignment(bakery, `row ${rowNumber}`))).toBeVisible();
    }
  });

  test("choosing the suggested category itself removes the mark, on screen and in storage", async ({
    page,
  }) => {
    await withSuggestions(page);
    const transport = await categoryId(page, "expense", "Transport");

    await pickCategory(page, assignment(page, "row 9"), "Transport");

    await expect(mark(assignment(page, "row 9"))).toHaveCount(0);
    await expect
      .poll(async () => (await storedRow(page, 9)).assignment)
      .toEqual({ type: "category", categoryId: transport });
  });

  test("a group whose rows share a category, but not all as suggestions, shows it without the mark", async ({
    page,
  }) => {
    await withSuggestions(page);
    const shop = group(page, "Shop, expenses");
    await shop.getByRole("button", { name: "Show rows" }).click();

    await pickCategory(page, assignment(shop, "row 3"), "Groceries");

    await expect(mark(assignment(shop, "row 3"))).toHaveCount(0);
    await expectCategory(assignment(shop, "Shop, expenses"), "Groceries");
    await expect(mark(assignment(shop, "Shop, expenses"))).toHaveCount(0);
    for (const rowNumber of [5, 7]) {
      await expect(mark(assignment(shop, `row ${rowNumber}`))).toBeVisible();
    }
  });

  test("a choice for the group removes the marks of all its rows", async ({ page }) => {
    await withSuggestions(page);

    await pickCategory(page, assignment(page, "Shop, expenses"), "Groceries");

    await expect(mark(assignment(page, "Shop, expenses"))).toHaveCount(0);
    for (const rowNumber of [3, 5, 7]) {
      await expect
        .poll(async () => (await storedRow(page, rowNumber)).assignment)
        .not.toHaveProperty("suggested");
    }
  });

  test("the marks survive a reload, and a removed mark stays removed", async ({ page }) => {
    await withSuggestions(page);
    await pickCategory(page, assignment(page, "row 9"), "Transport");
    await expect(mark(assignment(page, "row 9"))).toHaveCount(0);

    await page.reload();

    await expect(mark(assignment(page, "Shop, expenses"))).toBeVisible();
    await expect(mark(assignment(page, "row 9"))).toHaveCount(0);
  });

  test("confirming books suggested rows like chosen ones, and the ledger keeps no mark", async ({
    page,
  }) => {
    await withSuggestions(page);
    const groceries = await categoryId(page, "expense", "Groceries");

    await page
      .getByRole("region", { name: "Finish review" })
      .getByRole("button", { name: /^Confirm/ })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Add 13 transactions" })
      .click();
    await expect(page).toHaveURL(/#\/$/);

    const booked = await storedRecords<Transaction>(page, "transactions");
    const shopPurchases = booked.filter((t) => t.kind === "expense" && t.categoryId === groceries);
    expect(shopPurchases.length).toBeGreaterThanOrEqual(4);
    for (const transaction of booked) expect(transaction).not.toHaveProperty("suggested");
  });
});

const REVIEW_INTRO =
  "Give each vendor group a category, then confirm. Nothing enters the ledger before you select " +
  "Confirm.";
const TRANSFER_LINE =
  "Transfer is for money moved between two of your own accounts. It counts as neither spending " +
  "nor income.";

test("says under the heading what review is for, also with no import waiting (FR-137)", async ({
  page,
}) => {
  await page.goto("/#/import/review");
  await expect(page.getByRole("main").getByRole("button", { name: "Go to Import" })).toBeVisible();
  await expect(screenIntro(page)).toHaveText(REVIEW_INTRO);

  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
  await expect(screenIntro(page)).toHaveText(REVIEW_INTRO);
});

test("says once, above the rows, what the Transfer switch is for (FR-138)", async ({ page }) => {
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
  const main = page.getByRole("main");
  await expect(main.getByText(TRANSFER_LINE)).toHaveCount(1);
  const line = (await main.getByText(TRANSFER_LINE).boundingBox())!;
  const first = (await vendorGroups(page).first().boundingBox())!;
  expect(line.y).toBeLessThan(first.y);
});

// contracts/ui.md, review, Marks; FR-147, FR-154. A ledger whose vendors were sorted before gives
// August's rows their usual categories, marked "From earlier", beside the AI's "Suggested". The
// vendors of v1.8 are not in the types yet, so the earlier transactions are written as plain data.
test.describe("the marks: Suggested and From earlier (FR-147, FR-154)", () => {
  const SENTENCE = /most earlier transactions of this vendor/i;
  const earlier = (scope: Locator) => scope.getByText("From earlier", { exact: true });
  const suggested = (scope: Locator) => scope.getByText("Suggested", { exact: true });

  /** Cash's July: Shop all in Groceries, Bäckerei Krüger 2 of 3 in Eating out, Parking in Transport. */
  async function withEarlierMonth(page: Page) {
    await page.goto("/");
    const base = await storedData(page);
    const cash = base.accounts.find((a) => a.name === "Cash")!;
    const expenseId = (name: string) =>
      base.categories.find((c) => c.side === "expense" && c.name === name)!.id;
    let seq = base.transactions.reduce((max, t) => Math.max(max, t.seq), 0);
    const added: Transaction[] = [];
    const add = (vendor: string, categoryName: string) => {
      seq += 1;
      added.push({
        id: `july-${seq}`,
        seq,
        date: "2026-07-10",
        amountCents: 1_000 + seq,
        accountId: cash.id,
        description: `July (${vendor})`,
        kind: "expense",
        categoryId: expenseId(categoryName),
        vendor,
      } as unknown as Transaction);
    };
    for (const category of ["Groceries", "Groceries", "Groceries"]) add("Shop", category);
    for (const category of ["Eating out", "Eating out", "Groceries"]) {
      add("Bäckerei Krüger", category);
    }
    for (const category of ["Transport", "Transport", "Transport"]) add("Parking", category);
    const backup = { ...base, transactions: [...base.transactions, ...added] };
    await restoreBackup(page, backupText(backup), undefined, { timeout: 60_000 });
    await importAugust(page);
  }

  test("each mark differs from the other in icon and word", async ({ page }) => {
    await standInCategoriser(page, suggestBySide("Shopping", "Gifts"));
    await withEarlierMonth(page);
    await turnOnAiFeatures(page);
    await suggestCategories(page);
    await expect(suggestButton(page)).toBeEnabled();

    // Shop's rows hold Groceries from earlier; the credit card's row, which no earlier
    // transaction names, holds the AI's suggestion.
    const usual = assignment(page, "row 3");
    await expect(earlier(usual)).toBeVisible();
    await expect(usual.locator("svg.lucide-history")).toHaveCount(1);
    await expect(usual.locator("svg.lucide-sparkles")).toHaveCount(0);
    await expect(suggested(usual)).toHaveCount(0);

    const ai = assignment(page, "row 11");
    await expect(suggested(ai)).toBeVisible();
    await expect(ai.locator("svg.lucide-sparkles")).toHaveCount(1);
    await expect(ai.locator("svg.lucide-history")).toHaveCount(0);
    await expect(earlier(ai)).toHaveCount(0);
  });

  test("the sentence shows once, above the first item that holds the mark, and describes the mark on every row", async ({
    page,
  }) => {
    await withEarlierMonth(page);

    await expect(reviewList(page).getByText(SENTENCE)).toHaveCount(1);
    const sentence = (await reviewList(page).getByText(SENTENCE).boundingBox())!;
    const first = (await vendorGroups(page).first().boundingBox())!;
    expect(sentence.y).toBeLessThan(first.y);

    const shop = group(page, "Shop, expenses");
    await shop.getByRole("button", { name: "Show rows" }).click();
    await expect(earlier(assignment(shop, "Shop, expenses"))).toHaveAccessibleDescription(SENTENCE);
    for (const rowNumber of [3, 5, 7]) {
      await expect(earlier(assignment(shop, `row ${rowNumber}`))).toHaveAccessibleDescription(
        SENTENCE,
      );
    }
    await expect(earlier(assignment(page, "row 9"))).toHaveAccessibleDescription(SENTENCE);
  });

  test("a group whose rows are mixed shows no mark, and its unfolded rows show theirs", async ({
    page,
  }) => {
    await withEarlierMonth(page);
    const bakery = group(page, "Bäckerei Krüger, expenses");
    await expect(earlier(assignment(bakery, "Bäckerei Krüger, expenses"))).toBeVisible();

    await bakery.getByRole("button", { name: "Show rows" }).click();
    await pickCategory(page, assignment(bakery, "row 4"), "Travel");

    const header = assignment(bakery, "Bäckerei Krüger, expenses");
    await expectCategory(header, "Mixed");
    await expect(earlier(header)).toHaveCount(0);
    await expect(earlier(assignment(bakery, "row 4"))).toHaveCount(0);
    for (const rowNumber of [8, 17]) {
      await expect(earlier(assignment(bakery, `row ${rowNumber}`))).toBeVisible();
    }
  });
});

// contracts/ui.md, review, current item and seen items; FR-150, FR-151, FR-154. The icons are
// images named "Current item" and "Seen", so they differ in shape as well as colour.
test.describe("the current and the seen items (FR-150, FR-151)", () => {
  const current = (page: Page) => reviewList(page).locator('[aria-current="true"]');
  const seenIcons = (scope: Page | Locator) => scope.getByRole("img", { name: "Seen" });
  const currentIcons = (scope: Page | Locator) => scope.getByRole("img", { name: "Current item" });
  const textColour = (item: Locator) => item.evaluate((el) => getComputedStyle(el).color);

  test.beforeEach(async ({ page }) => {
    await importAugust(page);
  });

  test("the first item is current: a 2px outline, a 4px bar at its left and the arrow icon", async ({
    page,
  }) => {
    await expect(current(page)).toHaveCount(1);
    await expect(current(page)).toContainText("Shop");
    await expect(current(page)).toHaveCSS("outline-width", "2px");
    await expect(current(page)).toHaveCSS("outline-style", "solid");
    await expect(current(page)).toHaveCSS("border-left-width", "4px");
    await expect(currentIcons(current(page))).toHaveCount(1);
    await expect(seenIcons(current(page))).toHaveCount(0);
  });

  test("an item not seen has neither the icons nor the outline", async ({ page }) => {
    const other = plainRows(page).first();
    await expect(other).not.toHaveAttribute("aria-current", "true");
    await expect(currentIcons(other)).toHaveCount(0);
    await expect(seenIcons(other)).toHaveCount(0);
    await expect(other).not.toHaveCSS("border-left-width", "4px");
    await expect(other).not.toHaveCSS("outline-width", "2px");
  });

  test("a seen item that is not current has the check icon and its text in the secondary ink", async ({
    page,
  }) => {
    const other = plainRows(page).first();
    const unseenColour = await textColour(other);
    const shop = group(page, "Shop, expenses");

    await other.click();

    await expect(current(page)).toHaveCount(1);
    await expect(other).toHaveAttribute("aria-current", "true");
    await expect(seenIcons(shop)).toHaveCount(1);
    await expect(currentIcons(shop)).toHaveCount(0);
    await expect(shop).not.toHaveCSS("outline-width", "2px");
    expect(await textColour(shop)).not.toBe(unseenColour);
  });

  test("the current item scrolls into view when it changes", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 420 });
    // Tab goes through the items from the first, so the sixth is far down a short window.
    for (let n = 0; n < 6; n++) await page.keyboard.press("Tab");
    await expect(current(page)).toHaveCount(1);
    await expect(current(page)).toBeInViewport();
    await expect(current(page)).not.toContainText("Shop");
  });

  test("unfolding a group makes it current, and its rows follow it as items", async ({ page }) => {
    const shop = group(page, "Shop, expenses");
    await plainRows(page).first().click();
    await expect(shop).not.toHaveAttribute("aria-current", "true");

    await shop.getByRole("button", { name: "Show rows" }).click();

    await expect(shop).toHaveAttribute("aria-current", "true");
    const rows = shop.getByRole("listitem");
    await expect(rows).toHaveCount(3);
    await rows.nth(1).click();
    await expect(rows.nth(1)).toHaveAttribute("aria-current", "true");
    await expect(shop).not.toHaveAttribute("aria-current", "true");
    await expect(current(page)).toHaveCount(1);
  });

  test("clicking another item makes the current one seen, and opening its own list does not", async ({
    page,
  }) => {
    const shop = group(page, "Shop, expenses");
    await assignment(shop, "Shop, expenses").getByLabel("Category", { exact: true }).click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await expect(seenIcons(shop)).toHaveCount(0);
    await expect(shop).toHaveAttribute("aria-current", "true");
    await page.keyboard.press("Escape");
    await expect(seenIcons(shop)).toHaveCount(0);

    await plainRows(page).first().click();

    await expect(seenIcons(shop)).toHaveCount(1);
  });

  test("focusing Discard in the footer makes the current item seen", async ({ page }) => {
    await expect(seenIcons(reviewList(page))).toHaveCount(0);

    await footer(page).getByRole("button", { name: "Discard" }).focus();

    await expect(seenIcons(group(page, "Shop, expenses"))).toHaveCount(1);
    await expect(current(page)).toHaveCount(0);
  });

  test("a line above the items says that typing finds a category and Tab moves on (FR-154)", async ({
    page,
  }) => {
    const line = page.getByRole("main").getByText(/typing finds a category/i);
    await expect(line).toHaveCount(1);
    await expect(line).toContainText(/Tab moves to the next row/i);
    const lineBox = (await line.boundingBox())!;
    const firstBox = (await vendorGroups(page).first().boundingBox())!;
    expect(lineBox.y).toBeLessThan(firstBox.y);
  });
});
