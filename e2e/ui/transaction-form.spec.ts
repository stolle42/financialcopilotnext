import type { Locator, Page } from "@playwright/test";
import type { Account, Category } from "../../src/domain/types";
import { messages } from "../../src/ui/messages";
import { addAccount, openTransactionForm, storedRecords, storedTransactions } from "../support/app";
import { euros, expect, setToday, test } from "../support/test";

// contracts/ui.md, transaction form; User Story 1 scenarios 5–9, FR-011, FR-014, FR-015.

test.beforeEach(async ({ page }) => {
  await setToday(page, "2026-09-03");
});

async function categoryNamed(page: Page, side: Category["side"], name: string) {
  const categories = await storedRecords<Category>(page, "categories");
  return categories.find((c) => c.side === side && c.name === name)!;
}

async function accountNamed(page: Page, name: string) {
  const accounts = await storedRecords<Account>(page, "accounts");
  return accounts.find((a) => a.name === name)!;
}

/** Opens a select in the form and returns the names of its options. */
async function optionsOf(page: Page, form: Locator, label: string): Promise<string[]> {
  await form.getByLabel(label, { exact: true }).click();
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();
  const names = (await options.allTextContents()).map((text) => text.trim());
  await page.keyboard.press("Escape");
  return names;
}

async function choose(page: Page, form: Locator, label: string, option: string) {
  await form.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** The error shown in the same field as the control labelled `label` (FR-068). */
function fieldError(form: Locator, label: string) {
  return (
    form
      .locator('[data-slot="field"]')
      // The inner locator must start from the page, not the form, to match inside each field.
      .filter({ has: form.page().getByLabel(label, { exact: true }) })
      .getByRole("alert")
  );
}

test("opens with the defaults and saves an unchanged form as 0.00 in Uncategorised (scenario 8)", async ({
  page,
}) => {
  await page.goto("/");
  const form = await openTransactionForm(page);
  await expect(form.getByRole("button", { name: "Expense" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(form.getByLabel("Amount")).toHaveValue("0.00");
  await expect(form.getByLabel("Category", { exact: true })).toHaveText("Uncategorised");
  await expect(form.getByLabel("Account", { exact: true })).toHaveText("Cash");
  await expect(form.getByLabel("Date")).toHaveValue("2026-09-03");
  await expect(form.getByLabel("Description")).toHaveValue("");

  await form.getByRole("button", { name: "Save" }).click();

  await expect(form).toHaveCount(0);
  const uncategorised = await categoryNamed(page, "expense", "Uncategorised");
  const cash = await accountNamed(page, "Cash");
  expect(await storedTransactions(page)).toEqual([
    expect.objectContaining({
      kind: "expense",
      amountCents: 0,
      description: "",
      date: "2026-09-03",
      accountId: cash.id,
      categoryId: uncategorised.id,
    }),
  ]);
});

test("starts in Amount with its content selected, and Enter saves (SC-002)", async ({ page }) => {
  await page.goto("/");
  await openTransactionForm(page);
  await page.keyboard.type("12.50");
  await page.keyboard.press("Enter");
  await page.goto("/#/accounts");
  await expect(page.getByRole("row").filter({ hasText: "Cash" })).toContainText(euros(-1250));
});

test("offers expense categories only, one Uncategorised and no Unaccounted (scenario 5)", async ({
  page,
}) => {
  await page.goto("/");
  const form = await openTransactionForm(page);
  expect(await optionsOf(page, form, "Category")).toEqual([
    "Eating out",
    "Groceries",
    "Health",
    "Housing",
    "Leisure",
    "Shopping",
    "Transport",
    "Travel",
    "Utilities",
    "Uncategorised",
  ]);
});

test("offers no way to leave the category empty (scenario 6)", async ({ page }) => {
  await page.goto("/");
  const form = await openTransactionForm(page);
  await form.getByRole("button", { name: "Income" }).click();
  const options = await optionsOf(page, form, "Category");
  expect(options).not.toContain("");
  expect(options.filter((name) => name === "Uncategorised")).toHaveLength(1);
  await expect(form.getByLabel("Category", { exact: true })).toHaveText("Uncategorised");
});

test("a transfer asks for a destination instead of a category, never its own account (scenario 7)", async ({
  page,
}) => {
  await addAccount(page, "Checking", "1250.00");
  const form = await openTransactionForm(page);
  await form.getByRole("button", { name: "Transfer" }).click();
  await expect(form.getByLabel("Category", { exact: true })).toHaveCount(0);
  expect(await optionsOf(page, form, "Destination")).toEqual(["Checking"]);
});

test("opens on the account of the last manual entry (scenario 9)", async ({ page }) => {
  await addAccount(page, "Checking", "1250.00");
  let form = await openTransactionForm(page);
  await choose(page, form, "Account", "Checking");
  await form.getByLabel("Amount").fill("40.00");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toHaveCount(0);

  form = await openTransactionForm(page);
  await expect(form.getByLabel("Account", { exact: true })).toHaveText("Checking");
});

test.describe("kind changes (FR-015)", () => {
  test("expense to income sets income Uncategorised", async ({ page }) => {
    await page.goto("/");
    const form = await openTransactionForm(page);
    await choose(page, form, "Category", "Groceries");
    await form.getByRole("button", { name: "Income" }).click();
    await expect(form.getByLabel("Category", { exact: true })).toHaveText("Uncategorised");
    expect(await optionsOf(page, form, "Category")).toContain("Salary");
  });

  test("a transfer back to an expense drops the destination and sets Uncategorised", async ({
    page,
  }) => {
    await addAccount(page, "Checking");
    const form = await openTransactionForm(page);
    await form.getByRole("button", { name: "Transfer" }).click();
    await choose(page, form, "Destination", "Checking");
    await form.getByRole("button", { name: "Expense" }).click();
    await expect(form.getByLabel("Destination", { exact: true })).toHaveCount(0);
    await expect(form.getByLabel("Category", { exact: true })).toHaveText("Uncategorised");
  });

  test("a transfer saves with its destination and no category", async ({ page }) => {
    await addAccount(page, "Checking");
    const form = await openTransactionForm(page);
    await form.getByRole("button", { name: "Transfer" }).click();
    await form.getByLabel("Amount").fill("100.00");
    await choose(page, form, "Destination", "Checking");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form).toHaveCount(0);
    const checking = await accountNamed(page, "Checking");
    expect(await storedTransactions(page)).toEqual([
      expect.objectContaining({ kind: "transfer", destinationAccountId: checking.id }),
    ]);
  });
});

test.describe("destination rules (FR-011)", () => {
  test("choosing the destination as the account clears the destination", async ({ page }) => {
    await addAccount(page, "Checking");
    const form = await openTransactionForm(page);
    await form.getByRole("button", { name: "Transfer" }).click();
    await choose(page, form, "Destination", "Checking");
    await choose(page, form, "Account", "Checking");
    await expect(form.getByLabel("Destination", { exact: true })).toHaveText("Choose an account");
    expect(await optionsOf(page, form, "Destination")).toEqual(["Cash"]);
  });

  test("with only one account, a transfer leads to Accounts", async ({ page }) => {
    await page.goto("/");
    const form = await openTransactionForm(page);
    await form.getByRole("button", { name: "Transfer" }).click();
    await expect(form.getByRole("alert")).toContainText(messages["transfer-needs-second-account"]);
    await form.getByRole("link", { name: "Go to Accounts" }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
  });
});

test.describe("validation messages beside their fields (FR-068)", () => {
  test("an unreadable amount", async ({ page }) => {
    await page.goto("/");
    const form = await openTransactionForm(page);
    await form.getByLabel("Amount").fill("12,34.5");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(fieldError(form, "Amount")).toHaveText(messages["amount-invalid"]);
  });

  test("a negative amount", async ({ page }) => {
    await page.goto("/");
    const form = await openTransactionForm(page);
    await form.getByLabel("Amount").fill("-5.00");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(fieldError(form, "Amount")).toHaveText(messages["amount-invalid"]);
  });

  test("a missing date", async ({ page }) => {
    await page.goto("/");
    const form = await openTransactionForm(page);
    await form.getByLabel("Date").fill("");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(fieldError(form, "Date")).toHaveText(messages["date-invalid"]);
  });

  test("a transfer without a destination", async ({ page }) => {
    await addAccount(page, "Checking");
    const form = await openTransactionForm(page);
    await form.getByRole("button", { name: "Transfer" }).click();
    await form.getByRole("button", { name: "Save" }).click();
    await expect(fieldError(form, "Destination")).toHaveText(
      messages["transfer-destination-missing"],
    );
  });
});
