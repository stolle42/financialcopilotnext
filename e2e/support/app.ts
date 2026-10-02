import type { Locator, Page } from "@playwright/test";
import type { Transaction } from "../../src/domain/types";
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
