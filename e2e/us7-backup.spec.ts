import type { Page } from "@playwright/test";
import type { Account } from "../src/domain/types";
import { messageFor, notifications } from "../src/ui/messages";
import {
  addAccount,
  addTransaction,
  choose,
  reconcileAccount,
  setBudgetLimit,
  storedRecords,
} from "./support/app";
import { byKey, chooseBackupFile, restoreBackup, saveBackup, storedData } from "./support/backup";
import { standInCategoriser, suggestCategories, turnOnAiFeatures } from "./support/categoriser";
import { importWithProfile, saveMyBankProfile } from "./support/import";
import { expect, guardNetwork, setToday, test } from "./support/test";

// The journey of User Story 7, scenarios 1–3, and the round trip of SC-014 (quickstart.md, US7).
// It fills every entity type through the UI, including a pending batch with review progress and a
// category Claude suggested, saves a backup, and restores it over changed data. Then it restores the
// file into a fresh browser context with empty storage, saves again there, and compares the two
// files' `data`.

const main = (page: Page) => page.getByRole("main");
const ledgerRows = (page: Page) =>
  page.getByRole("list", { name: "Transactions" }).getByRole("listitem");

/** Opens Categories on a side's tab, once its panel is the only one. */
async function openCategories(page: Page, tab: "Expenses" | "Income") {
  await page.goto("/#/categories");
  await main(page).getByRole("tab", { name: tab }).click();
  await expect(main(page).getByRole("tabpanel", { name: tab })).toBeVisible();
  await expect(main(page).getByRole("tabpanel")).toHaveCount(1);
}

async function renameCategory(page: Page, name: string, newName: string) {
  await openCategories(page, "Expenses");
  const rows = main(page).getByRole("tabpanel").getByRole("listitem");
  await rows
    .filter({ has: page.getByText(name, { exact: true }) })
    .getByRole("button", { name: "Rename" })
    .click();
  await rows.getByRole("textbox", { name: "Name" }).fill(newName);
  await rows.getByRole("textbox", { name: "Name" }).press("Enter");
  await expect(rows.filter({ has: page.getByText(newName, { exact: true }) })).toHaveCount(1);
}

