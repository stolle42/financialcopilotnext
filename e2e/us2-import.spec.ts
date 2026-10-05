import type { Locator, Page } from "@playwright/test";
import type { Account, Category, ParsedRow, PendingBatch, Transaction } from "../src/domain/types";
import { messageFor, notifications } from "../src/ui/messages";
import { addAccount, choose, fixture, storedRecords } from "./support/app";
import { importWithProfile, mapDebitCredit, mapMyBank, startImport } from "./support/import";
import { euros, expect, setToday, test } from "./support/test";

// The journey of User Story 2, scenarios 1–16, in one fresh context with the fixtures of
// quickstart.md (US2). It also re-imports August after confirming it, which must add nothing with
// the review defaults (SC-003), and reloads a pending batch to show its review progress stays.

const main = (page: Page) => page.getByRole("main");
const header = (page: Page) => page.getByRole("region", { name: "Batch" });
const reviewList = (page: Page) => page.getByRole("region", { name: "Rows to review" });
const footer = (page: Page) => page.getByRole("region", { name: "Finish review" });
const group = (page: Page, name: string) =>
  reviewList(page).getByRole("group", { name, exact: true });
const vendorGroups = (page: Page) =>
  reviewList(page).getByRole("group", { name: /^(?!Assignment of ).+, (expenses|income)$/ });
const assignment = (scope: Page | Locator, name: string) =>
  scope.getByRole("group", { name: `Assignment of ${name}`, exact: true });
const plainRows = (page: Page) =>
  reviewList(page).getByRole("list", { name: "Plain rows" }).getByRole("listitem");
const categoryOf = (scope: Locator) => scope.getByLabel("Category", { exact: true });

async function pendingRows(page: Page): Promise<ParsedRow[]> {
  const [batch] = await storedRecords<PendingBatch>(page, "pendingBatch");
  return (batch?.rows ?? []).filter((row): row is ParsedRow => row.status === "parsed");
}

async function balanceOf(page: Page, name: string) {
  await page.goto("/#/accounts");
  return page.getByRole("row").filter({ has: page.getByRole("cell", { name, exact: true }) });
}

/** Confirms the batch through the footer and its confirmation, then waits for Transactions. */
async function confirm(page: Page, count: number, account: string) {
  const label = `${count} transaction${count === 1 ? "" : "s"}`;
  await footer(page)
    .getByRole("button", { name: `Confirm ${label}` })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(label);
  await dialog.getByRole("button", { name: `Add ${label}` }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByText(notifications.importConfirmed(count, account))).toBeVisible();
}

