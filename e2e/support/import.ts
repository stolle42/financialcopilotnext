import type { Page } from "@playwright/test";
import { choose, fixture } from "./app";
import { expect } from "./test";

// Import steps that several specs take, the way a user would (contracts/ui.md, import).

interface MyBankMapping {
  name?: string;
  encoding?: string;
}

/**
 * Maps the MyBank layout in the open editor: `;`, `,` decimals, DD.MM.YYYY. Each setting is chosen
 * over whatever the editor proposed, so the mapping holds with or without a proposal.
 */
export async function mapMyBank(
  page: Page,
  { name = "MyBank", encoding = "Windows-1252" }: MyBankMapping = {},
) {
  const editor = page.getByRole("main");
  await editor.getByLabel("Name", { exact: true }).fill(name);
  await choose(page, editor, "Encoding", encoding);
  await choose(page, editor, "Date column", "Date");
  await choose(page, editor, "Amount column", "Amount");
  await choose(page, editor, "Description column", "Purpose");
  await choose(page, editor, "Counterparty column", "Payee");
  await choose(page, editor, "Decimal separator", "Comma (1.250,00)");
}

/** Saves a MyBank bank CSV format from the editor, with `sample` as its sample file. */
export async function saveMyBankProfile(
  page: Page,
  mapping: MyBankMapping = {},
  sample = "mybank-2026-08.csv",
) {
  await page.goto("/#/import/profiles/new");
  await page.getByLabel("Sample file").setInputFiles(fixture(sample));
  await mapMyBank(page, mapping);
  await page.getByRole("main").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/#\/import$/);
}

interface ImportChoice {
  account?: string;
  file: string;
  profile?: string;
}

/** Fills the Import screen and presses Import; the caller checks where that leads. */
export async function startImport(page: Page, { account, file, profile }: ImportChoice) {
  await page.goto("/#/import");
  const form = page.getByRole("region", { name: "Import a file" });
  if (account) await choose(page, form, "Account", account);
  await form.getByLabel("Bank file").setInputFiles(fixture(file));
  if (profile) await choose(page, form, "Bank CSV format", profile);
  await form.getByRole("button", { name: "Import", exact: true }).click();
}

/** Imports `file` with a saved bank CSV format and waits for review to open. */
export async function importWithProfile(page: Page, choice: ImportChoice) {
  await startImport(page, choice);
  await expect(page).toHaveURL(/#\/import\/review$/);
}

/** Saves the bank CSV format of debit-credit.csv from the editor, with the file as its sample. */
export async function saveDebitCreditProfile(page: Page) {
  await page.goto("/#/import/profiles/new");
  await page.getByLabel("Sample file").setInputFiles(fixture("debit-credit.csv"));
  await mapDebitCredit(page);
  await expect(page).toHaveURL(/#\/import$/);
}

/** Maps debit-credit.csv in the open editor and saves: `.` decimals, MM/DD/YYYY, no counterparty. */
export async function mapDebitCredit(page: Page) {
  const editor = page.getByRole("main");
  await editor.getByLabel("Name", { exact: true }).fill("Card bank");
  await editor.getByRole("button", { name: "Separate debit and credit columns" }).click();
  await choose(page, editor, "Date column", "Date");
  await choose(page, editor, "Debit column", "Debit");
  await choose(page, editor, "Credit column", "Credit");
  await choose(page, editor, "Description column", "Description");
  await choose(page, editor, "Date format", "MM/DD/YYYY (09/03/2026)");
  await choose(page, editor, "Decimal separator", "Point (1,250.00)");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
}

/**
 * Starts an import of `file` into `account` with no bank CSV format saved, which opens the editor
 * for a new one with the settings proposed from the file (FR-133).
 */
export async function openEditorFor(page: Page, file: string, account = "Cash") {
  await startImport(page, { account, file });
  await expect(page).toHaveURL(/#\/import\/profiles\/new$/);
}

/** What the editor's controls show, as the user reads them. */
interface EditorSettings {
  hasHeaderRow: boolean;
  encoding: string;
  dateFormat: string;
  decimalSeparator: string;
  amountMode: "One signed column" | "Separate debit and credit columns";
  columns: Record<string, string>;
}

/** Checks that every control of the open editor shows `settings`. */
export async function expectEditorSettings(page: Page, settings: EditorSettings) {
  const editor = page.getByRole("main");
  const header = editor.getByRole("switch", { name: "First row contains column names" });
  if (settings.hasHeaderRow) await expect(header).toBeChecked();
  else await expect(header).not.toBeChecked();
  await expect(editor.getByLabel("Encoding", { exact: true })).toHaveText(settings.encoding);
  await expect(editor.getByLabel("Date format", { exact: true })).toHaveText(settings.dateFormat);
  await expect(editor.getByLabel("Decimal separator", { exact: true })).toHaveText(
    settings.decimalSeparator,
  );
  await expect(editor.getByRole("button", { name: settings.amountMode })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  for (const [label, shown] of Object.entries(settings.columns)) {
    await expect(editor.getByLabel(label, { exact: true })).toHaveText(shown);
  }
}

/** The preview's data rows, and those of them it cannot read: they show no amount. */
export function previewDataRows(page: Page) {
  const rows = page.getByRole("region", { name: "Preview" }).locator("tbody tr");
  return { rows, unreadable: rows.filter({ hasNotText: "€" }) };
}
