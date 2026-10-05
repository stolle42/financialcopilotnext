import type { Page } from "@playwright/test";
import type { PendingBatch } from "../../src/domain/types";
import { messageFor } from "../../src/ui/messages";
import { addTransaction, storedRecords } from "../support/app";
import { importWithProfile, saveMyBankProfile } from "../support/import";
import { expect, setToday, test } from "../support/test";

// contracts/ui.md, review; User Story 2 scenarios 4–11 and 16; FR-022, FR-025, FR-028.

const header = (page: Page) => page.getByRole("region", { name: "Batch" });
const reviewList = (page: Page) => page.getByRole("region", { name: "Rows to review" });

test.beforeEach(async ({ page }) => {
  await setToday(page, "2026-09-20");
});

async function importAugust(page: Page) {
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
}

test("with no batch pending, says so and leads to Import", async ({ page }) => {
  await page.goto("/#/import/review");
  const main = page.getByRole("main");
  await expect(main).toContainText("No import is waiting for review");
  await main.getByRole("button", { name: "Go to Import" }).click();
  await expect(page).toHaveURL(/#\/import$/);
});

test("the header shows the account, the file and the three counts", async ({ page }) => {
  await importAugust(page);
  await expect(header(page)).toContainText("Cash");
  await expect(header(page)).toContainText("mybank-2026-08.csv");
  await expect(header(page)).toContainText("13 rows to review");
  await expect(header(page).getByRole("button", { name: "1 duplicate" })).toBeVisible();
  await expect(header(page).getByRole("button", { name: "2 unparsable" })).toBeVisible();
});

test("keeps matches of the ledger out of review, lists them, and includes any single one (scenario 8)", async ({
  page,
}) => {
  // The ledger already holds the last week of August, entered by hand with other descriptions.
  await page.goto("/");
  await addTransaction(page, {
    amount: "9.99",
    date: "2026-08-27",
    description: "Streaming, by hand",
  });
  await addTransaction(page, { amount: "8.90", date: "2026-08-28", description: "Cake" });
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-09.csv" });

  await expect(header(page)).toContainText("5 rows to review");
  await expect(reviewList(page)).not.toContainText("STREAMING MONTHLY 0827");
  await header(page).getByRole("button", { name: "2 duplicates" }).click();
  const drawer = page.getByRole("dialog", { name: "Duplicates" });
  await expect(drawer).toContainText("STREAMING MONTHLY 0827");
  await expect(drawer).toContainText("Kuchen Kartenzahlung");

  await drawer.getByRole("switch", { name: "Include row 2" }).click();
  await expect(drawer.getByRole("switch", { name: "Include row 2" })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(header(page)).toContainText("6 rows to review");
  await expect(reviewList(page)).toContainText("STREAMING MONTHLY 0827");

  // The choice is saved at once, so it survives a reload (FR-022).
  await page.reload();
  await expect(header(page)).toContainText("6 rows to review");
  const [batch] = await storedRecords<PendingBatch>(page, "pendingBatch");
  expect(batch?.rows.find((row) => row.rowNumber === 2)).toMatchObject({
    duplicate: true,
    included: true,
  });
});

test("lists unparsable rows with their cells and reason, outside review (scenario 11)", async ({
  page,
}) => {
  await importAugust(page);
  await expect(reviewList(page)).not.toContainText("Newspaper");
  await header(page).getByRole("button", { name: "2 unparsable" }).click();
  const drawer = page.getByRole("dialog", { name: "Unparsable rows" });
  const newspaper = drawer.getByRole("listitem").filter({ hasText: "Row 14" });
  await expect(newspaper).toContainText("32.08.2026");
  await expect(newspaper).toContainText("Newspaper");
  await expect(newspaper).toContainText(
    messageFor({ code: "date-unreadable", details: { cell: "32.08.2026", format: "DD.MM.YYYY" } }),
  );
  await expect(drawer.getByRole("listitem").filter({ hasText: "Row 15" })).toContainText(
    messageFor({ code: "amount-missing" }),
  );
  // These rows cannot be included.
  await expect(drawer.getByRole("switch")).toHaveCount(0);
});