test("imports bank files, reviews them by vendor and confirms them without duplicates", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await setToday(page, "2026-09-20");
  await addAccount(page, "Giro", "1000.00");
  await addAccount(page, "Credit card");

  // 1. A file in a layout the app has never seen: a new profile "MyBank" maps it, and the file
  //    becomes a pending batch that changes no balance.
  await startImport(page, { account: "Giro", file: "mybank-2026-08.csv" });
  await expect(page).toHaveURL(/#\/import\/profiles\/new$/);
  await expect(main(page)).toContainText("Previewing mybank-2026-08.csv");
  await mapMyBank(page);
  await main(page).getByRole("button", { name: "Save profile" }).click();
  await expect(page).toHaveURL(/#\/import\/review$/);
  await expect(header(page)).toContainText("13 rows to review");
  expect(await storedRecords(page, "transactions")).toEqual([]);
  await expect(await balanceOf(page, "Giro")).toContainText(euros(100000));
  await page.goto("/#/import/review");

  // 11. Unparsable rows stay out of review and are listed with their reasons.
  await expect(header(page).getByRole("button", { name: "2 unparsable" })).toBeVisible();
  await header(page).getByRole("button", { name: "2 unparsable" }).click();
  const unparsable = page.getByRole("dialog", { name: "Unparsable rows" });
  await expect(unparsable.getByRole("listitem").filter({ hasText: "Row 14" })).toContainText(
    messageFor({ code: "date-unreadable", details: { cell: "32.08.2026", format: "DD.MM.YYYY" } }),
  );
  await expect(unparsable.getByRole("listitem").filter({ hasText: "Row 15" })).toContainText(
    messageFor({ code: "amount-missing" }),
  );
  await page.keyboard.press("Escape");
  await expect(unparsable).toHaveCount(0);

  // 16. Shop's three purchases form one group; its refund and the two rows without a
  //     counterparty are plain rows.
  await expect(vendorGroups(page)).toHaveCount(2);
  await expect(group(page, "Shop, expenses")).toContainText("3 rows");
  await expect(plainRows(page).filter({ hasText: "Return of goods" })).toHaveCount(1);
  await expect(plainRows(page).filter({ hasText: "Cash withdrawal" })).toHaveCount(1);
  await expect(plainRows(page).filter({ hasText: "Account fee €" })).toHaveCount(1);

  // 4. A category for the group goes to every row in it.
  await choose(page, assignment(page, "Shop, expenses"), "Category", "Groceries");
  await choose(page, assignment(page, "Bäckerei Krüger, expenses"), "Category", "Groceries");

  // 5. Unfolded, one row of a group takes its own category.
  const bakery = group(page, "Bäckerei Krüger, expenses");
  await bakery.getByRole("button", { name: "Show rows" }).click();
  await choose(page, assignment(bakery, "row 17"), "Category", "Eating out");
  await expect(categoryOf(assignment(bakery, "row 4"))).toHaveText("Groceries");
  await choose(page, assignment(page, "row 2"), "Category", "Salary");

  // 7. The payment to the user's own credit card becomes a transfer.
  const cardPayment = assignment(page, "row 11");
  await cardPayment.getByRole("switch", { name: "Transfer" }).click();
  await choose(page, cardPayment, "Transfer account", "Credit card");
  await expect(cardPayment.getByLabel("Transfer account", { exact: true })).toHaveText(
    "Credit card",
  );

  // 12. Closing and reopening the app keeps the batch with every choice made (FR-022).
  await page.reload();
  await expect(header(page)).toContainText("13 rows to review");
  await expect(categoryOf(assignment(page, "Shop, expenses"))).toHaveText("Groceries");
  await expect(categoryOf(assignment(page, "Bäckerei Krüger, expenses"))).toHaveText("Mixed");
  await expect(
    assignment(page, "row 11").getByLabel("Transfer account", { exact: true }),
  ).toHaveText("Credit card");

  // 9. Confirming books the rows as reviewed, untouched rows in Uncategorised.
  await confirm(page, 13, "Giro");
  const ledger = await storedRecords<Transaction>(page, "transactions");
  expect(ledger).toHaveLength(13);
  const categories = await storedRecords<Category>(page, "categories");
  const named = (side: string, name: string) =>
    categories.find((c) => c.side === side && c.name === name)!.id;
  const booked = (description: string) => ledger.find((t) => t.description === description);
  expect(booked("Kuchen")).toMatchObject({
    kind: "expense",
    categoryId: named("expense", "Eating out"),
  });
  expect(booked("Salary August")).toMatchObject({ kind: "income", amountCents: 245000 });
  expect(booked("Cash withdrawal")).toMatchObject({
    kind: "expense",
    categoryId: named("expense", "Uncategorised"),
  });
  expect(booked("Return of goods")).toMatchObject({
    kind: "income",
    categoryId: named("income", "Uncategorised"),
  });
  // 7, continued: a transfer with no category, so it counts in no spending figure (FR-012).
  const accounts = await storedRecords<Account>(page, "accounts");
  const accountId = (name: string) => accounts.find((a) => a.name === name)!.id;
  expect(booked("Card statement 07/2026")).toEqual(
    expect.objectContaining({
      kind: "transfer",
      accountId: accountId("Giro"),
      destinationAccountId: accountId("Credit card"),
      amountCents: 25000,
    }),
  );
  expect(booked("Card statement 07/2026")).not.toHaveProperty("categoryId");
  // Balances update (FR-002): 1,000.00 plus the net of the 13 rows, and the card's 250.00.
  await expect(await balanceOf(page, "Giro")).toContainText(euros(299141));
  await expect(await balanceOf(page, "Credit card")).toContainText(euros(25000));

  // 2. The next month's file uses the saved profile without any re-mapping.
  await page.goto("/#/import");
  await expect(
    page.getByRole("region", { name: "Import a file" }).getByLabel("Profile", { exact: true }),
  ).toHaveText("MyBank");
  await importWithProfile(page, { account: "Giro", file: "mybank-2026-09.csv" });

  // 15. While it is pending, another file is refused, with a way to open the pending batch.
  await page.goto("/#/import");
  const importForm = page.getByRole("region", { name: "Import a file" });
  await importForm.getByLabel("Bank file").setInputFiles(fixture("debit-credit.csv"));
  await expect(importForm.getByRole("alert")).toContainText(
    messageFor({ code: "import-batch-pending" }),
  );
  await importForm.getByRole("button", { name: "Open pending batch" }).click();
  await expect(page).toHaveURL(/#\/import\/review$/);

  // 8. The overlapping week matches the ledger despite other descriptions: those rows are not
  //    under review, their count is shown, and any single one can be included.
  await expect(header(page)).toContainText("5 rows to review");
  // September's only other Bakery row is a plain row while its match stays out.
  await expect(group(page, "Bäckerei Krüger, expenses")).toHaveCount(0);
  await expect(plainRows(page).filter({ hasText: "Bäckerei Krüger" })).toHaveCount(1);
  await header(page).getByRole("button", { name: "2 duplicates" }).click();
  const duplicates = page.getByRole("dialog", { name: "Duplicates" });
  await expect(duplicates).toContainText("STREAMING MONTHLY 0827");
  await expect(duplicates).toContainText("Kuchen Kartenzahlung");
  await duplicates.getByRole("switch", { name: "Include row 3" }).click();
  await expect(duplicates.getByRole("switch", { name: "Include row 3" })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(header(page)).toContainText("6 rows to review");
  // The included row joins its vendor's group (R-12).
  await expect(group(page, "Bäckerei Krüger, expenses")).toContainText("2 rows");

  // 10. Discarding the batch leaves the ledger unchanged.
  await footer(page).getByRole("button", { name: "Discard" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard import" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page).toHaveURL(/#\/import$/);
  expect(await storedRecords(page, "pendingBatch")).toEqual([]);
  expect(await storedRecords(page, "transactions")).toHaveLength(13);

  // SC-003: re-importing August flags every row, so confirming with the defaults adds nothing.
  await importWithProfile(page, { account: "Giro", file: "mybank-2026-08.csv" });
  await expect(header(page)).toContainText("0 rows to review");
  await expect(header(page).getByRole("button", { name: "14 duplicates" })).toBeVisible();
  await confirm(page, 0, "Giro");
  expect(await storedRecords(page, "transactions")).toHaveLength(13);

  // 13. A file that lacks a mapped header creates no batch, and the message names the column.
  await startImport(page, { account: "Giro", file: "mybank-renamed-column.csv" });
  await expect(
    page.getByRole("region", { name: "Import a file" }).getByRole("alert"),
  ).toContainText(messageFor({ code: "import-missing-columns", details: { columns: ["Amount"] } }));
  expect(await storedRecords(page, "pendingBatch")).toEqual([]);

  // 3 and 6. Debit and credit columns: debits are expenses, credits incomes, 0.00 is empty, and a
  //    row with both or neither is unparsable. Without a counterparty, every row is a plain row.
  await startImport(page, {
    account: "Credit card",
    file: "debit-credit.csv",
    profile: "Create new profile",
  });
  await expect(page).toHaveURL(/#\/import\/profiles\/new$/);
  await mapDebitCredit(page);
  await expect(page).toHaveURL(/#\/import\/review$/);
  await expect(header(page)).toContainText("4 rows to review");
  await expect(header(page).getByRole("button", { name: "2 unparsable" })).toBeVisible();
  await expect(vendorGroups(page)).toHaveCount(0);
  await expect(plainRows(page)).toHaveCount(4);
  for (const row of await plainRows(page).all()) await expect(categoryOf(row)).toBeVisible();
  expect((await pendingRows(page)).map((row) => [row.description, row.amountCents])).toEqual([
    ["Café Central", -1250],
    ["Refund from shop", 2500],
    ["Rent, August", -125000],
    ["Interest", 310],
  ]);
  await confirm(page, 4, "Credit card");
  const cardLedger = (await storedRecords<Transaction>(page, "transactions")).filter(
    (t) => t.accountId === accountId("Credit card"),
  );
  expect(cardLedger.map((t) => [t.description, t.kind])).toEqual(
    expect.arrayContaining([
      ["Café Central", "expense"],
      ["Refund from shop", "income"],
      ["Rent, August", "expense"],
      ["Interest", "income"],
    ]),
  );

  // 14. With sign inversion, purchases listed as positive numbers are proposed as expenses.
  await startImport(page, {
    account: "Credit card",
    file: "positive-purchases.csv",
    profile: "Create new profile",
  });
  await expect(page).toHaveURL(/#\/import\/profiles\/new$/);
  await main(page).getByLabel("Name", { exact: true }).fill("Card statement");
  await choose(page, main(page), "Date column", "Date");
  await choose(page, main(page), "Amount column", "Amount");
  await choose(page, main(page), "Description column", "Details");
  await choose(page, main(page), "Counterparty column", "Merchant");
  await choose(page, main(page), "Date format", "YYYY-MM-DD (2026-09-03)");
  await choose(page, main(page), "Decimal separator", "Point (1,250.00)");
  await main(page).getByRole("switch", { name: "Invert the sign" }).click();
  await main(page).getByRole("button", { name: "Save profile" }).click();
  await expect(page).toHaveURL(/#\/import\/review$/);
  expect((await pendingRows(page)).map((row) => [row.description, row.amountCents])).toEqual([
    ["Novel", -2500],
    ["Return of novel", 2500],
    ["Tickets", -1800],
  ]);
  await expect(plainRows(page).filter({ hasText: "Novel" }).first()).toContainText(euros(-2500));
});
