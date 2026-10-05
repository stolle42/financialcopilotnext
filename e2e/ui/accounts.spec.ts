import type { Page } from "@playwright/test";
import type { Category, Side } from "../../src/domain/types";
import { messageFor, notifications } from "../../src/ui/messages";
import {
  addAccount,
  addTransaction,
  lastBooked,
  openReconcile,
  openTransactionForm,
  reconcileAccount,
  storedRecords,
  storedTransactions,
} from "../support/app";
import { euros, expect, setToday, test } from "../support/test";

// contracts/ui.md, accounts; User Story 1 scenarios 1, 2, 10 and 11; User Story 5.

async function openAccounts(page: Page) {
  await page.goto("/#/accounts");
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
}

function accountRow(page: Page, name: string) {
  return page.getByRole("row").filter({ has: page.getByRole("cell", { name, exact: true }) });
}

async function createAccount(page: Page, name: string, openingBalance: string) {
  await page.getByRole("button", { name: "New account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Opening balance").fill(openingBalance);
  await dialog.getByRole("button", { name: "Create account" }).click();
}

/** The error shown in the same field as the input labelled `label` (FR-068). */
function fieldError(page: Page, label: string) {
  return page
    .getByRole("dialog")
    .locator('[data-slot="field"]')
    .filter({ has: page.getByLabel(label, { exact: true }) })
    .getByRole("alert");
}

test("the sidebar leads to Accounts and marks it as the current screen", async ({ page }) => {
  await page.goto("/");
  const link = page
    .getByRole("navigation", { name: "Screens" })
    .getByRole("link", { name: "Accounts" });
  await link.click();
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
  await expect(link).toHaveAttribute("aria-current", "page");
});

test("a fresh install lists exactly one account, Cash, at 0.00 (scenario 1)", async ({ page }) => {
  await openAccounts(page);
  const rows = page.getByRole("main").getByRole("row");
  await expect(rows).toHaveCount(2); // the header row and Cash
  await expect(accountRow(page, "Cash")).toContainText(euros(0));
});

test("a new account shows its opening balance (scenario 2)", async ({ page }) => {
  await openAccounts(page);
  await createAccount(page, "Checking", "1250.00");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(accountRow(page, "Checking")).toContainText("Checking");
  await expect(accountRow(page, "Checking")).toContainText(euros(125000));
});

test("a new account may start negative, and its type is chosen from a list", async ({ page }) => {
  await openAccounts(page);
  await page.getByRole("button", { name: "New account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Card");
  await dialog.getByLabel("Type").click();
  await page.getByRole("option", { name: "Credit card" }).click();
  await dialog.getByLabel("Opening balance").fill("-50.00");
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(accountRow(page, "Card")).toContainText("Credit card");
  await expect(accountRow(page, "Card")).toContainText(euros(-5000));
});

test("a duplicate name is refused beside the name field (FR-001)", async ({ page }) => {
  await openAccounts(page);
  await createAccount(page, " cash", "0");
  await expect(fieldError(page, "Name")).toHaveText(messageFor({ code: "account-name-taken" }));
});

test("an empty name is refused beside the name field", async ({ page }) => {
  await openAccounts(page);
  await createAccount(page, "", "0");
  await expect(fieldError(page, "Name")).toHaveText(messageFor({ code: "account-name-empty" }));
});

test("an unreadable opening balance is refused beside its field", async ({ page }) => {
  await openAccounts(page);
  await createAccount(page, "Savings", "12,34.5");
  await expect(fieldError(page, "Opening balance")).toHaveText(
    messageFor({ code: "balance-invalid" }),
  );
});

test.describe("changing an opening balance (scenario 10)", () => {
  async function changeOpeningBalance(page: Page) {
    await openAccounts(page);
    await createAccount(page, "Checking", "1250.00");
    await accountRow(page, "Checking").getByRole("button", { name: "Edit" }).click();
    await page.getByRole("dialog").getByLabel("Opening balance").fill("1300.00");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    const warning = page.getByRole("alertdialog");
    await expect(warning).toContainText(/every balance this account has ever shown will change/i);
    return warning;
  }

  test("confirming the severe warning raises the balance by 50.00", async ({ page }) => {
    const warning = await changeOpeningBalance(page);
    await warning.getByRole("button", { name: "Change opening balance" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(accountRow(page, "Checking")).toContainText(euros(130000));
  });

  test("cancelling the warning keeps the old balance", async ({ page }) => {
    const warning = await changeOpeningBalance(page);
    await warning.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(accountRow(page, "Checking")).toContainText(euros(125000));
  });
});

test("there is no way to type in a balance directly (scenario 11)", async ({ page }) => {
  await openAccounts(page);
  await expect(accountRow(page, "Cash")).toBeVisible();
  await expect(page.getByRole("main").getByRole("textbox")).toHaveCount(0);
  await accountRow(page, "Cash").getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Opening balance")).toBeVisible();
  await expect(dialog.getByLabel("Balance", { exact: true })).toHaveCount(0);
});

test.describe("reconciling (FR-005)", () => {
  test.beforeEach(async ({ page }) => {
    await setToday(page, "2026-09-03");
  });

  async function unaccounted(page: Page, side: Side) {
    const categories = await storedRecords<Category>(page, "categories");
    return categories.find((c) => c.side === side && c.role === "unaccounted")!;
  }

  test("every account offers Reconcile, whatever its type (scenario 4)", async ({ page }) => {
    await addAccount(page, "Checking", "1250.00");
    await openAccounts(page);
    for (const name of ["Cash", "Checking"]) {
      await expect(accountRow(page, name).getByRole("button", { name: "Reconcile" })).toBeVisible();
    }
  });

  test("asks what the account holds now, starting from its computed balance", async ({ page }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "40.00", category: "Groceries" });

    const dialog = await openReconcile(page, "Cash");

    const field = dialog.getByLabel("Actual balance");
    await expect(field).toHaveValue("-40.00");
    await expect(field).toBeFocused();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    expect(await storedTransactions(page)).toHaveLength(1);
  });

  test("a lower balance books an expense to Unaccounted, dated today (scenario 1)", async ({
    page,
  }) => {
    await page.goto("/");
    await addTransaction(page, { kind: "Income", amount: "100.00", category: "Salary" });

    await reconcileAccount(page, "Cash", "85.00");

    await expect(
      page.getByText(notifications.reconciled("expense", 1500, "Unaccounted")),
    ).toBeVisible();
    await expect(accountRow(page, "Cash")).toContainText(euros(8500));
    expect(await lastBooked(page)).toEqual(
      expect.objectContaining({
        kind: "expense",
        amountCents: 1500,
        date: "2026-09-03",
        categoryId: (await unaccounted(page, "expense")).id,
      }),
    );
  });

  test("a higher balance books an income to Unaccounted (scenario 2)", async ({ page }) => {
    await page.goto("/");
    await addTransaction(page, { kind: "Income", amount: "100.00", category: "Salary" });

    await reconcileAccount(page, "Cash", "120.00");

    await expect(
      page.getByText(notifications.reconciled("income", 2000, "Unaccounted")),
    ).toBeVisible();
    await expect(accountRow(page, "Cash")).toContainText(euros(12000));
    expect(await lastBooked(page)).toEqual(
      expect.objectContaining({
        kind: "income",
        amountCents: 2000,
        categoryId: (await unaccounted(page, "income")).id,
      }),
    );
  });

  test("a matching balance books nothing and says so in the dialog (scenario 3)", async ({
    page,
  }) => {
    const dialog = await openReconcile(page, "Cash");
    await dialog.getByLabel("Actual balance").fill("0.00");
    await dialog.getByRole("button", { name: "Reconcile", exact: true }).click();

    await expect(dialog.getByRole("alert")).toHaveText(
      messageFor({ code: "reconcile-already-matches" }),
    );
    expect(await storedTransactions(page)).toEqual([]);
  });

  test("accepts a negative balance", async ({ page }) => {
    await reconcileAccount(page, "Cash", "-50.00");

    await expect(
      page.getByText(notifications.reconciled("expense", 5000, "Unaccounted")),
    ).toBeVisible();
    await expect(accountRow(page, "Cash")).toContainText(euros(-5000));
  });

  test("an unreadable amount is refused beside its field", async ({ page }) => {
    const dialog = await openReconcile(page, "Cash");
    await dialog.getByLabel("Actual balance").fill("12,34.5");
    await dialog.getByRole("button", { name: "Reconcile", exact: true }).click();

    await expect(fieldError(page, "Actual balance")).toHaveText(
      messageFor({ code: "balance-invalid" }),
    );
    expect(await storedTransactions(page)).toEqual([]);
  });

  test("leaves the transaction form on the account of the last manual entry (FR-006)", async ({
    page,
  }) => {
    await addAccount(page, "Checking", "1250.00");

    await reconcileAccount(page, "Checking", "1200.00");

    const form = await openTransactionForm(page);
    await expect(form.getByLabel("Account", { exact: true })).toHaveText("Cash");
  });
});
