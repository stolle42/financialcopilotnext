import { writeFileSync } from "node:fs";
import type { Locator, Page, TestInfo } from "@playwright/test";
import type { Category, ParsedRow, PendingBatch } from "../src/domain/types";
import { messageFor } from "../src/ui/messages";
import { expectCategory, openTransactionForm, storedRecords } from "./support/app";
import { saveMyBankProfile } from "./support/import";
import { expect, setToday, test } from "./support/test";

// User Story 16 (FR-149), on the scenarios of quickstart.md (US16): a category created from a
// picker, in review and in the transaction form. The marks and `keptInReview` of a pending row are
// v1.8 fields the types do not carry yet, so the rows are read as they are stored.

const footer = (page: Page) => page.getByRole("region", { name: "Finish review" });
const assignment = (scope: Page | Locator, name: string) =>
  scope.getByRole("group", { name: `Assignment of ${name}`, exact: true });
const picker = (scope: Page | Locator, name: string) =>
  assignment(scope, name).getByRole("combobox", { name: "Category", exact: true });
const newCategoryItem = (page: Page) => page.getByRole("option", { name: "New category…" });
const newCategoryDialog = (page: Page) => page.getByRole("dialog", { name: "New category" });

const SHOP = "Shop, expenses";

/** The Shop group of three (rows 2–4) and one plain row (row 5), in the MyBank layout. */
function writeFile(testInfo: TestInfo): string {
  const lines = [
    "Date;Payee;Purpose;Amount",
    "01.08.2026;Shop;Purchase;-10,00",
    "02.08.2026;Shop;Purchase;-11,00",
    "03.08.2026;Shop;Purchase;-12,00",
    "04.08.2026;Kiosk;Newspaper;-3,00",
  ];
  const path = testInfo.outputPath("shop.csv");
  writeFileSync(path, lines.join("\r\n") + "\r\n", "latin1");
  return path;
}

async function openReview(page: Page, testInfo: TestInfo) {
  await saveMyBankProfile(page);
  await page.goto("/#/import");
  const form = page.getByRole("region", { name: "Import a file" });
  await form.getByLabel("Account", { exact: true }).click();
  await page.getByRole("option", { name: "Cash", exact: true }).click();
  await form.getByLabel("Bank file").setInputFiles(writeFile(testInfo));
  await form.getByLabel("Bank CSV format", { exact: true }).click();
  await page.getByRole("option", { name: "MyBank", exact: true }).click();
  await form.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/#\/import\/review$/);
}

const storedCategory = async (page: Page, side: "expense" | "income", name: string) =>
  (await storedRecords<Category>(page, "categories")).find(
    (c) => c.side === side && c.name === name,
  );

async function storedRow(page: Page, rowNumber: number): Promise<ParsedRow> {
  const [batch] = await storedRecords<PendingBatch>(page, "pendingBatch");
  return batch!.rows.find((row) => row.rowNumber === rowNumber) as ParsedRow;
}

/** Creates "Pets" from the picker of the Shop group. */
async function createPetsForShop(page: Page) {
  await picker(page, SHOP).click();
  await newCategoryItem(page).click();
  const dialog = newCategoryDialog(page);
  await dialog.getByLabel("Name").fill("Pets");
  await dialog.getByRole("button", { name: "Create category" }).click();
  await expect(dialog).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await setToday(page, "2026-09-20");
});

test("New category… on a group creates Pets for every row of the group, without marks (scenario 1)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);

  await createPetsForShop(page);

  await expectCategory(assignment(page, SHOP), "Pets");
  const pets = (await storedCategory(page, "expense", "Pets"))!;
  expect(pets).toBeTruthy();
  for (const rowNumber of [2, 3, 4]) {
    const row = await storedRow(page, rowNumber);
    expect(row.assignment).toStrictEqual({ type: "category", categoryId: pets.id });
    expect(row).toMatchObject({ keptInReview: true });
  }
  // The other row keeps what it held.
  await expectCategory(assignment(page, "row 5"), "Uncategorised");

  await page.goto("/#/categories");
  await expect(page.getByRole("main").getByText("Pets", { exact: true })).toBeVisible();
});

test("a taken name typed as pets is refused in the dialog, under its field (scenario 2)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  await createPetsForShop(page);

  const field = picker(page, "row 5");
  await field.click();
  await field.fill("pets");
  // "Pets" matches, so New category… is not the only item; the user goes on to it and keeps "pets".
  await newCategoryItem(page).click();
  const dialog = newCategoryDialog(page);
  await dialog.getByLabel("Name").fill("pets");
  await dialog.getByRole("button", { name: "Create category" }).click();

  await expect(dialog.getByRole("alert")).toHaveText(
    messageFor({ code: "category-name-taken", details: { side: "expense" } }),
  );
  await expect(dialog).toBeVisible();
  const pets = (await storedRecords<Category>(page, "categories")).filter(
    (c) => c.name.toLowerCase() === "pets",
  );
  expect(pets).toHaveLength(1);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expectCategory(assignment(page, "row 5"), "Uncategorised");
});

test("with nothing matching, Enter opens the dialog named by the typed text (scenario 2)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);

  const field = picker(page, "row 5");
  await field.click();
  await field.fill("pets");
  await field.press("Enter");

  await expect(newCategoryDialog(page).getByLabel("Name")).toHaveValue("pets");
});

test("in the transaction form with kind Income, New category… creates the income category Refunds (scenario 3)", async ({
  page,
}) => {
  await page.goto("/");
  const form = await openTransactionForm(page);
  await form.getByRole("button", { name: "Income" }).click();
  await form.getByLabel("Amount").fill("25.00");

  await form.getByRole("combobox", { name: "Category", exact: true }).click();
  await newCategoryItem(page).click();
  const dialog = newCategoryDialog(page);
  await dialog.getByLabel("Name").fill("Refunds");
  await dialog.getByRole("button", { name: "Create category" }).click();
  await expect(dialog).toHaveCount(0);

  await expectCategory(form, "Refunds");
  expect(await storedCategory(page, "income", "Refunds")).toBeTruthy();
  expect(await storedCategory(page, "expense", "Refunds")).toBeUndefined();
});

test("Cancel keeps the field as it was (scenario 4)", async ({ page }, testInfo) => {
  await openReview(page, testInfo);
  await picker(page, SHOP).click();
  await newCategoryItem(page).click();
  const dialog = newCategoryDialog(page);
  await dialog.getByLabel("Name").fill("Pets");

  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect(dialog).toHaveCount(0);
  await expectCategory(assignment(page, SHOP), "Uncategorised");
  expect(await storedCategory(page, "expense", "Pets")).toBeUndefined();
});

test("the category stays on Categories after the batch is discarded (scenario 5)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  await createPetsForShop(page);
  await expectCategory(assignment(page, SHOP), "Pets");

  await footer(page).getByRole("button", { name: "Discard" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard import" }).click();

  await page.goto("/#/categories");
  await expect(page.getByRole("main").getByText("Pets", { exact: true })).toBeVisible();
  expect(await storedCategory(page, "expense", "Pets")).toBeTruthy();
});
