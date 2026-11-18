import { writeFileSync } from "node:fs";
import type { Locator, Page, TestInfo } from "@playwright/test";
import type { Category, ParsedRow, PendingBatch } from "../src/domain/types";
import { addAccount, expectCategory, storedRecords } from "./support/app";
import { saveMyBankProfile } from "./support/import";
import { expect, setToday, test } from "./support/test";

// User Story 14 (FR-148, FR-150, FR-151, FR-155), on the scenarios of quickstart.md (US14): a file
// giving 40 items, driven with `page.keyboard` only from the moment review opens. A few checks
// click once, where the story is about the mouse or where no key reaches (the Transfer switch,
// Show rows), and say so.

const header = (page: Page) => page.getByRole("region", { name: "Batch" });
const reviewList = (page: Page) => page.getByRole("region", { name: "Rows to review" });
const footer = (page: Page) => page.getByRole("region", { name: "Finish review" });
const assignment = (scope: Page | Locator, name: string) =>
  scope.getByRole("group", { name: `Assignment of ${name}`, exact: true });
const picker = (scope: Page | Locator, name: string) =>
  assignment(scope, name).getByRole("combobox", { name: "Category", exact: true });
const current = (page: Page) => reviewList(page).locator('[aria-current="true"]');
const seenIcons = (scope: Page | Locator) => scope.getByRole("img", { name: "Seen" });
/** The plain row of row number `n`. */
const rowItem = (page: Page, n: number) =>
  reviewList(page)
    .getByRole("listitem")
    .filter({ has: assignment(page, `row ${n}`) });

/** The group of the three Shop rows (rows 2–4); the 39 Vendor rows 5–43 are plain rows. */
const SHOP = "Shop, expenses";
const ITEMS = 40;

/** A file of 40 items in the MyBank layout: one group of three and 39 plain rows by date. */
function writeFortyItems(testInfo: TestInfo): string {
  const date = (day: number) => {
    const d = new Date(Date.UTC(2026, 6, day));
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  };
  const lines = ["Date;Payee;Purpose;Amount"];
  for (let n = 0; n < 3; n++) lines.push(`${date(1)};Shop;Purchase;-${10 + n},00`);
  for (let n = 1; n <= ITEMS - 1; n++) {
    lines.push(`${date(1 + n)};Vendor ${String(n).padStart(2, "0")};Purchase;-${50 + n},00`);
  }
  const path = testInfo.outputPath("forty-items.csv");
  writeFileSync(path, lines.join("\r\n") + "\r\n", "latin1");
  return path;
}

/** Imports the file at `path` with the saved MyBank format and waits for review. */
async function importFrom(page: Page, path: string) {
  await page.goto("/#/import");
  const form = page.getByRole("region", { name: "Import a file" });
  await form.getByLabel("Account", { exact: true }).click();
  await page.getByRole("option", { name: "Cash", exact: true }).click();
  await form.getByLabel("Bank file").setInputFiles(path);
  await form.getByLabel("Bank CSV format", { exact: true }).click();
  await page.getByRole("option", { name: "MyBank", exact: true }).click();
  await form.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/#\/import\/review$/);
}

async function openReview(page: Page, testInfo: TestInfo) {
  await saveMyBankProfile(page);
  await importFrom(page, writeFortyItems(testInfo));
  await expect(header(page)).toContainText(`${ITEMS} not seen yet`);
}

async function storedRow(page: Page, rowNumber: number): Promise<ParsedRow> {
  const [batch] = await storedRecords<PendingBatch>(page, "pendingBatch");
  return batch!.rows.find((row) => row.rowNumber === rowNumber) as ParsedRow;
}

async function tab(page: Page, times: number) {
  for (let n = 0; n < times; n++) await page.keyboard.press("Tab");
}

test.beforeEach(async ({ page }) => {
  await setToday(page, "2026-09-20");
});

test("the first item is current with its picker in focus, and typing then Tab picks and moves on (scenarios 1, 2)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);

  await expect(current(page)).toHaveCount(1);
  await expect(current(page)).toContainText("Shop");
  await expect(picker(page, SHOP)).toBeFocused();

  await page.keyboard.type("gro");
  await page.keyboard.press("Tab");

  await expectCategory(assignment(page, SHOP), "Groceries");
  const groceries = (await storedRecords<Category>(page, "categories")).find(
    (c) => c.side === "expense" && c.name === "Groceries",
  )!;
  for (const rowNumber of [2, 3, 4]) {
    expect((await storedRow(page, rowNumber)).assignment).toMatchObject({
      type: "category",
      categoryId: groceries.id,
    });
  }
  await expect(current(page)).toHaveCount(1);
  await expect(current(page)).toContainText("Vendor 01");
  await expect(picker(page, "row 5")).toBeFocused();
  await expect(header(page)).toContainText(`${ITEMS - 1} not seen yet`);
});

test("Tab with nothing typed, or with text matching nothing, keeps the category (scenario 3)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  await page.keyboard.press("Tab"); // the Shop group, left as it is
  await expect(picker(page, "row 5")).toBeFocused();

  await page.keyboard.press("Tab");
  await expectCategory(assignment(page, "row 5"), "Uncategorised");
  await expect(picker(page, "row 6")).toBeFocused();

  await page.keyboard.type("zzz");
  await page.keyboard.press("Tab");
  await expectCategory(assignment(page, "row 6"), "Uncategorised");
  await expect(picker(page, "row 7")).toBeFocused();
  await expect(current(page)).toContainText("Vendor 03");
  for (const rowNumber of [5, 6]) {
    const { assignment: held } = await storedRow(page, rowNumber);
    expect(held).toMatchObject({ type: "category" });
    expect(held).not.toHaveProperty("suggested");
    expect(held).not.toHaveProperty("usual");
  }
});

