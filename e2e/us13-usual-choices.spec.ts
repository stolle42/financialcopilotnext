import { writeFileSync } from "node:fs";
import type { Locator, Page, TestInfo } from "@playwright/test";
import type { Account, Category, ParsedRow, PendingBatch, Transaction } from "../src/domain/types";
import { standInCategoriser, suggestBySide, suggestButton, turnOnAiFeatures } from "./support/ai";
import { addAccount, pickCategory, storedRecords } from "./support/app";
import { backupText, restoreBackup, storedData, type BackupData } from "./support/backup";
import { generateUsualChoicesData } from "./support/generate";
import { saveMyBankProfile } from "./support/import";
import { expect, setToday, test } from "./support/test";

// User Story 13 (FR-145 – FR-148, FR-154, FR-158) and SC-031, on the scenarios of quickstart.md
// (US13): a restored ledger whose vendors were sorted in the proportions of the story, then the
// next month's file; and the generated pair of SC-031. The marks of v1.8 are not in the types
// yet, so they are read as they are stored (data-model.md, Assignment).

const RESTORE_TIMEOUT = 90_000;

const header = (page: Page) => page.getByRole("region", { name: "Batch" });
const reviewList = (page: Page) => page.getByRole("region", { name: "Rows to review" });
const footer = (page: Page) => page.getByRole("region", { name: "Finish review" });
const assignment = (scope: Page | Locator, name: string) =>
  scope.getByRole("group", { name: `Assignment of ${name}`, exact: true });
const transferSwitch = (scope: Page | Locator, name: string) =>
  assignment(scope, name).getByRole("switch", { name: "Transfer" });

/** The sentence of FR-154 that explains the mark "From earlier". */
const EARLIER_SENTENCE = /most earlier transactions of this vendor/i;

interface StoredRow extends Omit<ParsedRow, "assignment"> {
  assignment: ParsedRow["assignment"] & { usual?: true; suggested?: true };
}

async function pendingRows(page: Page): Promise<StoredRow[]> {
  const [batch] = await storedRecords<PendingBatch>(page, "pendingBatch");
  return (batch?.rows ?? []).filter(
    (row): row is ParsedRow => row.status === "parsed",
  ) as StoredRow[];
}

const rowOf = async (page: Page, rowNumber: number) =>
  (await pendingRows(page)).find((row) => row.rowNumber === rowNumber)!;

const CHECKING = {
  id: "checking",
  name: "Checking",
  type: "checking",
  openingBalanceCents: 0,
} as const satisfies Account;

/** The seed's own data, which a restored backup builds on. */
async function freshData(page: Page): Promise<BackupData> {
  await page.goto("/");
  return storedData(page);
}

/** A file of the MyBank layout (`;` and comma decimals) from `lines`, under the test's folder. */
function writeBankFile(testInfo: TestInfo, name: string, lines: string[]): string {
  const path = testInfo.outputPath(name);
  writeFileSync(path, ["Date;Payee;Purpose;Amount", ...lines].join("\r\n") + "\r\n", "latin1");
  return path;
}

/** Imports the file at `path` into `account` with the saved format and waits for review. */
async function importFrom(page: Page, account: string, path: string) {
  await page.goto("/#/import");
  const form = page.getByRole("region", { name: "Import a file" });
  await form.getByLabel("Account", { exact: true }).click();
  await page.getByRole("option", { name: account, exact: true }).click();
  await form.getByLabel("Bank file").setInputFiles(path);
  await form.getByLabel("Bank CSV format", { exact: true }).click();
  await page.getByRole("option", { name: "MyBank", exact: true }).click();
  await form.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/#\/import\/review$/);
}

/** Confirms the batch through the footer and its confirmation, as it stands. */
async function confirmReview(page: Page) {
  await footer(page)
    .getByRole("button", { name: /^Confirm / })
    .click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: /^Add / }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#\/$/);
}

/**
 * The ledger of the story's scenarios, all on Checking in September 2026, and a category the seed
 * lacks: of the 5 expenses of vendor REWE 3 are in Groceries, and its one income, a refund, is in
 * Refunds; of Amazon's 4, 2 are in Shopping and 2 in Leisure; of Geldautomat's 5, 4 are transfers
 * to Cash. The vendors are stored as the confirmation of v1.8 stores them (FR-145).
 */
