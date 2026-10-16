import { readFile } from "node:fs/promises";
import type { Download, Page } from "@playwright/test";
import type {
  Account,
  Budget,
  Category,
  ChatTurn,
  MappingProfile,
  PendingBatch,
  Settings,
  Transaction,
} from "../../src/domain/types";
import { storedRecord, storedRecords } from "./app";
import { expect } from "./test";

// Backup steps that several specs take, and the records a backup holds (contracts/backup-file.md).

/** The `data` of a backup file: every record of every store. */
export interface BackupData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  profiles: MappingProfile[];
  pendingBatch: PendingBatch | null;
  settings: Settings;
  /** The finance chat's turns, present only while it holds one (R-26). */
  conversation?: ChatTurn[];
}

export interface BackupFile {
  app: string;
  formatVersion: number;
  exportedAt: string;
  data: BackupData;
}

/** A backup file's text built from plain records, as the app writes it. */
export function backupText(data: BackupData, exportedAt = "2026-09-03T10:00:00.000Z"): string {
  const file: BackupFile = { app: "financial-copilot", formatVersion: 1, exportedAt, data };
  return JSON.stringify(file);
}

/** Every record the app has stored, in the shape of a backup's `data`. */
export async function storedData(page: Page): Promise<BackupData> {
  const [accounts, categories, transactions, budgets, profiles, batches, settings, conversation] =
    await Promise.all([
      storedRecords<Account>(page, "accounts"),
      storedRecords<Category>(page, "categories"),
      storedRecords<Transaction>(page, "transactions"),
      storedRecords<Budget>(page, "budgets"),
      storedRecords<MappingProfile>(page, "profiles"),
      storedRecords<PendingBatch>(page, "pendingBatch"),
      // The settings store holds the settings, and the conversation under a key of its own (R-26).
      storedRecord<Settings>(page, "settings", "settings"),
      storedRecord<ChatTurn[]>(page, "settings", "conversation"),
    ]);
  return {
    accounts,
    categories,
    transactions,
    budgets,
    profiles,
    pendingBatch: batches[0] ?? null,
    settings: settings!,
    ...(conversation ? { conversation } : {}),
  };
}

const keyOf = (record: object) =>
  String("id" in record ? record.id : (record as Budget).categoryId);

function sortedByKey<Item extends object>(items: readonly Item[]): Item[] {
  return [...items].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
}

/** `data` with each list in key order, so two sets of records compare without their order. */
export function byKey(data: BackupData): BackupData {
  return {
    ...data,
    accounts: sortedByKey(data.accounts),
    categories: sortedByKey(data.categories),
    transactions: sortedByKey(data.transactions),
    budgets: sortedByKey(data.budgets),
    profiles: sortedByKey(data.profiles),
  };
}

/** The name, text and content of a file the app handed to the browser as a download. */
export async function readDownload(download: Download) {
  const text = await readFile(await download.path(), "utf-8");
  return { fileName: download.suggestedFilename(), text, json: JSON.parse(text) as BackupFile };
}

/** Presses Save backup on the Backup screen and reads the file it downloads (FR-070). */
export async function saveBackup(page: Page) {
  await page.goto("/#/backup");
  const download = page.waitForEvent("download");
  await page.getByRole("main").getByRole("button", { name: "Save backup" }).click();
  return readDownload(await download);
}

/** Picks `text` as the file under Restore from backup; the caller checks what follows. */
export async function chooseBackupFile(
  page: Page,
  text: string,
  name = "financial-copilot-backup-2026-09-03.json",
): Promise<void> {
  await page.goto("/#/backup");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("main").getByRole("button", { name: "Restore from backup" }).click();
  await (
    await chooser
  ).setFiles({ name, mimeType: "application/json", buffer: Buffer.from(text, "utf-8") });
}

/**
 * Restores `text` through the Backup screen, confirms the replacement and waits for Transactions.
 * A backup of thousands of transactions takes seconds to check and write, longer on a busy
 * machine, so such a test passes a `timeout` for that wait.
 */
export async function restoreBackup(
  page: Page,
  text: string,
  name?: string,
  { timeout }: { timeout?: number } = {},
): Promise<void> {
  await chooseBackupFile(page, text, name);
  const confirmation = page.getByRole("alertdialog");
  await confirmation.getByRole("button", { name: "Replace all data" }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(page).toHaveURL(/#\/$/, { timeout });
}