test("Shift+Tab goes back one item (scenario 4)", async ({ page }, testInfo) => {
  await openReview(page, testInfo);
  await tab(page, 3); // the group, Vendor 01 and Vendor 02 are left
  await expect(picker(page, "row 7")).toBeFocused();

  await page.keyboard.press("Shift+Tab");

  await expect(picker(page, "row 6")).toBeFocused();
  await expect(current(page)).toHaveCount(1);
  await expect(current(page)).toContainText("Vendor 02");
});

test("on a row holding a transfer, the Transfer switch takes the picker's place (scenario 5)", async ({
  page,
}, testInfo) => {
  // A transfer needs another account to move money to (FR-011).
  await addAccount(page, "Savings");
  await openReview(page, testInfo);
  await tab(page, 2); // Vendor 01 is left, Vendor 02, row 6, is current
  // The switch is reached with the mouse, since Tab would leave the item; one click turns it on.
  await assignment(page, "row 6").getByRole("switch", { name: "Transfer" }).click();
  await expect(picker(page, "row 6")).toHaveCount(0);

  await page.keyboard.press("Tab");
  await expect(picker(page, "row 7")).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(assignment(page, "row 6").getByRole("switch", { name: "Transfer" })).toBeFocused();
  await expect(current(page)).toContainText("Vendor 02");
});

test("each item left shows the check icon, the current one does not (scenario 6)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  await expect(seenIcons(reviewList(page))).toHaveCount(0);

  await tab(page, 4);

  await expect(seenIcons(reviewList(page))).toHaveCount(4);
  await expect(seenIcons(current(page))).toHaveCount(0);
  await expect(current(page).getByRole("img", { name: "Current item" })).toHaveCount(1);
  await expect(seenIcons(rowItem(page, 5))).toHaveCount(1);
  await expect(seenIcons(rowItem(page, 7))).toHaveCount(1);
  await expect(seenIcons(rowItem(page, 8))).toHaveCount(0);
  await expect(header(page)).toContainText(`${ITEMS - 4} not seen yet`);
});

test("the seen items survive a reload, and review goes on with the 13th (scenario 7)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  await tab(page, 12);
  await expect(header(page)).toContainText("28 not seen yet");

  await page.reload();

  await expect(header(page)).toContainText("28 not seen yet");
  await expect(seenIcons(reviewList(page))).toHaveCount(12);
  // Item 13 is Vendor 12, row 16; it is current, and its picker takes the keys at once.
  await expect(current(page)).toHaveCount(1);
  await expect(current(page)).toContainText("Vendor 12");
  await expect(picker(page, "row 16")).toBeFocused();
  expect(await storedRow(page, 5)).toMatchObject({ seen: true });
});

test("Tab on the last item focuses Confirm, and every item is seen (scenario 8)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  await tab(page, ITEMS - 1);
  await expect(picker(page, "row 43")).toBeFocused();
  await expect(header(page)).toContainText("1 not seen yet");

  await page.keyboard.press("Tab");

  await expect(footer(page).getByRole("button", { name: /^Confirm / })).toBeFocused();
  await expect(header(page)).toContainText("All seen");
  await expect(seenIcons(rowItem(page, 43))).toHaveCount(1);
  await expect(seenIcons(reviewList(page))).toHaveCount(ITEMS);
  // The focus is outside the items, so none is current and the last one shows the check icon.
  await expect(current(page)).toHaveCount(0);
});

test("a group passed while folded shows its rows not seen when unfolded (scenario 9)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  await page.keyboard.press("Tab");
  await expect(
    seenIcons(reviewList(page).getByRole("group", { name: SHOP, exact: true })),
  ).toHaveCount(1);

  // Show rows has no key of its own in Tab's order, so this one click is the mouse's.
  const shop = reviewList(page).getByRole("group", { name: SHOP, exact: true });
  await shop.getByRole("button", { name: "Show rows" }).click();

  await expect(shop.getByRole("listitem")).toHaveCount(3);
  await expect(seenIcons(shop.getByRole("listitem"))).toHaveCount(0);
  // Unfolding makes the group current (FR-150), and the rows follow it.
  await expect(current(page)).toHaveCount(1);
  await expect(shop).toHaveAttribute("aria-current", "true");
  // The click on Show rows left Vendor 01, whose picker had the focus, so it is seen as well.
  await expect(header(page)).toContainText(`${ITEMS - 2} not seen yet`);
});

test("clicking a row makes it current, and the item left counts as seen (FR-150, FR-151)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  await expect(current(page)).toContainText("Shop");

  await rowItem(page, 20).click();

  await expect(current(page)).toHaveCount(1);
  await expect(current(page)).toContainText("Vendor 16");
  await expect(
    seenIcons(reviewList(page).getByRole("group", { name: SHOP, exact: true })),
  ).toHaveCount(1);
  await expect(header(page)).toContainText(`${ITEMS - 1} not seen yet`);
});
