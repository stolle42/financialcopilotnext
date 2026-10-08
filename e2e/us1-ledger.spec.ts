import type { Page } from "@playwright/test";
import type { Account, Transaction } from "../src/domain/types";
import {
  addAccount,
  addTransaction,
  choose,
  openTransactionForm,
  storedRecords,
} from "./support/app";
import { euros, expect, setToday, test } from "./support/test";

// The journey of User Story 1, scenarios 1–12, in one fresh context (quickstart.md, US1).
// Scenario 8 runs first because it needs the untouched default account; scenario 9 follows the
// entry of scenario 3 that it refers to.

/** A balance recomputed from the stored records, without the app's own code (FR-002). */
function expectedBalance(account: Account, transactions: Transaction[]): number {
  return transactions.reduce((balance, t) => {
    if (t.accountId === account.id)
      return balance + (t.kind === "income" ? t.amountCents : -t.amountCents);
    if (t.kind === "transfer" && t.destinationAccountId === account.id)
      return balance + t.amountCents;
    return balance;
  }, account.openingBalanceCents);
}

/** SC-005: every balance on Accounts equals the opening balance plus the net of its transactions. */
async function expectBalancesToMatchLedger(page: Page) {
  await page.goto("/#/accounts");
  const accounts = await storedRecords<Account>(page, "accounts");
  const transactions = await storedRecords<Transaction>(page, "transactions");
  for (const account of accounts) {
    const row = page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: account.name, exact: true }) });
    await expect(row).toContainText(euros(expectedBalance(account, transactions)));
  }
}

async function balanceOf(page: Page, name: string) {
  await page.goto("/#/accounts");
  return page.getByRole("row").filter({ has: page.getByRole("cell", { name, exact: true }) });
}

const listedDescriptions = (page: Page) =>
  page
    .getByRole("list", { name: "Transactions" })
    .getByRole("listitem")
    .evaluateAll((items) =>
      items.map((item) => item.querySelector("[data-description]")?.textContent ?? ""),
    );

test("keeps a trustworthy ledger by hand", async ({ page }) => {
  test.setTimeout(180_000);
  await setToday(page, "2026-09-03");

  // 1. A fresh install has exactly one account, Cash, at 0.00.
  await page.goto("/#/accounts");
  await expect(page.getByRole("main").getByRole("row")).toHaveCount(2);
  await expect(await balanceOf(page, "Cash")).toContainText(euros(0));
  await expectBalancesToMatchLedger(page);

  // 8. Manual entry opens with its defaults, and saving them unchanged books 0.00 to Cash.
  let form = await openTransactionForm(page);
  await expect(form.getByRole("button", { name: "Expense" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(form.getByLabel("Amount")).toHaveValue("0.00");
  await expect(form.getByLabel("Account", { exact: true })).toHaveText("Cash");
  await expect(form.getByLabel("Category", { exact: true })).toHaveText("Uncategorised");
  await expect(form.getByLabel("Date")).toHaveValue("2026-09-03");
  await expect(form.getByLabel("Description")).toHaveValue("");
  await form.getByRole("button", { name: "Save" }).click();
  // The form closes once the entry is stored; navigating earlier would cut the save short.
  await expect(form).toHaveCount(0);
  await page.goto("/");
  const unwanted = page.getByRole("list", { name: "Transactions" }).getByRole("listitem");
  await expect(unwanted).toHaveCount(1);
  await expect(unwanted).toContainText("No description");
  await expect(unwanted).toContainText("Uncategorised");
  await expect(unwanted).toContainText("Cash");
  await expectBalancesToMatchLedger(page);
  // The user deletes the unwanted 0.00 entry (Out of Scope, FR-013).
  await page.goto("/");
  await unwanted.getByRole("button", { name: "Edit transaction" }).click();
  await page
    .getByRole("dialog", { name: "Edit transaction" })
    .getByRole("button", { name: "Delete" })
    .click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete transaction" }).click();
  await expect(page.getByRole("main")).toContainText("No transactions yet");

  // 2. A new account shows its opening balance.
  await addAccount(page, "Checking", "1250.00");
  await expect(await balanceOf(page, "Checking")).toContainText(euros(125000));
  await expectBalancesToMatchLedger(page);

  // 3. An expense lowers the balance.
  await addTransaction(page, {
    amount: "40.00",
    account: "Checking",
    category: "Groceries",
    date: "2026-09-03",
    description: "Weekly shop",
  });
  await expect(await balanceOf(page, "Checking")).toContainText(euros(121000));
  await expectBalancesToMatchLedger(page);

  // 9. Manual entry now opens on the account of the last entry.
  form = await openTransactionForm(page);
  await expect(form.getByLabel("Account", { exact: true })).toHaveText("Checking");
  await form.getByRole("button", { name: "Cancel" }).click();

  // 4. A transfer moves money between the two accounts.
  await addTransaction(page, { kind: "Transfer", amount: "100.00", destination: "Cash" });
  await expect(await balanceOf(page, "Checking")).toContainText(euros(111000));
  await expect(await balanceOf(page, "Cash")).toContainText(euros(10000));
  await expectBalancesToMatchLedger(page);

  // 5–7. The pickers: one side's categories without an empty choice or Unaccounted, and a
  // destination instead of a category for a transfer, never the source account.
  form = await openTransactionForm(page);
  await form.getByLabel("Category", { exact: true }).click();
  await expect(page.getByRole("option").first()).toBeVisible();
  const options = (await page.getByRole("option").allTextContents()).map((text) => text.trim());
  await page.keyboard.press("Escape");
  expect(options).toContain("Groceries");
  expect(options).not.toContain("Salary");
  expect(options).not.toContain("Unaccounted");
  expect(options).not.toContain("");
  expect(options.filter((name) => name === "Uncategorised")).toHaveLength(1);
  await form.getByRole("button", { name: "Transfer" }).click();
  await expect(form.getByLabel("Category", { exact: true })).toHaveCount(0);
  await choose(page, form, "Account", "Cash");
  await form.getByLabel("Destination", { exact: true }).click();
  await expect(page.getByRole("option")).toHaveText(["Checking"]);
  await page.keyboard.press("Escape");
  await form.getByRole("button", { name: "Cancel" }).click();

  // 10. Changing the opening balance needs a severe warning, then moves the balance by 50.00.
  await page.goto("/#/accounts");
  await (await balanceOf(page, "Checking")).getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog").getByLabel("Opening balance").fill("1300.00");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Change opening balance" })
    .click();
  await expect(await balanceOf(page, "Checking")).toContainText(euros(116000));
  expect(await storedRecords<Transaction>(page, "transactions")).toHaveLength(2);
  await expectBalancesToMatchLedger(page);

  // 11. No balance can be typed in directly.
  await page.goto("/#/accounts");
  await expect(page.getByRole("main").getByRole("textbox")).toHaveCount(0);

  // 12. The list shows the transfer above the expense, and the Cash filter only the transfer.
  await page.goto("/");
  await expect.poll(() => listedDescriptions(page)).toEqual(["No description", "Weekly shop"]);
  await choose(page, page.getByRole("region", { name: "Filters" }), "Account", "Cash");
  await expect.poll(() => listedDescriptions(page)).toEqual(["No description"]);
  await expect(page.getByRole("list", { name: "Transactions" })).toContainText("→ Cash");
});
