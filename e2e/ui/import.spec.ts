import type { Locator, Page } from "@playwright/test";
import type { Account, MappingProfile, PendingBatch } from "../../src/domain/types";
import { messageFor } from "../../src/ui/messages";
import {
  addAccount,
  addTransaction,
  choose,
  fixture,
  screenIntro,
  storedRecords,
} from "../support/app";
import { importWithProfile, mapMyBank, saveMyBankProfile, startImport } from "../support/import";
import { euros, expect, test } from "../support/test";

// contracts/ui.md, import; contracts/csv-import.md, outcomes; User Story 2 scenarios 1, 2, 13
// and 15; FR-085, FR-132, FR-137, FR-138.

const importForm = (page: Page) => page.getByRole("region", { name: "Import a file" });
const pendingCard = (page: Page) => page.getByRole("region", { name: "Import waiting for review" });
const profileList = (page: Page) => page.getByRole("region", { name: "Bank CSV formats" });

const storedBatches = (page: Page) => storedRecords<PendingBatch>(page, "pendingBatch");

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Screens" });
const importButton = (page: Page) =>
  page.getByRole("main").getByRole("link", { name: "Import CSV", exact: true });

test("Import has no entry in the sidebar", async ({ page }) => {
  await page.goto("/");
  await expect(sidebar(page).getByRole("link")).toHaveText([
    "Transactions",
    "Categories",
    "Accounts",
    "Budgets",
    "Backup",
    "Insights",
    "Settings",
    "FAQ",
  ]);
});

test("Import CSV on Transactions opens Import, at the right of the heading", async ({ page }) => {
  await page.goto("/");
  const heading = page.getByRole("main").getByRole("heading", { name: "Transactions", level: 1 });
  const headingBox = (await heading.boundingBox())!;
  const buttonBox = (await importButton(page).boundingBox())!;
  expect(buttonBox.x).toBeGreaterThan(headingBox.x + headingBox.width);
  expect(buttonBox.y).toBeLessThan(headingBox.y + headingBox.height);
  expect(buttonBox.y + buttonBox.height).toBeGreaterThan(headingBox.y);

  await importButton(page).click();
  await expect(page).toHaveURL(/#\/import$/);
  await expect(page.getByRole("main").getByRole("heading", { name: "Import" })).toBeVisible();
});

test("Import CSV shows with transactions too", async ({ page }) => {
  await page.goto("/");
  await addTransaction(page, { amount: "4.00", description: "Coffee" });
  await expect(page.getByRole("list", { name: "Transactions" })).toContainText("Coffee");
  await importButton(page).click();
  await expect(page).toHaveURL(/#\/import$/);
});

test("Import, Review and the bank CSV format editor mark Transactions as the current entry", async ({
  page,
}) => {
  const main = page.getByRole("main");
  const screens: [path: string, shown: Locator][] = [
    ["/#/import", main.getByRole("heading", { name: "Import", level: 1 })],
    ["/#/import/review", main.getByRole("button", { name: "Go to Import" })],
    [
      "/#/import/profiles/new",
      main.getByRole("heading", { name: "New bank CSV format", level: 1 }),
    ],
  ];
  for (const [path, shown] of screens) {
    await page.goto(path);
    await expect(shown).toBeVisible();
    await expect(sidebar(page).locator('[aria-current="page"]')).toHaveText(["Transactions"]);
  }
});

test("the empty Transactions screen offers Import a CSV", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "Import a CSV" }).click();
  await expect(page).toHaveURL(/#\/import$/);
});

