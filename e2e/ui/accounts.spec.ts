import type { Page } from "@playwright/test";
import { messageFor } from "../../src/ui/messages";
import { euros, expect, test } from "../support/test";

// contracts/ui.md, accounts; User Story 1 scenarios 1, 2, 10 and 11.

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
