import type { Page } from "@playwright/test";
import type { MappingProfile } from "../../src/domain/types";
import { messageFor } from "../../src/ui/messages";
// A namespace import, so the spec loads before the catalogue words the proposal.
import * as catalogue from "../../src/ui/messages";
import { choose, fixture, screenIntro, storedRecords } from "../support/app";
import {
  expectEditorSettings,
  openEditorFor,
  previewDataRows,
  saveMyBankProfile,
} from "../support/import";
import { expect, test } from "../support/test";

// contracts/ui.md, profile editor; contracts/csv-import.md, preview and proposing a format;
// FR-021, FR-133, FR-134, FR-137, FR-138.

const proposal = () =>
  (catalogue as Record<string, unknown>).proposal as { line: string; signHint: string };

const main = (page: Page) => page.getByRole("main");
const preview = (page: Page) => page.getByRole("region", { name: "Preview" });
const previewRows = (page: Page) => preview(page).getByRole("row");

/** The error in the same field as the control labelled `label` (FR-068). */
function fieldError(page: Page, label: string) {
  return main(page)
    .locator('[data-slot="field"]')
    .filter({ has: page.getByLabel(label, { exact: true }) })
    .getByRole("alert");
}

/** Opens a new bank CSV format and maps the August MyBank file, as quickstart.md describes it. */
async function describeMyBank(page: Page, decimalSeparator = "Comma (1.250,00)") {
  await page.goto("/#/import/profiles/new");
  await expect(main(page).getByRole("heading", { name: "New bank CSV format" })).toBeVisible();
  await page.getByLabel("Sample file").setInputFiles(fixture("mybank-2026-08.csv"));
  await choose(page, main(page), "Encoding", "Windows-1252");
  await choose(page, main(page), "Date column", "Date");
  await choose(page, main(page), "Amount column", "Amount");
  await choose(page, main(page), "Description column", "Purpose");
  await choose(page, main(page), "Counterparty column", "Payee");
  await choose(page, main(page), "Decimal separator", decimalSeparator);
}