function usualBackup(base: BackupData): BackupData {
  const category = (side: Category["side"], name: string) =>
    base.categories.find((c) => c.side === side && c.name === name)!.id;
  const refunds: Category = {
    id: "refunds",
    side: "income",
    name: "Refunds",
    color: "#868e96",
    role: null,
  };
  const cash = base.accounts.find((a) => a.name === "Cash")!;
  let seq = base.transactions.reduce((max, t) => Math.max(max, t.seq), 0);
  const earlier: Transaction[] = [];
  const add = (day: number, vendor: string, cents: number, fields: object) => {
    seq += 1;
    earlier.push({
      id: `earlier-${seq}`,
      seq,
      date: `2026-09-${String(day).padStart(2, "0")}`,
      amountCents: cents,
      accountId: CHECKING.id,
      description: `Confirmed in September (${vendor})`,
      vendor,
      ...fields,
    } as unknown as Transaction);
  };
  const expense = (categoryName: string) => ({
    kind: "expense",
    categoryId: category("expense", categoryName),
  });

  const rewe = ["Groceries", "Groceries", "Groceries", "Eating out", "Shopping"];
  rewe.forEach((name, n) => add(1 + n, "REWE", 2_000 + n * 10, expense(name)));
  add(8, "REWE", 150, { kind: "income", categoryId: refunds.id });
  ["Shopping", "Shopping", "Leisure", "Leisure"].forEach((name, n) =>
    add(9 + n, "Amazon", 1_500 + n * 10, expense(name)),
  );
  for (let n = 0; n < 4; n++) {
    add(13 + n, "Geldautomat", 5_000 + n * 100, {
      kind: "transfer",
      destinationAccountId: cash.id,
    });
  }
  add(17, "Geldautomat", 777, expense("Shopping"));

  return {
    ...base,
    accounts: [...base.accounts, CHECKING],
    categories: [...base.categories, refunds],
    transactions: [...base.transactions, ...earlier],
  };
}

/** Restores `backup`, with AI features on and the MyBank format saved (a restore replaces them). */
async function setUp(page: Page, backup: BackupData) {
  await setToday(page, "2026-11-05");
  await restoreBackup(page, backupText(backup), undefined, { timeout: RESTORE_TIMEOUT });
  await saveMyBankProfile(page);
}

/** October's file: REWE twice and a refund, Amazon twice, Geldautomat twice, and a new vendor. */
const OCTOBER = [
  "03.10.2026;REWE;Weekly shop;-45,20", // 2
  "10.10.2026;REWE;Weekly shop;-38,10", // 3
  "17.10.2026;REWE;Bottle deposit refund;4,50", // 4
  "05.10.2026;Amazon;Order;-29,99", // 5
  "12.10.2026;Amazon;Order;-14,50", // 6
  "08.10.2026;Geldautomat;Withdrawal;-100,00", // 7
  "15.10.2026;Geldautomat;Withdrawal;-60,00", // 8
  "20.10.2026;Bakery;Bread;-3,20", // 9
];

