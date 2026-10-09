import type { Locator, Page } from "@playwright/test";
import type { MappingProfile, PendingBatch } from "../../src/domain/types";
import { messageFor } from "../../src/ui/messages";
import { addAccount, addTransaction, choose, fixture, storedRecords } from "../support/app";
import { importWithProfile, mapMyBank, saveMyBankProfile, startImport } from "../support/import";
import { euros, expect, test } from "../support/test";

// contracts/ui.md, import; contracts/csv-import.md, outcomes; User Story 2 scenarios 1, 2, 13
// and 15.

const importForm = (page: Page) => page.getByRole("region", { name: "Import a file" });
const pendingCard = (page: Page) => page.getByRole("region", { name: "Import waiting for review" });
const profileList = (page: Page) => page.getByRole("region", { name: "Mapping profiles" });

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

test("Import, Review and the profile editor mark Transactions as the current entry", async ({
  page,
}) => {
  const main = page.getByRole("main");
  const screens: [path: string, shown: Locator][] = [
    ["/#/import", main.getByRole("heading", { name: "Import", level: 1 })],
    ["/#/import/review", main.getByRole("button", { name: "Go to Import" })],
    ["/#/import/profiles/new", main.getByRole("heading", { name: "New profile", level: 1 })],
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

test("a new profile defined for a file continues its import, which changes no balance (scenario 1)", async ({
  page,
}) => {
  await addAccount(page, "Checking", "1250.00");
  await startImport(page, { account: "Checking", file: "mybank-2026-08.csv" });

  // With no profile yet, Create new profile is the choice, and the editor previews the file.
  await expect(page).toHaveURL(/#\/import\/profiles\/new$/);
  await expect(page.getByRole("main")).toContainText("Previewing mybank-2026-08.csv");
  await expect(page.getByLabel("Sample file")).toHaveCount(0);
  await mapMyBank(page);
  await page.getByRole("main").getByRole("button", { name: "Save profile" }).click();

  await expect(page).toHaveURL(/#\/import\/review$/);
  const [batch] = await storedBatches(page);
  expect(batch).toMatchObject({ fileName: "mybank-2026-08.csv" });
  expect(batch?.rows).toHaveLength(16);
  expect(await storedRecords(page, "transactions")).toEqual([]);
  await page.goto("/#/accounts");
  await expect(page.getByRole("row").filter({ hasText: "Checking" })).toContainText(euros(125000));
});

test("a saved profile is preselected and applied without re-mapping (scenario 2)", async ({
  page,
}) => {
  await saveMyBankProfile(page);
  await page.goto("/#/import");
  await expect(importForm(page).getByLabel("Profile", { exact: true })).toHaveText("MyBank");
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

test("suggests another encoding for a Windows-1252 file read with a UTF-8 profile", async ({
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

test("lists profiles with Edit, and deleting one leaves the pending batch alone", async ({
  page,
}) => {
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
  const [batch] = await storedBatches(page);
  await page.goto("/#/import");

  const row = profileList(page).getByRole("listitem").filter({ hasText: "MyBank" });
  await row.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("main").getByRole("heading", { name: "Edit profile" })).toBeVisible();
  await page.goto("/#/import");

  await row.getByRole("button", { name: "Delete" }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("The import waiting for review is not affected");
  await confirmation.getByRole("button", { name: "Delete profile" }).click();
  await expect(profileList(page).getByRole("listitem")).toHaveCount(0);
  expect(await storedRecords<MappingProfile>(page, "profiles")).toEqual([]);
  expect(await storedBatches(page)).toEqual([batch]);
});

test("offers Create new profile beside the saved profiles", async ({ page }) => {
  await saveMyBankProfile(page);
  await saveMyBankProfile(page, { name: "Other bank" });
  await page.goto("/#/import");
  await expect(importForm(page).getByLabel("Profile", { exact: true })).toHaveText(
    "Choose a profile",
  );
  await choose(page, importForm(page), "Account", "Cash");
  await importForm(page).getByLabel("Bank file").setInputFiles(fixture("mybank-2026-08.csv"));
  await choose(page, importForm(page), "Profile", "Create new profile");
  await importForm(page).getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/#\/import\/profiles\/new$/);

  // Cancelling keeps the account and file chosen.
  await page.getByRole("main").getByRole("button", { name: "Cancel" }).click();
  await expect(importForm(page).getByLabel("Account", { exact: true })).toHaveText("Cash");
  await expect(importForm(page)).toContainText("mybank-2026-08.csv");
});
