import type { Page } from "@playwright/test";
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