async function saveMyBank(page: Page) {
  await describeMyBank(page);
  await main(page).getByLabel("Name", { exact: true }).fill("MyBank");
  await main(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/#\/import$/);
}

test("starts with a header row, one signed column and UTF-8", async ({ page }) => {
  await page.goto("/#/import/profiles/new");
  await expect(
    main(page).getByRole("switch", { name: "First row contains column names" }),
  ).toBeChecked();
  await expect(main(page).getByLabel("Encoding", { exact: true })).toHaveText("UTF-8");
  await expect(main(page).getByRole("button", { name: "One signed column" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("previews the first ten data rows as the import will read them", async ({ page }) => {
  await describeMyBank(page);
  // The header row and ten data rows.
  await expect(previewRows(page)).toHaveCount(11);
  const salary = previewRows(page).filter({ hasText: "Salary August" });
  await expect(salary).toContainText("€2,450.00");
  await expect(salary).toContainText("Employer GmbH");
  // Umlauts read correctly in Windows-1252.
  await expect(previewRows(page).filter({ hasText: "Bäckerei Krüger" }).first()).toContainText(
    "-€4.50",
  );
  await expect(previewRows(page).last()).toContainText("Row 11");
});

test("shows unparsable amounts when a , decimal file is previewed with a . profile", async ({
  page,
}) => {
  await describeMyBank(page, "Point (1,250.00)");
  await expect(previewRows(page).filter({ hasText: "Row 3" })).toContainText(
    messageFor({ code: "amount-unreadable", details: { cell: "-45,20", decimalSeparator: "." } }),
  );
  // Switching back reads the amounts again: the preview refreshes on every change.
  await choose(page, main(page), "Decimal separator", "Comma (1.250,00)");
  await expect(previewRows(page).filter({ hasText: "Row 3" })).toContainText("-€45.20");
});

test("shows a wrong date format as each row's failure reason", async ({ page }) => {
  await describeMyBank(page);
  await choose(page, main(page), "Date format", "DD/MM/YYYY (03/09/2026)");
  await expect(previewRows(page).filter({ hasText: "Row 2" })).toContainText(
    messageFor({ code: "date-unreadable", details: { cell: "01.08.2026", format: "DD/MM/YYYY" } }),
  );
});

test("says when the file is not valid in the chosen encoding", async ({ page }) => {
  await page.goto("/#/import/profiles/new");
  await page.getByLabel("Sample file").setInputFiles(fixture("mybank-2026-08.csv"));
  await expect(preview(page)).toContainText(
    messageFor({ code: "import-decoding-failed", details: { encoding: "UTF-8" } }),
  );
});

test("without a header row, lists columns by position with a sample value, and resets the columns", async ({
  page,
}) => {
  await describeMyBank(page);
  await main(page).getByRole("switch", { name: "First row contains column names" }).click();
  await expect(main(page).getByLabel("Date column", { exact: true })).toHaveText("Choose a column");
  await main(page).getByLabel("Date column", { exact: true }).click();
  await expect(page.getByRole("option", { name: "Column 1 (Date)" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Column 4 (Amount)" })).toBeVisible();
});

test("refuses an empty name under the Name field", async ({ page }) => {
  await describeMyBank(page);
  await main(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(fieldError(page, "Name")).toHaveText(messageFor({ code: "profile-name-empty" }));
});

test("refuses a name another bank CSV format has, ignoring case, under the Name field", async ({
  page,
}) => {
  await saveMyBank(page);
  await describeMyBank(page);
  await main(page).getByLabel("Name", { exact: true }).fill(" mybank");
  await main(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(fieldError(page, "Name")).toHaveText(messageFor({ code: "profile-name-taken" }));
});

test("names the columns still to assign above the Save button", async ({ page }) => {
  await page.goto("/#/import/profiles/new");
  await main(page).getByLabel("Name", { exact: true }).fill("MyBank");
  await main(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(main(page).getByRole("alert")).toHaveText(
    messageFor({
      code: "profile-columns-incomplete",
      details: { roles: ["date", "amount", "description"] },
    }),
  );
});

test("a saved bank CSV format can be edited", async ({ page }) => {
  await saveMyBank(page);
  const [saved] = await storedRecords<MappingProfile>(page, "profiles");
  expect(saved).toMatchObject({
    name: "MyBank",
    hasHeaderRow: true,
    dateColumn: "Date",
    counterpartyColumn: "Payee",
    amount: { mode: "signed", column: "Amount", invertSign: false },
    decimalSeparator: ",",
    encoding: "Windows-1252",
  });

  await page.goto(`/#/import/profiles/${saved!.id}`);
  await expect(main(page).getByRole("heading", { name: "Edit bank CSV format" })).toBeVisible();
  await expect(main(page).getByLabel("Name", { exact: true })).toHaveValue("MyBank");
  await expect(main(page).getByLabel("Date column", { exact: true })).toHaveText("Date");
  await main(page).getByLabel("Name", { exact: true }).fill("MyBank Giro");
  await main(page).getByRole("switch", { name: "Invert the sign" }).click();
  await main(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/#\/import$/);

  expect(await storedRecords<MappingProfile>(page, "profiles")).toEqual([
    {
      ...saved,
      name: "MyBank Giro",
      amount: { mode: "signed", column: "Amount", invertSign: true },
    },
  ]);
});

test("says so for a bank CSV format that does not exist", async ({ page }) => {
  await page.goto("/#/import/profiles/missing");
  await expect(main(page)).toContainText("This bank CSV format does not exist");
});

test("says under the heading what a bank CSV format is for (FR-137)", async ({ page }) => {
  await page.goto("/#/import/profiles/new");
  await expect(screenIntro(page)).toHaveText(
    "Tells the app how this bank's files are laid out. Set up once, it serves every later file " +
      "of the bank.",
  );
});

test("a new format for an import starts with the settings proposed from the file (FR-133)", async ({
  page,
}) => {
  await openEditorFor(page, "mybank-2026-10.csv");
  await expect(main(page)).toContainText(proposal().line);
  await expectEditorSettings(page, {
    hasHeaderRow: true,
    encoding: "UTF-8",
    dateFormat: "DD.MM.YYYY (03.09.2026)",
    decimalSeparator: "Comma (1.250,00)",
    amountMode: "One signed column",
    columns: {
      "Date column": "Date",
      "Amount column": "Amount",
      "Description column": "Purpose",
      "Counterparty column": "Payee",
    },
  });
  await expect(main(page).getByRole("switch", { name: "Invert the sign" })).not.toBeChecked();
  const { rows, unreadable } = previewDataRows(page);
  await expect(rows).toHaveCount(8);
  await expect(unreadable).toHaveCount(0);
  await expect(rows.filter({ hasText: "Bäckerei Krüger" }).first()).toContainText("-€");
  // No sign hint for a file with purchases among its rows.
  await expect(main(page)).not.toContainText(proposal().signHint);
});

test("changing a proposed setting changes the preview", async ({ page }) => {
  await openEditorFor(page, "mybank-2026-10.csv");
  const { unreadable } = previewDataRows(page);
  await expect(unreadable).toHaveCount(0);
  await choose(page, main(page), "Decimal separator", "Point (1,250.00)");
  await expect(unreadable).not.toHaveCount(0);
});

test("a new format without a file proposes nothing and starts as before", async ({ page }) => {
  await page.goto("/#/import/profiles/new");
  await page.getByLabel("Sample file").setInputFiles(fixture("mybank-2026-10.csv"));
  // The file is read: with no column assigned yet, the preview names the columns to choose.
  await expect(preview(page)).toContainText(
    messageFor({
      code: "profile-columns-incomplete",
      details: { roles: ["date", "amount", "description"] },
    }),
  );
  await expect(main(page)).not.toContainText(proposal().line);
  await expectEditorSettings(page, {
    hasHeaderRow: true,
    encoding: "UTF-8",
    dateFormat: "DD.MM.YYYY (03.09.2026)",
    decimalSeparator: "Comma (1.250,00)",
    amountMode: "One signed column",
    columns: { "Date column": "Choose a column", "Amount column": "Choose a column" },
  });
});

test("Edit with a sample file changes none of the format's settings (FR-133)", async ({ page }) => {
  await saveMyBankProfile(page);
  const [saved] = await storedRecords<MappingProfile>(page, "profiles");
  await page.goto(`/#/import/profiles/${saved!.id}`);
  // A file of the same bank in UTF-8, which a proposal would turn the encoding to.
  await page.getByLabel("Sample file").setInputFiles(fixture("mybank-2026-10.csv"));
  await expect(preview(page)).toContainText("Row 2");
  await expect(main(page)).not.toContainText(proposal().line);
  await expectEditorSettings(page, {
    hasHeaderRow: true,
    encoding: "Windows-1252",
    dateFormat: "DD.MM.YYYY (03.09.2026)",
    decimalSeparator: "Comma (1.250,00)",
    amountMode: "One signed column",
    columns: { "Date column": "Date", "Amount column": "Amount" },
  });
});

test("says that Invert the sign makes every income an expense, while every row is an income (FR-134)", async ({
  page,
}) => {
  await openEditorFor(page, "cash-notebook.csv");
  const invert = main(page).getByRole("switch", { name: "Invert the sign" });
  await expect(invert).not.toBeChecked();
  const { rows } = previewDataRows(page);
  await expect(rows).toHaveCount(7);
  await expect(rows.filter({ hasText: "-€" })).toHaveCount(0);
  await expect(main(page)).toContainText(proposal().signHint);

  await invert.click();
  await expect(main(page)).not.toContainText(proposal().signHint);
  await expect(rows.filter({ hasText: "-€" })).toHaveCount(7);
});