test("vendors sorted before start in their usual category or transfer, marked, and any choice removes the mark (scenarios 1 – 5, 7)", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  await setUp(page, usualBackup(await freshData(page)));
  await turnOnAiFeatures(page);
  const standIn = await standInCategoriser(page, suggestBySide("Travel", "Gifts"));
  await importFrom(page, "Checking", writeBankFile(testInfo, "october.csv", OCTOBER));
  await expect(header(page)).toContainText("8 rows to review");

  const categories = await storedRecords<Category>(page, "categories");
  const idOf = (side: Category["side"], name: string) =>
    categories.find((c) => c.side === side && c.name === name)!.id;
  const accounts = await storedRecords<Account>(page, "accounts");
  const cashId = accounts.find((a) => a.name === "Cash")!.id;
  const uncategorised = (side: Category["side"]) => ({
    type: "category",
    categoryId: categories.find((c) => c.side === side && c.role === "uncategorised")!.id,
  });

  // Scenario 1: REWE's rows start in Groceries, marked, on the group and on each row; the sentence
  // of FR-154 shows once, and is the mark's description on every one.
  const rewe = assignment(reviewList(page), "REWE, expenses");
  await expect(rewe).toContainText("Groceries");
  await expect(rewe).toContainText("From earlier");
  await expect(reviewList(page).getByText(EARLIER_SENTENCE)).toHaveCount(1);
  await expect(rewe.getByText("From earlier")).toHaveAccessibleDescription(EARLIER_SENTENCE);
  const groceries = {
    type: "category",
    categoryId: idOf("expense", "Groceries"),
  };
  for (const rowNumber of [2, 3]) {
    expect((await rowOf(page, rowNumber)).assignment).toStrictEqual({ ...groceries, usual: true });
  }
  await reviewList(page)
    .getByRole("group", { name: "REWE, expenses" })
    .getByRole("button", { name: "Show rows" })
    .click();
  for (const rowNumber of [2, 3]) {
    const row = assignment(reviewList(page), `row ${rowNumber}`);
    await expect(row).toContainText("Groceries");
    await expect(row).toContainText("From earlier");
  }

  // Scenario 2: no category holds more than half of Amazon's, so its rows start in Uncategorised.
  const amazon = assignment(reviewList(page), "Amazon, expenses");
  await expect(amazon).toContainText("Uncategorised");
  await expect(amazon).not.toContainText("From earlier");
  for (const rowNumber of [5, 6]) {
    expect((await rowOf(page, rowNumber)).assignment).toStrictEqual(uncategorised("expense"));
  }

  // Scenario 3: the REWE refund counts only the vendor's incomes, so it starts in Refunds.
  const refund = assignment(reviewList(page), "row 4");
  await expect(refund).toContainText("Refunds");
  await expect(refund).toContainText("From earlier");
  expect((await rowOf(page, 4)).assignment).toStrictEqual({
    type: "category",
    categoryId: idOf("income", "Refunds"),
    usual: true,
  });

  // A vendor the ledger has never seen starts in Uncategorised, with no mark.
  expect((await rowOf(page, 9)).assignment).toStrictEqual(uncategorised("expense"));
  await expect(assignment(reviewList(page), "row 9")).not.toContainText("From earlier");

  // Scenario 7: Geldautomat's rows start as transfers to Cash, marked.
  const atm = assignment(reviewList(page), "Geldautomat, expenses");
  await expect(transferSwitch(reviewList(page), "Geldautomat, expenses")).toBeChecked();
  await expect(atm).toContainText("Cash");
  await expect(atm).toContainText("From earlier");
  for (const rowNumber of [7, 8]) {
    expect((await rowOf(page, rowNumber)).assignment).toStrictEqual({
      type: "transfer",
      counterAccountId: cashId,
      usual: true,
    });
  }

  // Turning Transfer off leaves them in "Uncategorised", with no mark.
  await transferSwitch(reviewList(page), "Geldautomat, expenses").click();
  await expect(transferSwitch(reviewList(page), "Geldautomat, expenses")).not.toBeChecked();
  await expect(atm).toContainText("Uncategorised");
  await expect(atm).not.toContainText("From earlier");
  for (const rowNumber of [7, 8]) {
    expect((await rowOf(page, rowNumber)).assignment).toStrictEqual(uncategorised("expense"));
  }

  // Scenario 4: picking Groceries again for a row removes its mark, and the other row keeps its.
  await pickCategory(page, assignment(reviewList(page), "row 2"), "Groceries");
  await expect(assignment(reviewList(page), "row 2")).not.toContainText("From earlier");
  await expect(assignment(reviewList(page), "row 3")).toContainText("From earlier");
  expect((await rowOf(page, 2)).assignment).toStrictEqual(groceries);
  expect((await rowOf(page, 3)).assignment).toStrictEqual({ ...groceries, usual: true });
  // The group shows Groceries, with no mark, since its rows no longer agree on it.
  await expect(rewe).toContainText("Groceries");
  await expect(rewe).not.toContainText("From earlier");

  // Scenario 5: Suggest categories sends only the rows still in "Uncategorised": Amazon's two,
  // Geldautomat's two and the Bakery; REWE's rows and the refund hold a category.
  await expect(suggestButton(page)).toHaveText("Suggest categories for 5 rows");
  await suggestButton(page).click();
  await expect.poll(() => standIn.requests.length).toBe(1);
  expect(standIn.requests[0]!.rows.map((row) => row.rowNumber).sort((a, b) => a - b)).toEqual([
    5, 6, 7, 8, 9,
  ]);
  await expect
    .poll(async () => (await rowOf(page, 9)).assignment)
    .toMatchObject({
      suggested: true,
    });
  expect((await rowOf(page, 3)).assignment).toStrictEqual({ ...groceries, usual: true });
  expect((await rowOf(page, 4)).assignment).toStrictEqual({
    type: "category",
    categoryId: idOf("income", "Refunds"),
    usual: true,
  });
  expect((await rowOf(page, 9)).assignment).not.toHaveProperty("usual");
});

