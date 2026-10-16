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
import { addAccount, addTransaction, choose, storedRecords } from "../support/app";
import {
  standInCategoriser,
  suggestBySide,
  suggestButton,
  suggestCategories,
  turnOnAiFeatures,
  type SuggestionReply,
  LOCAL_ONLY,
  onHostedCopy,
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

test.describe("Suggest categories (FR-090 – FR-094)", () => {
  test.skip(({ baseURL }) => onHostedCopy(baseURL), LOCAL_ONLY);
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
    await choose(page, assignment(page, "Shop, expenses"), "Category", "Travel");
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
    ["ai-failed", () => ({ status: 401, json: openAiError("Incorrect API key provided.") })],
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
  test.skip(({ baseURL }) => onHostedCopy(baseURL), LOCAL_ONLY);
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
    await expect(parking).toContainText("Transport");
    await expect(mark(parking)).toBeVisible();
    await expect(mark(assignment(page, "row 11"))).toHaveCount(0);
  });

  test("a group shows the mark only when all its rows hold the same suggested category", async ({
    page,
  }) => {
    await withSuggestions(page);

    const shop = assignment(page, "Shop, expenses");
    await expect(shop).toContainText("Groceries");
    await expect(mark(shop)).toBeVisible();

    const bakery = group(page, "Bäckerei Krüger, expenses");
    await expect(assignment(bakery, "Bäckerei Krüger, expenses")).toContainText("Mixed");
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

    await choose(page, assignment(page, "row 9"), "Category", "Transport");

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

    await choose(page, assignment(shop, "row 3"), "Category", "Groceries");

    await expect(mark(assignment(shop, "row 3"))).toHaveCount(0);
    await expect(assignment(shop, "Shop, expenses")).toContainText("Groceries");
    await expect(mark(assignment(shop, "Shop, expenses"))).toHaveCount(0);
    for (const rowNumber of [5, 7]) {
      await expect(mark(assignment(shop, `row ${rowNumber}`))).toBeVisible();
    }
  });

  test("a choice for the group removes the marks of all its rows", async ({ page }) => {
    await withSuggestions(page);

    await choose(page, assignment(page, "Shop, expenses"), "Category", "Groceries");

    await expect(mark(assignment(page, "Shop, expenses"))).toHaveCount(0);
    for (const rowNumber of [3, 5, 7]) {
      await expect
        .poll(async () => (await storedRow(page, rowNumber)).assignment)
        .not.toHaveProperty("suggested");
    }
  });

  test("the marks survive a reload, and a removed mark stays removed", async ({ page }) => {
    await withSuggestions(page);
    await choose(page, assignment(page, "row 9"), "Category", "Transport");
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