test("a new bank CSV format set up for a file continues its import, which changes no balance (scenario 1)", async ({
  page,
}) => {
  await addAccount(page, "Checking", "1250.00");
  await startImport(page, { account: "Checking", file: "mybank-2026-08.csv" });

  // With no format yet, Create new bank CSV format is the choice, and the editor previews the file.
  await expect(page).toHaveURL(/#\/import\/profiles\/new$/);
  await expect(page.getByRole("main")).toContainText("Previewing mybank-2026-08.csv");
  await expect(page.getByLabel("Sample file")).toHaveCount(0);
  await mapMyBank(page);
  await page.getByRole("main").getByRole("button", { name: "Save", exact: true }).click();

  await expect(page).toHaveURL(/#\/import\/review$/);
  const [batch] = await storedBatches(page);
  expect(batch).toMatchObject({ fileName: "mybank-2026-08.csv" });
  expect(batch?.rows).toHaveLength(16);
  expect(await storedRecords(page, "transactions")).toEqual([]);
  await page.goto("/#/accounts");
  await expect(page.getByRole("row").filter({ hasText: "Checking" })).toContainText(euros(125000));
});

test("a saved bank CSV format is preselected and applied without re-mapping (scenario 2)", async ({
  page,
}) => {
  await saveMyBankProfile(page);
  await page.goto("/#/import");
  await expect(importForm(page).getByLabel("Bank CSV format", { exact: true })).toHaveText(
    "MyBank",
  );
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-09.csv" });
  const [batch] = await storedBatches(page);
  expect(batch?.rows).toHaveLength(7);
});

test("the account has no default and is required", async ({ page }) => {
  await saveMyBankProfile(page);
  await page.goto("/#/import");
  await expect(importForm(page).getByLabel("Account", { exact: true })).toHaveText(
    "Choose an account",
  );
  await startImport(page, { file: "mybank-2026-08.csv" });
  await expect(importForm(page).getByRole("alert")).toHaveText(
    messageFor({ code: "import-account-missing" }),
  );
  expect(await storedBatches(page)).toEqual([]);
});

test("names the columns a file lacks and creates no batch (scenario 13)", async ({ page }) => {
  await saveMyBankProfile(page);
  await startImport(page, { account: "Cash", file: "mybank-renamed-column.csv" });
  await expect(importForm(page).getByRole("alert")).toContainText(
    messageFor({ code: "import-missing-columns", details: { columns: ["Amount"] } }),
  );
  expect(await storedBatches(page)).toEqual([]);
});

test("says a header-only file contains no transactions", async ({ page }) => {
  await saveMyBankProfile(page);
  await startImport(page, { account: "Cash", file: "header-only.csv" });
  await expect(importForm(page).getByRole("alert")).toContainText(
    messageFor({ code: "import-no-transactions" }),
  );
  expect(await storedBatches(page)).toEqual([]);
});

test("suggests another encoding for a Windows-1252 file read with a UTF-8 bank CSV format", async ({
  page,
}) => {
  // The header-only file is plain ASCII, so it can describe the layout in UTF-8.
  await saveMyBankProfile(page, { name: "MyBank UTF-8", encoding: "UTF-8" }, "header-only.csv");
  await startImport(page, { account: "Cash", file: "mybank-2026-08.csv" });
  await expect(importForm(page).getByRole("alert")).toContainText(
    messageFor({ code: "import-decoding-failed", details: { encoding: "UTF-8" } }),
  );
  expect(await storedBatches(page)).toEqual([]);
});

test("with a batch pending, shows it and refuses another file, offering to open it (scenario 15)", async ({
  page,
}) => {
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });

  await page.goto("/#/import");
  await expect(pendingCard(page)).toContainText("mybank-2026-08.csv");
  await expect(pendingCard(page)).toContainText("Cash");
  await expect(pendingCard(page)).toContainText("13 to review");
  await expect(pendingCard(page)).toContainText("1 duplicate");
  await expect(pendingCard(page)).toContainText("2 unparsable");

  await importForm(page).getByLabel("Bank file").setInputFiles(fixture("mybank-2026-09.csv"));
  const alert = importForm(page).getByRole("alert");
  await expect(alert).toContainText(messageFor({ code: "import-batch-pending" }));
  await alert.getByRole("button", { name: "Open pending batch" }).click();
  await expect(page).toHaveURL(/#\/import\/review$/);
  expect((await storedBatches(page)).map((b) => b.fileName)).toEqual(["mybank-2026-08.csv"]);
});

test("the pending card leads to review, and discards the batch after confirmation", async ({
  page,
}) => {
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
  await page.goto("/#/import");

  await pendingCard(page).getByRole("button", { name: "Discard" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  expect(await storedBatches(page)).toHaveLength(1);

  await pendingCard(page).getByRole("button", { name: "Discard" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard import" }).click();
  await expect(pendingCard(page)).toHaveCount(0);
  expect(await storedBatches(page)).toEqual([]);
  expect(await storedRecords(page, "transactions")).toEqual([]);
});

test("lists bank CSV formats with Edit, and deleting one leaves the pending batch alone", async ({
  page,
}) => {
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
  const [batch] = await storedBatches(page);
  await page.goto("/#/import");

  const row = profileList(page).getByRole("listitem").filter({ hasText: "MyBank" });
  await row.getByRole("button", { name: "Edit" }).click();
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Edit bank CSV format" }),
  ).toBeVisible();
  await page.goto("/#/import");

  await row.getByRole("button", { name: "Delete" }).click();
  const confirmation = page.getByRole("alertdialog", {
    name: 'Delete the bank CSV format "MyBank"?',
  });
  await expect(confirmation).toContainText("The import waiting for review is not affected");
  await confirmation.getByRole("button", { name: "Delete bank CSV format" }).click();
  await expect(profileList(page).getByRole("listitem")).toHaveCount(0);
  expect(await storedRecords<MappingProfile>(page, "profiles")).toEqual([]);
  expect(await storedBatches(page)).toEqual([batch]);
});

test("offers Create new bank CSV format beside the saved ones", async ({ page }) => {
  await saveMyBankProfile(page);
  await saveMyBankProfile(page, { name: "Other bank" });
  await page.goto("/#/import");
  await expect(importForm(page).getByLabel("Bank CSV format", { exact: true })).toHaveText(
    "Choose a bank CSV format",
  );
  await choose(page, importForm(page), "Account", "Cash");
  await importForm(page).getByLabel("Bank file").setInputFiles(fixture("mybank-2026-08.csv"));
  await choose(page, importForm(page), "Bank CSV format", "Create new bank CSV format");
  await importForm(page).getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/#\/import\/profiles\/new$/);

  // Cancelling keeps the account and file chosen.
  await page.getByRole("main").getByRole("button", { name: "Cancel" }).click();
  await expect(importForm(page).getByLabel("Account", { exact: true })).toHaveText("Cash");
  await expect(importForm(page)).toContainText("mybank-2026-08.csv");
});

test("says under the heading what Import is for (FR-137)", async ({ page }) => {
  await page.goto("/#/import");
  await expect(screenIntro(page)).toHaveText(
    "Turns a bank's CSV file into transactions. They wait for your review before they enter " +
      "the ledger.",
  );
});

test('calls a mapping profile a "bank CSV format" and says what one is (FR-138)', async ({
  page,
}) => {
  await page.goto("/#/import");
  await expect(profileList(page).getByRole("heading", { name: "Bank CSV formats" })).toBeVisible();
  await expect(profileList(page)).toContainText(
    "None yet. The first import of a bank's file sets one up.",
  );
  const field = importForm(page)
    .locator('[data-slot="field"]')
    .filter({ has: page.getByLabel("Bank CSV format", { exact: true }) });
  await expect(field).toContainText(
    "A bank CSV format tells the app how one bank's files are laid out. You set it up once per " +
      "bank.",
  );
  await importForm(page).getByLabel("Bank CSV format", { exact: true }).click();
  await expect(page.getByRole("option", { name: "Create new bank CSV format" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("main")).not.toContainText(/profile/i);
});

const accountSelect = (page: Page) => importForm(page).getByLabel("Account", { exact: true });

/** Opens New account… from Import's Account select, and returns the account dialog. */
async function newAccountOnImport(page: Page) {
  await choose(page, importForm(page), "Account", "New account…");
  const dialog = page.getByRole("dialog", { name: "New account" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("the Account select ends with New account…, after the accounts (FR-132)", async ({ page }) => {
  await page.goto("/#/import");
  await accountSelect(page).click();
  await expect(page.getByRole("option")).toHaveText(["Cash", "New account…"]);
});

test("New account… creates an account and chooses it for the import (FR-132)", async ({ page }) => {
  await page.goto("/#/import");
  const dialog = await newAccountOnImport(page);
  await dialog.getByLabel("Name").fill("Giro");
  await dialog.getByLabel("Opening balance").fill("1250.00");
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(accountSelect(page)).toHaveText("Giro");
  const giro = (await storedRecords<Account>(page, "accounts")).find((a) => a.name === "Giro");
  expect(giro).toMatchObject({ openingBalanceCents: 125000 });

  await importForm(page).getByLabel("Bank file").setInputFiles(fixture("mybank-2026-10.csv"));
  await importForm(page).getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/#\/import\/profiles\/new$/);
  await page.getByRole("main").getByLabel("Name", { exact: true }).fill("MyBank");
  await page.getByRole("main").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/#\/import\/review$/);
  const [batch] = await storedBatches(page);
  expect(batch?.accountId).toBe(giro!.id);
});

test("Cancel in New account… keeps the account chosen before, or none (FR-132)", async ({
  page,
}) => {
  await page.goto("/#/import");
  let dialog = await newAccountOnImport(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(accountSelect(page)).toHaveText("Choose an account");

  await choose(page, importForm(page), "Account", "Cash");
  dialog = await newAccountOnImport(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(accountSelect(page)).toHaveText("Cash");
  expect(await storedRecords<Account>(page, "accounts")).toHaveLength(1);
});

test("New account… refuses a name taken, ignoring case, and keeps the dialog open (FR-132)", async ({
  page,
}) => {
  await page.goto("/#/import");
  const dialog = await newAccountOnImport(page);
  await dialog.getByLabel("Name").fill("cash");
  await dialog.getByLabel("Opening balance").fill("10.00");
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(dialog).toContainText(messageFor({ code: "account-name-taken" }));
  await expect(dialog.getByLabel("Name")).toHaveValue("cash");
  await expect(dialog.getByLabel("Opening balance")).toHaveValue("10.00");
  expect(await storedRecords<Account>(page, "accounts")).toHaveLength(1);
});