test("a transaction edited after it was confirmed counts with its new category in the next import (scenario 6)", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  await setUp(page, usualBackup(await freshData(page)));
  await setToday(page, "2026-11-05");

  // Three Bakery rows are sorted into Groceries and confirmed; the vendor comes with them (FR-145).
  const october = writeBankFile(testInfo, "bakery-october.csv", [
    "02.10.2026;Bakery;Bread;-3,20",
    "09.10.2026;Bakery;Rolls;-4,10",
    "16.10.2026;Bakery;Cake;-12,40",
  ]);
  await importFrom(page, "Checking", october);
  await pickCategory(page, assignment(reviewList(page), "Bakery, expenses"), "Groceries");
  await confirmReview(page);
  const bakery = (await storedRecords<Transaction>(page, "transactions")).filter(
    (t) =>
      t.description.includes("Bread") ||
      t.description.includes("Rolls") ||
      t.description.includes("Cake"),
  );
  expect(bakery).toHaveLength(3);
  for (const transaction of bakery) expect(transaction).toHaveProperty("vendor", "Bakery");

  // On Transactions, two of the three move to Eating out, which is now the majority.
  await page.goto("/");
  for (const description of ["Rolls", "Cake"]) {
    await page
      .getByRole("list", { name: "Transactions" })
      .getByRole("listitem")
      .filter({ hasText: description })
      .getByRole("button", { name: "Edit transaction" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Edit transaction" });
    await pickCategory(page, dialog, "Eating out");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
  }

  // The next import starts the Bakery's rows in Eating out, marked.
  const november = writeBankFile(testInfo, "bakery-november.csv", [
    "04.11.2026;Bakery;Bread;-3,50",
    "05.11.2026;Bakery;Rolls;-4,00",
  ]);
  await importFrom(page, "Checking", november);
  const group = assignment(reviewList(page), "Bakery, expenses");
  await expect(group).toContainText("Eating out");
  await expect(group).toContainText("From earlier");
  const categories = await storedRecords<Category>(page, "categories");
  const eatingOut = categories.find((c) => c.side === "expense" && c.name === "Eating out")!;
  expect((await rowOf(page, 2)).assignment).toStrictEqual({
    type: "category",
    categoryId: eatingOut.id,
    usual: true,
  });
});

test("every row of a generated month starts with the choice its vendor's earlier transactions give (SC-031)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await setToday(page, "2026-11-05");
  const { backup, csv, expected, account, counterAccount } = generateUsualChoicesData(
    await freshData(page),
  );
  await restoreBackup(page, backupText(backup), undefined, { timeout: RESTORE_TIMEOUT });
  await saveMyBankProfile(page);

  await page.goto("/#/import");
  const form = page.getByRole("region", { name: "Import a file" });
  await form.getByLabel("Account", { exact: true }).click();
  await page.getByRole("option", { name: account, exact: true }).click();
  await form.getByLabel("Bank file").setInputFiles({
    name: "next-month.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "latin1"),
  });
  await form.getByLabel("Bank CSV format", { exact: true }).click();
  await page.getByRole("option", { name: "MyBank", exact: true }).click();
  await form.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/#\/import\/review$/);
  await expect(header(page)).toContainText("300 rows to review");

  const categories = await storedRecords<Category>(page, "categories");
  const accounts = await storedRecords<Account>(page, "accounts");
  const counterId = accounts.find((a) => a.name === counterAccount)!.id;
  const rows = await pendingRows(page);
  expect(rows).toHaveLength(expected.length);

  const sideOf = (row: StoredRow) => (row.amountCents > 0 ? "income" : "expense");
  const categoryNamed = (row: StoredRow, name: string) =>
    categories.find((c) => c.side === sideOf(row) && c.name === name)!.id;
  const uncategorisedOf = (row: StoredRow) =>
    categories.find((c) => c.side === sideOf(row) && c.role === "uncategorised")!.id;

  let marked = 0;
  for (const { rowNumber, vendor, choice } of expected) {
    const row = rows.find((r) => r.rowNumber === rowNumber)!;
    const where = `row ${rowNumber} (${vendor || "no vendor"})`;
    if (choice.kind === "category") {
      expect(row.assignment, where).toStrictEqual({
        type: "category",
        categoryId: categoryNamed(row, choice.categoryName),
        usual: true,
      });
      marked += 1;
    } else if (choice.kind === "transfer") {
      expect(choice.accountName).toBe(counterAccount);
      expect(row.assignment, where).toStrictEqual({
        type: "transfer",
        counterAccountId: counterId,
        usual: true,
      });
      marked += 1;
    } else {
      expect(row.assignment, where).toStrictEqual({
        type: "category",
        categoryId: uncategorisedOf(row),
      });
    }
  }
  expect(marked, "the generated month has rows with a usual choice").toBeGreaterThan(100);
  await expect(reviewList(page).getByText(EARLIER_SENTENCE)).toHaveCount(1);
});

// An account added by hand, with nothing in it, starts every row in "Uncategorised": nothing earlier.
test("a ledger without vendors starts every row in Uncategorised, with no mark (FR-146)", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  await setToday(page, "2026-11-05");
  await addAccount(page, "Checking");
  await saveMyBankProfile(page);
  await importFrom(page, "Checking", writeBankFile(testInfo, "october.csv", OCTOBER));
  await expect(header(page)).toContainText("8 rows to review");
  await expect(reviewList(page)).not.toContainText("From earlier");
  for (const row of await pendingRows(page)) {
    expect(row.assignment).not.toHaveProperty("usual");
    expect(row.assignment).toMatchObject({ type: "category" });
  }
});
