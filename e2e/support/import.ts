import type { Page } from "@playwright/test";
import { choose, fixture } from "./app";
import { expect } from "./test";

// Import steps that several specs take, the way a user would (contracts/ui.md, import).

interface MyBankMapping {
  name?: string;
  encoding?: string;
}

/** Maps the MyBank layout in the open profile editor: `;`, `,` decimals, DD.MM.YYYY. */
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

/** Saves a MyBank profile from the editor, with `sample` as its sample file. */
export async function saveMyBankProfile(
  page: Page,
  mapping: MyBankMapping = {},
  sample = "mybank-2026-08.csv",
) {
  await page.goto("/#/import/profiles/new");
  await page.getByLabel("Sample file").setInputFiles(fixture(sample));
  await mapMyBank(page, mapping);
  await page.getByRole("main").getByRole("button", { name: "Save profile" }).click();
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
  if (profile) await choose(page, form, "Profile", profile);
  await form.getByRole("button", { name: "Import", exact: true }).click();
}

/** Imports `file` with an existing profile and waits for review to open. */
export async function importWithProfile(page: Page, choice: ImportChoice) {
  await startImport(page, choice);
  await expect(page).toHaveURL(/#\/import\/review$/);
}
