import { fileURLToPath } from "node:url";
import type { Locator, Page } from "@playwright/test";
import type { Budget, Category, Transaction } from "../../src/domain/types";
import { expect } from "./test";

// Steps that several specs take through the app, the way a user would.

/** Creates an account on the Accounts screen; the opening balance is typed as in en-US. */
export async function addAccount(page: Page, name: string, openingBalance = "0"): Promise<void> {
  await page.goto("/#/accounts");
  await page.getByRole("button", { name: "New account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Opening balance").fill(openingBalance);
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(dialog).toHaveCount(0);
}

/** Opens the transaction form from the header and returns it. */
export async function openTransactionForm(page: Page) {
  await page.getByRole("banner").getByRole("button", { name: "Add transaction" }).click();
  const form = page.getByRole("dialog", { name: "Add transaction" });
  await expect(form).toBeVisible();
  return form;
}

/** Picks `option` in the select labelled `label` inside `scope`. */
export async function choose(page: Page, scope: Locator, label: string, option: string) {
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

interface NewTransaction {
  kind?: "Expense" | "Income" | "Transfer";
  /** As typed in en-US, such as "40.00". */
  amount: string;
  category?: string;
  destination?: string;
  account?: string;
  date?: string;
  description?: string;
}

/** Records a transaction through the form opened from the header. */
export async function addTransaction(page: Page, transaction: NewTransaction): Promise<void> {
  const form = await openTransactionForm(page);
  if (transaction.kind) await form.getByRole("button", { name: transaction.kind }).click();
  await form.getByLabel("Amount").fill(transaction.amount);
  if (transaction.category) await choose(page, form, "Category", transaction.category);
  if (transaction.account) await choose(page, form, "Account", transaction.account);
  if (transaction.destination) await choose(page, form, "Destination", transaction.destination);
  if (transaction.date) await form.getByLabel("Date").fill(transaction.date);
  if (transaction.description) await form.getByLabel("Description").fill(transaction.description);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toHaveCount(0);
}

/** The records the app has stored in one store of its IndexedDB database (data-model.md). */
export function storedRecords<Item>(page: Page, store: string): Promise<Item[]> {
  return page.evaluate(
    (storeName) =>
      new Promise<Item[]>((resolve, reject) => {
        const open = indexedDB.open("financial-copilot");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const request = open.result.transaction(storeName).objectStore(storeName).getAll();
          request.onsuccess = () => {
            open.result.close();
            resolve(request.result as Item[]);
          };
          request.onerror = () => reject(request.error);
        };
      }),
    store,
  );
}

export function storedTransactions(page: Page): Promise<Transaction[]> {
  return storedRecords<Transaction>(page, "transactions");
}

/**
 * Writes records straight into one store of the app's database, for data that no screen can enter
 * yet. The app reads storage only at start-up, so the page must reload to show them.
 */
export function putRecords(page: Page, store: string, records: unknown[]): Promise<void> {
  return page.evaluate(
    ([storeName, items]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("financial-copilot");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const transaction = open.result.transaction(storeName, "readwrite");
          for (const item of items) transaction.objectStore(storeName).put(item);
          transaction.oncomplete = () => {
            open.result.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    [store, records] as const,
  );
}

/** The records of the budgets store: one limit per expense category (data-model.md). */
export function storedBudgets(page: Page): Promise<Budget[]> {
  return storedRecords<Budget>(page, "budgets");
}

/**
 * Writes budget limits straight into storage, `limits` being cents by expense category name, and
 * reloads so the app shows them. Insights tests use it so they do not depend on the Budgets screen.
 */
export async function putBudgets(page: Page, limits: Record<string, number>): Promise<void> {
  const categories = await storedRecords<Category>(page, "categories");
  const budgets = Object.entries(limits).map(([name, limitCents]) => {
    const category = categories.find((c) => c.side === "expense" && c.name === name);
    if (!category) throw new Error(`No expense category ${name}`);
    return { categoryId: category.id, limitCents };
  });
  await putRecords(page, "budgets", budgets);
  await page.reload();
}

/** The row of the Budgets screen for the expense category `name`. */
export function budgetRow(page: Page, name: string): Locator {
  return page.getByRole("main").getByRole("listitem").filter({ hasText: name });
}

/** Types a monthly limit on the Budgets screen, saves it with Enter and waits for the write. */
export async function setBudgetLimit(page: Page, category: string, limit: string): Promise<void> {
  await page.goto("/#/budgets");
  const field = budgetRow(page, category).getByLabel("Monthly limit");
  await field.fill(limit);
  await field.press("Enter");
  const categories = await storedRecords<Category>(page, "categories");
  const id = categories.find((c) => c.side === "expense" && c.name === category)?.id;
  const cents = Math.round(Number(limit) * 100);
  await expect
    .poll(async () => (await storedBudgets(page)).find((b) => b.categoryId === id)?.limitCents)
    .toBe(cents);
}

/** Removes a category's limit on the Budgets screen. */
export async function removeBudgetLimit(page: Page, category: string): Promise<void> {
  await page.goto("/#/budgets");
  await budgetRow(page, category).getByRole("button", { name: "Remove" }).click();
  await expect(budgetRow(page, category).getByLabel("Monthly limit")).toHaveValue("");
}

/** The path of a bank file in e2e/fixtures (quickstart.md, US2). */
export function fixture(name: string): string {
  return fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
}
