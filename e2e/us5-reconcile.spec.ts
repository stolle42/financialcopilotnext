import type { Page } from "@playwright/test";
import type { Account, Category, Side, Transaction } from "../src/domain/types";
import { messageFor, notifications } from "../src/ui/messages";
import {
  accountRow,
  addTransaction,
  choose,
  openReconcile,
  openTransactionForm,
  reconcileAccount,
  storedRecords,
  storedTransactions,
} from "./support/app";
import { euros, expect, setToday, test } from "./support/test";

// The journey of User Story 5, scenarios 1–4, in one fresh context (quickstart.md, US5). Each
// difference is booked to "Unaccounted" as a transaction, never by editing a balance (FR-002,
// FR-005), so at the end every balance is recomputed from the stored records without the app's code.

/** A balance recomputed from the stored records (FR-002). */
function expectedBalance(account: Account, transactions: Transaction[]): number {
  return transactions.reduce((balance, t) => {
    if (t.accountId === account.id)
      return balance + (t.kind === "income" ? t.amountCents : -t.amountCents);
    if (t.kind === "transfer" && t.destinationAccountId === account.id)
      return balance + t.amountCents;
    return balance;
  }, account.openingBalanceCents);
}

async function balanceOf(page: Page, name: string) {
  await page.goto("/#/accounts");
  return accountRow(page, name);
}

/** Creates an account of the type labelled `type` on the Accounts screen. */
async function addAccountOfType(page: Page, name: string, type: string, openingBalance: string) {
  await page.goto("/#/accounts");
  await page.getByRole("button", { name: "New account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await choose(page, dialog, "Type", type);
  await dialog.getByLabel("Opening balance").fill(openingBalance);
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(dialog).toHaveCount(0);
}

async function unaccountedId(page: Page, side: Side): Promise<string> {
  const categories = await storedRecords<Category>(page, "categories");
  return categories.find((c) => c.side === side && c.role === "unaccounted")!.id;
}

/** The transaction booked last, which a reconciliation adds after every other one. */
async function lastBooked(page: Page): Promise<Transaction | undefined> {
  const transactions = await storedTransactions(page);
  return transactions.reduce<Transaction | undefined>(
    (last, t) => (last && last.seq > t.seq ? last : t),
    undefined,
  );
}

test("reconciles any account to what it really holds", async ({ page }) => {
  test.setTimeout(180_000);
  await setToday(page, "2026-09-03");
  await page.goto("/");
  // Cash computes to 100.00: 150.00 in, 50.00 out.
  await addTransaction(page, {
    kind: "Income",
    amount: "150.00",
    category: "Salary",
    date: "2026-09-01",
  });
  await addTransaction(page, { amount: "50.00", category: "Groceries", date: "2026-09-02" });
  await expect(await balanceOf(page, "Cash")).toContainText(euros(10000));
  const cash = (await storedRecords<Account>(page, "accounts")).find((a) => a.name === "Cash")!;

  // 1. Stating 85.00 books an expense of 15.00 in expense "Unaccounted" to Cash, dated today.
  await reconcileAccount(page, "Cash", "85.00");
  await expect(
    page.getByText(notifications.reconciled("expense", 1500, "Unaccounted")),
  ).toBeVisible();
  await expect(accountRow(page, "Cash")).toContainText(euros(8500));
  expect(await storedTransactions(page)).toHaveLength(3);
  expect(await lastBooked(page)).toMatchObject({
    kind: "expense",
    amountCents: 1500,
    date: "2026-09-03",
    accountId: cash.id,
    categoryId: await unaccountedId(page, "expense"),
  });
  // The entry is an ordinary transaction, listed under its category.
  await page.goto("/");
  const newest = page.getByRole("list", { name: "Transactions" }).getByRole("listitem").first();
  await expect(newest).toContainText("Unaccounted");
  await expect(newest).toContainText(euros(-1500));

  // 2. Back at 100.00, stating 120.00 books an income of 20.00 in income "Unaccounted".
  await addTransaction(page, { kind: "Income", amount: "15.00", category: "Gifts" });
  await expect(await balanceOf(page, "Cash")).toContainText(euros(10000));
  await reconcileAccount(page, "Cash", "120.00");
  await expect(
    page.getByText(notifications.reconciled("income", 2000, "Unaccounted")),
  ).toBeVisible();
  await expect(accountRow(page, "Cash")).toContainText(euros(12000));
  expect(await lastBooked(page)).toMatchObject({
    kind: "income",
    amountCents: 2000,
    date: "2026-09-03",
    accountId: cash.id,
    categoryId: await unaccountedId(page, "income"),
  });

  // 3. Stating the computed balance books nothing, and the dialog says the account matches.
  const count = (await storedTransactions(page)).length;
  const dialog = await openReconcile(page, "Cash");
  await expect(dialog.getByLabel("Actual balance")).toHaveValue("120.00");
  await dialog.getByRole("button", { name: "Reconcile", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    messageFor({ code: "reconcile-already-matches" }),
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await storedTransactions(page)).toHaveLength(count);
  await expect(accountRow(page, "Cash")).toContainText(euros(12000));

  // 4. Every account of every type can be reconciled, below zero too; none is cash-only (FR-004).
  const others: [name: string, type: string, opening: string, actual: string, cents: number][] = [
    ["Giro", "Checking", "1250.00", "1300.00", 130000],
    ["Savings", "Savings", "500.00", "480.00", 48000],
    ["Card", "Credit card", "-250.00", "-310.00", -31000],
    ["Wallet", "Other", "0", "12.34", 1234],
  ];
  for (const [name, type, opening] of others) await addAccountOfType(page, name, type, opening);
  await page.goto("/#/accounts");
  const rows = page.getByRole("main").getByRole("row");
  await expect(rows).toHaveCount(1 + 1 + others.length);
  await expect(page.getByRole("main").getByRole("button", { name: "Reconcile" })).toHaveCount(
    1 + others.length,
  );
  for (const [name, , , actual, cents] of others) {
    await reconcileAccount(page, name, actual);
    await expect(accountRow(page, name)).toContainText(euros(cents));
  }
  await expect(
    page.getByText(notifications.reconciled("expense", 6000, "Unaccounted")),
  ).toBeVisible();

  // Reconciling never moves the form's default off the account of the last manual entry (FR-006).
  const form = await openTransactionForm(page);
  await expect(form.getByLabel("Account", { exact: true })).toHaveText("Cash");
  await form.getByRole("button", { name: "Cancel" }).click();

  // FR-002: every balance shown is the opening balance plus the stored transactions.
  await page.goto("/#/accounts");
  const accounts = await storedRecords<Account>(page, "accounts");
  const transactions = await storedTransactions(page);
  expect(transactions).toHaveLength(count + others.length);
  for (const account of accounts) {
    await expect(accountRow(page, account.name)).toContainText(
      euros(expectedBalance(account, transactions)),
    );
  }
});
