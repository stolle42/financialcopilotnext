import type { Page } from "@playwright/test";
import type { Transaction } from "../../src/domain/types";
import { messageFor, notifications } from "../../src/ui/messages";
import { addTransaction } from "../support/app";
import {
  backupText,
  byKey,
  chooseBackupFile,
  saveBackup,
  storedData,
  type BackupData,
} from "../support/backup";
import { expect, setToday, test } from "../support/test";

// contracts/ui.md, backup; contracts/backup-file.md; FR-070 – FR-072, FR-075.

test.beforeEach(async ({ page }) => {
  await setToday(page, "2026-09-03");
});

const main = (page: Page) => page.getByRole("main");
const ledgerRows = (page: Page) =>
  page.getByRole("list", { name: "Transactions" }).getByRole("listitem");

/** The app's current records with one expense, "Current", recorded through the form. */
async function withCurrentData(page: Page): Promise<BackupData> {
  await page.goto("/");
  await addTransaction(page, { amount: "40.00", category: "Groceries", description: "Current" });
  return storedData(page);
}

/** A valid backup of other data: `current` with an extra account and one other transaction. */
function otherBackup(current: BackupData): BackupData {
  const groceries = current.categories.find((c) => c.side === "expense" && c.name === "Groceries")!;
  const restored: Transaction = {
    id: "from-backup",
    seq: 1,
    date: "2026-08-15",
    amountCents: 1234,
    accountId: "restored-account",
    description: "From the backup",
    kind: "expense",
    categoryId: groceries.id,
  };
  return {
    ...current,
    accounts: [
      ...current.accounts,
      { id: "restored-account", name: "Restored", type: "savings", openingBalanceCents: 5000 },
    ],
    transactions: [restored],
    settings: { manualEntryAccountId: "restored-account" },
  };
}

test("Backup is the fifth entry in the sidebar", async ({ page }) => {
  await page.goto("/");
  const links = page.getByRole("navigation", { name: "Screens" }).getByRole("link");
  await expect(links.nth(4)).toHaveText("Backup");
  await links.nth(4).click();
  await expect(page).toHaveURL(/#\/backup$/);
  await expect(main(page).getByRole("heading", { name: "Backup", level: 1 })).toBeVisible();
});

test("Save backup downloads today's file with every record, and changes nothing (FR-070)", async ({
  page,
}) => {
  const before = await withCurrentData(page);

  const backup = await saveBackup(page);

  expect(backup.fileName).toBe("financial-copilot-backup-2026-09-03.json");
  expect(backup.json).toMatchObject({ app: "financial-copilot", formatVersion: 1 });
  expect(byKey(backup.json.data)).toEqual(byKey(before));
  expect(await storedData(page)).toEqual(before);
  await expect(page).toHaveURL(/#\/backup$/);
});

test("Restore asks first, then replaces all data and opens Transactions (FR-071)", async ({
  page,
}) => {
  const backup = otherBackup(await withCurrentData(page));

  await chooseBackupFile(page, backupText(backup), "machine-b.json");

  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText(/replace/i);
  await expect(confirmation).toContainText(/all/i);
  await confirmation.getByRole("button", { name: "Replace all data" }).click();

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByText(notifications.restored("machine-b.json"))).toBeVisible();
  await expect(ledgerRows(page)).toHaveCount(1);
  await expect(ledgerRows(page).first()).toContainText("From the backup");
  expect(byKey(await storedData(page))).toEqual(byKey(backup));
});

test("cancelling the confirmation changes nothing", async ({ page }) => {
  const before = await withCurrentData(page);

  await chooseBackupFile(page, backupText(otherBackup(before)));
  const confirmation = page.getByRole("alertdialog");
  await confirmation.getByRole("button", { name: "Cancel" }).click();

  await expect(confirmation).toHaveCount(0);
  await expect(page).toHaveURL(/#\/backup$/);
  expect(await storedData(page)).toEqual(before);
});

test.describe("an invalid file is refused at once, and the data stays (FR-072)", () => {
  /** Chooses `text` and expects an alert, no confirmation and unchanged records. */
  async function expectRefused(page: Page, text: string): Promise<string> {
    const before = await withCurrentData(page);
    await chooseBackupFile(page, text);
    const alert = main(page).getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(await storedData(page)).toEqual(before);
    return (await alert.textContent()) ?? "";
  }

  test("a file that is not a backup", async ({ page }) => {
    expect(await expectRefused(page, "Date;Amount\n01.08.2026;-45,20")).toContain(
      messageFor({ code: "backup-not-a-backup" }),
    );
  });

  test("a backup from a newer version of the app", async ({ page }) => {
    const text = JSON.stringify({ app: "financial-copilot", formatVersion: 2, data: {} });
    expect(await expectRefused(page, text)).toContain(messageFor({ code: "backup-newer-version" }));
  });

  test("a backup with a transaction that has no date", async ({ page }) => {
    await page.goto("/");
    const backup = otherBackup(await storedData(page));
    const withoutDate: Partial<Transaction> = { ...backup.transactions[0]! };
    delete withoutDate.date;
    const text = backupText({ ...backup, transactions: [withoutDate as Transaction] });

    const message = await expectRefused(page, text);

    expect(message).toMatch(/transaction/i);
    expect(message).toMatch(/date/i);
    expect(message).toMatch(/unchanged/i);
  });

  test("a backup whose transaction refers to an account it does not hold", async ({ page }) => {
    await page.goto("/");
    const backup = otherBackup(await storedData(page));
    const orphan = { ...backup.transactions[0]!, accountId: "not-in-the-backup" };

    const message = await expectRefused(page, backupText({ ...backup, transactions: [orphan] }));

    expect(message).toMatch(/account/i);
    expect(message).toMatch(/unchanged/i);
  });
});

test.describe("persistent storage (FR-075)", () => {
  const notice = (page: Page) => main(page).getByText(/browser may (clear|delete)/i);

  async function persistAnswers(page: Page, granted: boolean) {
    await page.addInitScript((answer) => {
      StorageManager.prototype.persist = () => Promise.resolve(answer);
    }, granted);
  }

  test("when the browser did not agree to keep the data, says so and points to backups", async ({
    page,
  }) => {
    await persistAnswers(page, false);
    await page.goto("/#/backup");
    await expect(notice(page)).toBeVisible();
    await expect(notice(page)).toContainText(/backup/i);
  });

  test("while the browser offers no install, the note holds no install hint (FR-075)", async ({
    page,
  }) => {
    await persistAnswers(page, false);
    await page.goto("/#/backup");
    await expect(notice(page)).toBeVisible();
    await expect(notice(page)).not.toContainText(/install/i);
    await expect(main(page).getByRole("button", { name: "Install app" })).toHaveCount(0);
  });

  test("when the browser agreed, shows no such notice", async ({ page }) => {
    await persistAnswers(page, true);
    await page.goto("/#/backup");
    await expect(main(page).getByRole("heading", { name: "Backup", level: 1 })).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Save backup" })).toBeVisible();
    await expect(notice(page)).toHaveCount(0);
  });
});