async function createIncomeCategory(page: Page, name: string) {
  await openCategories(page, "Income");
  await main(page).getByRole("button", { name: "New category" }).click();
  const dialog = page.getByRole("dialog", { name: "New category" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create category" }).click();
  await expect(dialog).toHaveCount(0);
}

/** The Accounts screen's rows as text: every name, type and balance (SC-014). */
async function accountsShown(page: Page): Promise<string[]> {
  await page.goto("/#/accounts");
  await expect(main(page).getByRole("heading", { name: "Accounts" })).toBeVisible();
  return main(page).getByRole("row").allTextContents();
}

test("saves everything to one file and restores exactly that, also into a fresh browser", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(300_000);
  await setToday(page, "2026-09-20");

  // Every entity type, through the UI.
  await addAccount(page, "Giro", "1000.00");
  await renameCategory(page, "Eating out", "Restaurants");
  await createIncomeCategory(page, "Refunds");
  await page.goto("/");
  await addTransaction(page, { amount: "18.50", category: "Restaurants", date: "2026-09-12" });
  await addTransaction(page, {
    kind: "Income",
    amount: "25.00",
    category: "Refunds",
    date: "2026-09-14",
  });
  // The last manual entry is on Giro, which makes Giro the form's default (FR-006).
  await addTransaction(page, {
    kind: "Transfer",
    amount: "100.00",
    account: "Giro",
    destination: "Cash",
    date: "2026-09-15",
  });
  // Cash computes to 106.50 but holds 80.00: a reconciliation entry in "Unaccounted".
  await reconcileAccount(page, "Cash", "80.00");
  await setBudgetLimit(page, "Groceries", "400.00");
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Giro", file: "mybank-2026-08.csv", profile: "MyBank" });
  // Review progress: a vendor group's category, and the file's duplicate included after all.
  await choose(
    page,
    page.getByRole("group", { name: "Assignment of Shop, expenses", exact: true }),
    "Category",
    "Groceries",
  );
  await page
    .getByRole("region", { name: "Batch" })
    .getByRole("button", { name: /duplicate/ })
    .click();
  const duplicates = page.getByRole("dialog", { name: "Duplicates" });
  await duplicates.getByRole("switch").first().click();
  await expect(duplicates.getByRole("switch").first()).toBeChecked();
  await page.keyboard.press("Escape");
  // A category Claude suggested, with AI features on (FR-093, FR-095).
  await standInCategoriser(page, () => ({
    json: { suggestions: [{ rowNumber: 16, category: "Leisure" }] },
  }));
  await turnOnAiFeatures(page);
  await suggestCategories(page);
  await expect(page.getByRole("region", { name: "Suggestions" }).getByRole("status")).toContainText(
    "Claude suggested a category for 1 of",
  );

  const filled = await storedData(page);
  const giro = (await storedRecords<Account>(page, "accounts")).find((a) => a.name === "Giro")!;
  expect(filled.settings.manualEntryAccountId).toBe(giro.id);
  expect(filled.profiles).toHaveLength(1);
  expect(filled.budgets).toHaveLength(1);
  expect(
    filled.pendingBatch?.rows.some((r) => r.status === "parsed" && r.duplicate && r.included),
  ).toBe(true);
  expect(
    filled.pendingBatch?.rows.some(
      (r) => r.status === "parsed" && r.assignment.type === "category" && r.assignment.suggested,
    ),
  ).toBe(true);
  expect(filled.settings.aiFeatures).toBe(true);

  // 1. Saving gives one file with every record, and changes nothing in the app.
  const backup = await saveBackup(page);
  expect(backup.fileName).toBe("financial-copilot-backup-2026-09-20.json");
  expect(byKey(backup.json.data)).toEqual(byKey(filled));
  expect(await storedData(page)).toEqual(filled);

  // 3. A file that is not a valid backup is refused at once, and the data stays as it was.
  await chooseBackupFile(page, backup.text.slice(0, -20), "cut-off.json");
  await expect(main(page).getByRole("alert")).toContainText(
    messageFor({ code: "backup-not-a-backup" }),
  );
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(await storedData(page)).toEqual(filled);

  // 2. Over data that changed since, loading the backup warns first, then shows exactly the
  //    backup's data: a replacement, not a merge.
  await page.goto("/");
  await addTransaction(page, { amount: "5.00", description: "After the backup" });
  await chooseBackupFile(page, backup.text, backup.fileName);
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText(/replace/i);
  await confirmation.getByRole("button", { name: "Replace all data" }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByText(notifications.restored(backup.fileName))).toBeVisible();
  await expect(ledgerRows(page).filter({ hasText: "After the backup" })).toHaveCount(0);
  expect(byKey(await storedData(page))).toEqual(byKey(backup.json.data));
  const balances = await accountsShown(page);

  // SC-014: restored into a fresh browser with empty storage and saved again, the data is equal.
  const fresh = await browser.newContext({ baseURL, locale: "en-US" });
  const freshPage = await fresh.newPage();
  const checkNetwork = await guardNetwork(fresh, freshPage, baseURL);
  await setToday(freshPage, "2026-09-21");
  await freshPage.goto("/");
  await expect(main(freshPage).getByRole("heading", { name: "Transactions" })).toBeVisible();
  expect((await storedData(freshPage)).accounts.map((a) => a.name)).toEqual(["Cash"]);

  await restoreBackup(freshPage, backup.text, backup.fileName);
  const again = await saveBackup(freshPage);

  expect(again.json.data).toEqual(backup.json.data);
  expect(await accountsShown(freshPage)).toEqual(balances);
  await checkNetwork();
  await fresh.close();
});
