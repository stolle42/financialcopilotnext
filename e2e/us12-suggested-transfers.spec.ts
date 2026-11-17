import { readFileSync, writeFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import type { Account, Category, ParsedRow, PendingBatch, Transaction } from "../src/domain/types";
import { addAccount, expectCategory, fixture, storedRecords } from "./support/app";
import { saveMyBankProfile } from "./support/import";
import { euros, expect, setToday, test } from "./support/test";

// User Story 12 (FR-142–FR-144, FR-154, FR-157), SC-029 and SC-030, on the fixtures of
// quickstart.md (US12): Checking's October file and the credit card's. They exchange the card
// payments: five are booked up to 4 days apart, a sixth 5 days apart, one for 58.50 against 60.00
// on Checking (the fee), and the shop's refund of 50.00 pairs with Checking's purchase, which is
// not a transfer at all. The marks of v1.8 are not in the types yet, so they are read as they are
// stored (data-model.md, PendingRow).

const CHECKING_FILE = "checking-2026-10.csv";
const CARD_FILE = "card-2026-10.csv";

const header = (page: Page) => page.getByRole("region", { name: "Batch" });
const reviewList = (page: Page) => page.getByRole("region", { name: "Rows to review" });
const footer = (page: Page) => page.getByRole("region", { name: "Finish review" });
const suggested = (page: Page) => page.getByRole("region", { name: "Suggested transfers" });
const assignment = (scope: Page | Locator, name: string) =>
  scope.getByRole("group", { name: `Assignment of ${name}`, exact: true });

/** The row of Suggested transfers whose text holds all of `texts`. */
function suggestedRow(page: Page, ...texts: string[]): Locator {
  return texts.reduce(
    (rows, text) => rows.filter({ hasText: text }),
    suggested(page).getByRole("listitem"),
  );
}

interface StoredRow extends Omit<ParsedRow, "assignment"> {
  assignment: ParsedRow["assignment"] & { pairedTransactionId?: string; usualCategoryId?: string };
}

async function pendingRows(page: Page): Promise<StoredRow[]> {
  const [batch] = await storedRecords<PendingBatch>(page, "pendingBatch");
  return (batch?.rows ?? []).filter(
    (row): row is ParsedRow => row.status === "parsed",
  ) as StoredRow[];
}

/** The sum of a fixture's Amount column in cents, which the account's balance must equal. */
function netOf(path: string): number {
  const [, ...lines] = readFileSync(path, "utf-8").trim().split(/\r?\n/);
  return lines
    .map((line) => line.split(";").at(-1)!)
    .reduce(
      (sum, cell) => sum + Math.round(Number(cell.replace(".", "").replace(",", ".")) * 100),
      0,
    );
}

async function balanceOf(page: Page, name: string) {
  await page.goto("/#/accounts");
  return page.getByRole("row").filter({ has: page.getByRole("cell", { name, exact: true }) });
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

/**
 * Confirms the batch through the footer and its confirmation, with the review as it stands, and
 * returns what the confirmation said. Transactions opens afterwards.
 */
async function confirmReview(page: Page): Promise<string> {
  await footer(page)
    .getByRole("button", { name: /^Confirm / })
    .click();
  const dialog = page.getByRole("alertdialog");
  const said = await dialog.innerText();
  await dialog.getByRole("button", { name: /^Add / }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#\/$/);
  return said;
}

/** Two accounts with nothing in them, and the MyBank format saved. */
async function setUp(page: Page) {
  await setToday(page, "2026-11-05");
  await addAccount(page, "Checking");
  await addAccount(page, "Credit card");
  await saveMyBankProfile(page);
}

test("suggests the other side of each transfer, confirms them as 5 transfers and adds nothing the second time", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await setUp(page);

  // Checking's file first: no other account holds anything yet, so nothing is suggested.
  await importFrom(page, "Checking", fixture(CHECKING_FILE));
  await expect(header(page)).toContainText("16 rows to review");
  await expect(suggested(page)).toHaveCount(0);
  await expect(header(page)).not.toContainText("suggested transfer");
  await confirmReview(page);
  expect(await storedRecords(page, "transactions")).toHaveLength(16);

  // Scenario 1: the card's file shows its 6 suggested transfers in the header and in a section of
  // their own, which explains itself in one sentence (FR-154).
  await importFrom(page, "Credit card", fixture(CARD_FILE));
  await expect(header(page)).toContainText("6 suggested transfers");
  await expect(page.getByRole("heading", { name: "Suggested transfers" })).toBeVisible();
  await expect(suggested(page)).toContainText(/other side of each .* in another account/);
  await expect(suggested(page)).toContainText(/Confirming makes the two one transfer/i);
  await expect(suggested(page)).toContainText(/Transfer off keeps them apart/i);
  await expect(suggested(page).getByRole("listitem")).toHaveCount(6);

  // Scenario 2: each is marked "Suggested", and "Pairs with:" names Checking's transaction.
  const checking = (await storedRecords<Account>(page, "accounts")).find(
    (a) => a.name === "Checking",
  )!;
  const ledger = await storedRecords<Transaction>(page, "transactions");
  const pairs: [string, string, string, number][] = [
    // [amount in the card's file, Checking's description, Checking's date, row number]
    ["€120.00", "Card payment", "2026-10-03", 3],
    ["€85.50", "Card payment", "2026-10-07", 4],
    ["€310.00", "Card payment", "2026-10-10", 7],
    ["€50.00", "Headphones", "2026-10-12", 8],
    ["€42.75", "Card payment", "2026-10-14", 11],
    ["€150.00", "Card payment", "2026-10-18", 12],
  ];
  const rows = await pendingRows(page);
  for (const [amount, description, date, rowNumber] of pairs) {
    const item = suggestedRow(page, amount);
    await expect(item).toHaveCount(1);
    await expect(item).toContainText("Suggested");
    await expect(item).toContainText("Pairs with:");
    await expect(item).toContainText("Checking");
    await expect(item).toContainText(description);
    const partner = ledger.find(
      (t) => t.accountId === checking.id && t.date === date && t.description === description,
    );
    expect(partner, `Checking holds ${description} of ${date}`).toBeDefined();
    expect(rows.find((r) => r.rowNumber === rowNumber)?.assignment).toMatchObject({
      type: "transfer",
      counterAccountId: checking.id,
      pairedTransactionId: partner!.id,
    });
  }

  // Scenario 3: the sixth payment (5 days apart) and the one with the fee (a different amount)
  // are not suggested; they stay in review as rows of "Checking" and no pair is saved for them.
  await expect(suggested(page)).not.toContainText("€95.00");
  await expect(suggested(page)).not.toContainText("€58.50");
  await expect(reviewList(page)).toContainText("€95.00");
  await expect(reviewList(page)).toContainText("€58.50");
  for (const rowNumber of [14, 15]) {
    expect(rows.find((r) => r.rowNumber === rowNumber)?.assignment).toMatchObject({
      type: "category",
    });
  }

  // Scenario 4: turning the shop refund's Transfer switch off keeps the two apart, as an income
  // in "Uncategorised".
  await assignment(page, "row 8").getByRole("switch", { name: "Transfer" }).click();
  await expect(header(page)).toContainText("5 suggested transfers");
  await expect(suggested(page).getByRole("listitem")).toHaveCount(5);
  const categories = await storedRecords<Category>(page, "categories");
  const incomeUncategorised = categories.find(
    (c) => c.side === "income" && c.role === "uncategorised",
  )!;
  await expect
    .poll(async () => (await pendingRows(page)).find((r) => r.rowNumber === 8)?.assignment)
    .toEqual({ type: "category", categoryId: incomeUncategorised.id });
  await expectCategory(assignment(page, "row 8"), "Uncategorised");

  // Scenario 5: the confirmation says how many transactions will become transfers (FR-157).
  const said = await confirmReview(page);
  expect(said).toMatch(/5 transactions will become transfers/);

  // Transactions then holds those 5 as transfers dated as on Checking, and no expense or income
  // for them; only the card's other 9 rows are new.
  const after = await storedRecords<Transaction>(page, "transactions");
  expect(after).toHaveLength(16 + 9);
  const transfers = after.filter((t) => t.kind === "transfer");
  expect(transfers.map((t) => [t.date, t.amountCents, t.accountId === checking.id]).sort()).toEqual(
    [
      ["2026-10-03", 12000, true],
      ["2026-10-07", 8550, true],
      ["2026-10-10", 31000, true],
      ["2026-10-14", 4275, true],
      ["2026-10-18", 15000, true],
    ].sort(),
  );
  for (const transfer of transfers) {
    expect(transfer.description).toBe("Card payment");
    expect(transfer).not.toHaveProperty("categoryId");
  }
  // Only the sixth payment (20 October) and the one with the fee (22 October) stay expenses.
  expect(
    after
      .filter((t) => t.accountId === checking.id && t.description === "Card payment")
      .filter((t) => t.kind === "expense")
      .map((t) => t.date)
      .sort(),
  ).toEqual(["2026-10-20", "2026-10-22"]);
  expect(
    after.filter((t) => t.kind === "income" && t.description === "Payment received"),
    "the card's 58.50 and 95.00 enter as incomes, the five others as no income",
  ).toHaveLength(2);
  expect(after.filter((t) => t.description === "Refund headphones")).toEqual([
    expect.objectContaining({ kind: "income", categoryId: incomeUncategorised.id }),
  ]);
  await expect(await balanceOf(page, "Checking")).toContainText(
    euros(netOf(fixture(CHECKING_FILE))),
  );
  await expect(await balanceOf(page, "Credit card")).toContainText(
    euros(netOf(fixture(CARD_FILE))),
  );

  // SC-030: both files again flag every row as a duplicate, so confirming adds nothing.
  await importFrom(page, "Checking", fixture(CHECKING_FILE));
  await expect(header(page)).toContainText("0 rows to review");
  await expect(header(page).getByRole("button", { name: "16 duplicates" })).toBeVisible();
  await confirmReview(page);
  await importFrom(page, "Credit card", fixture(CARD_FILE));
  await expect(header(page)).toContainText("0 rows to review");
  await expect(header(page).getByRole("button", { name: "14 duplicates" })).toBeVisible();
  await confirmReview(page);
  expect(await storedRecords(page, "transactions")).toEqual(after);
});

test("a paired transaction that changes while the batch is pending is replaced by an ordinary transfer", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await setUp(page);
  await importFrom(page, "Checking", fixture(CHECKING_FILE));
  await confirmReview(page);
  await importFrom(page, "Credit card", fixture(CARD_FILE));
  await expect(header(page)).toContainText("6 suggested transfers");
  const row = suggestedRow(page, "€120.00");
  await expect(row).toContainText("Pairs with:");
  await expect(row).not.toContainText("has changed");

  // On Transactions, the payment of 120.00 becomes one of 121.00, so the pair no longer fits.
  await page.goto("/");
  await page
    .getByRole("list", { name: "Transactions" })
    .getByRole("listitem")
    .filter({ hasText: "Card payment" })
    .filter({ hasText: euros(12000) })
    .getByRole("button", { name: "Edit transaction" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit transaction" });
  await dialog.getByLabel("Amount").fill("121.00");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);

  await page.goto("/#/import/review");
  await expect(row).toContainText("has changed");
  await expect(row).toContainText("ordinary transfer");
  await expect(header(page)).toContainText("6 suggested transfers");

  // Confirming books the row as an ordinary transfer of 120.00, and leaves Checking's payment of
  // 121.00 an expense.
  await confirmReview(page);
  const ledger = await storedRecords<Transaction>(page, "transactions");
  const checking = (await storedRecords<Account>(page, "accounts")).find(
    (a) => a.name === "Checking",
  )!;
  expect(ledger).toHaveLength(16 + 14 - 5);
  expect(ledger.filter((t) => t.kind === "transfer")).toHaveLength(6);
  expect(ledger.find((t) => t.accountId === checking.id && t.amountCents === 12100)).toMatchObject({
    kind: "expense",
    description: "Card payment",
  });
  expect(
    ledger.find(
      (t) => t.kind === "transfer" && t.amountCents === 12000 && t.accountId === checking.id,
    ),
  ).toBeDefined();
});

test("two files that exchange 5 transfers give exactly 5 transfers and both balances (SC-029)", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  // Copies of both fixtures without the shop's 50.00 and its refund: 5 payments, each 0 to 4 days
  // apart, and nothing else that pairs. Every review default stands.
  const without = (name: string) => {
    const path = testInfo.outputPath(name);
    const text = readFileSync(fixture(name), "utf-8")
      .split(/\r?\n/)
      .filter((line) => !line.includes("Shop Online"))
      .join("\r\n");
    writeFileSync(path, text, "utf-8");
    return path;
  };
  const checkingFile = without(CHECKING_FILE);
  const cardFile = without(CARD_FILE);

  await setUp(page);
  await importFrom(page, "Checking", checkingFile);
  await confirmReview(page);
  await importFrom(page, "Credit card", cardFile);
  await expect(header(page)).toContainText("5 suggested transfers");
  await confirmReview(page);

  const ledger = await storedRecords<Transaction>(page, "transactions");
  expect(ledger.filter((t) => t.kind === "transfer")).toHaveLength(5);
  expect(
    ledger.filter(
      (t) => t.kind !== "transfer" && /Card payment|Payment received/.test(t.description),
    ),
    "the 5 payments are transfers only; the other two stay what they are",
  ).toHaveLength(2 + 2);
  await expect(await balanceOf(page, "Checking")).toContainText(euros(netOf(checkingFile)));
  await expect(await balanceOf(page, "Credit card")).toContainText(euros(netOf(cardFile)));

  // SC-030 as well: the same two files again add nothing.
  await importFrom(page, "Checking", checkingFile);
  await confirmReview(page);
  await importFrom(page, "Credit card", cardFile);
  await confirmReview(page);
  expect(await storedRecords(page, "transactions")).toEqual(ledger);
});
