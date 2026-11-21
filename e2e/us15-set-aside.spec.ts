import { writeFileSync } from "node:fs";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { messageFor } from "../src/ui/messages";
import type { Account, ParsedRow, PendingBatch, Settings, Transaction } from "../src/domain/types";
import { addAccount, expectCategory, storedRecord, storedRecords } from "./support/app";
import { saveMyBankProfile } from "./support/import";
import { euros, expect, setToday, test } from "./support/test";

// User Story 15 (FR-152, FR-153, FR-154, FR-157, FR-159, FR-161) and SC-034, on the scenarios of
// quickstart.md (US15): a file with 30 rows under 1.00 among others. `setAsideUnderCents` and
// `keptInReview` are v1.8 fields the types do not carry yet, so they are read as they are stored
// (data-model.md, Settings and the pending row).

const header = (page: Page) => page.getByRole("region", { name: "Batch" });
const reviewList = (page: Page) => page.getByRole("region", { name: "Rows to review" });
const footer = (page: Page) => page.getByRole("region", { name: "Finish review" });
const plainRows = (page: Page) =>
  reviewList(page).getByRole("list", { name: "Plain rows" }).getByRole("listitem");
const assignment = (scope: Page | Locator, name: string) =>
  scope.getByRole("group", { name: `Assignment of ${name}`, exact: true });
/** The field "Skip rows under" (FR-152). */
const amountField = (page: Page) => page.getByLabel("Skip rows under", { exact: true });
const skipSection = (page: Page) => page.getByRole("region", { name: "Skip small rows" });
/** A button of the section: Under 1, Under 5, Under 10 or Skip none (FR-161). */
const preset = (page: Page, name: string) =>
  skipSection(page).getByRole("button", { name, exact: true });
/** The live line under the field (FR-161), with the number of rows, of all `of`, and what they come to. */
const line = (page: Page, count: number, of: number, comes: string, under = "€1.00") =>
  skipSection(page).getByText(
    count === 1
      ? `1 of ${of} rows is under ${under}. It comes to ${comes}, and it is imported as Uncategorised.`
      : `${count} of ${of} rows are under ${under}. Together they come to ${comes}, and they are imported as Uncategorised.`,
    { exact: true },
  );
const noLine = (page: Page) => skipSection(page).getByText("No rows are skipped.", { exact: true });
/** The header's status: the button that opens the drawer, or "None skipped" (FR-153). */
const skippedButton = (page: Page, count: number) =>
  header(page).getByRole("button", { name: `${count} skipped`, exact: true });
const noneSkipped = (page: Page) => header(page).getByText("None skipped", { exact: true });
const drawer = (page: Page) => page.getByRole("dialog", { name: "Skipped rows" });

/** The expenses and incomes under 1.00, and the rows that stay under review. */
const SMALL_EXPENSES = 20;
const SMALL_INCOMES = 10;
const SMALL = SMALL_EXPENSES + SMALL_INCOMES;
/** Row numbers, which are CSV line numbers: the header is line 1. */
const FIRST_SMALL = 7;
/** All the rows of the August file, and what the 30 small ones come to without sign: 20 expenses of 0.50 – 0.69, 10 incomes of 0.10 – 0.19. */
const ALL = 35;
const SMALL_TOTAL = "€13.35";

const comma = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

interface Line {
  date: string;
  payee: string;
  purpose: string;
  cents: number;
}

/** The lines of the August file: a Shop group of three, two rows over 1.00, and 30 under 1.00. */
function augustLines(): Line[] {
  const lines: Line[] = [
    { date: "01.08.2026", payee: "Shop", purpose: "Purchase", cents: -1000 },
    { date: "01.08.2026", payee: "Shop", purpose: "Purchase", cents: -1100 },
    { date: "01.08.2026", payee: "Shop", purpose: "Purchase", cents: -1200 },
    { date: "05.08.2026", payee: "Bakery", purpose: "Bread", cents: -2500 },
    // Exactly 1.00 is not under 1.00.
    { date: "06.08.2026", payee: "Kiosk", purpose: "Newspaper", cents: -100 },
  ];
  for (let n = 0; n < SMALL_EXPENSES; n++) {
    lines.push({
      date: `${String(7 + (n % 20)).padStart(2, "0")}.08.2026`,
      payee: `Tiny ${String(n).padStart(2, "0")}`,
      purpose: "Small purchase",
      cents: -(50 + n),
    });
  }
  for (let n = 0; n < SMALL_INCOMES; n++) {
    lines.push({
      date: `${String(10 + n).padStart(2, "0")}.08.2026`,
      payee: `Refund ${String(n).padStart(2, "0")}`,
      purpose: "Small refund",
      cents: 10 + n,
    });
  }
  return lines;
}

const total = (lines: Line[]) => lines.reduce((sum, line) => sum + line.cents, 0);

/** A file of the MyBank layout (`;` and comma decimals) from `lines`, under the test's folder. */
function writeFile(testInfo: TestInfo, name: string, lines: Line[]): string {
  const text = [
    "Date;Payee;Purpose;Amount",
    ...lines.map((l) => `${l.date};${l.payee};${l.purpose};${comma(l.cents)}`),
  ].join("\r\n");
  const path = testInfo.outputPath(name);
  writeFileSync(path, text + "\r\n", "latin1");
  return path;
}

/** Imports the file at `path` into `account` with the saved format and waits for review. */
async function importFrom(page: Page, account: string, path: string) {
  await page.goto("/#/import");
  const form = page.getByRole("region", { name: "Import a file" });
  await form.getByLabel("Account", { exact: true }).click();
  await page.getByRole("option", { name: account, exact: true }).click();
  await form.getByLabel("Bank file").setInputFiles(path);
  await form.getByLabel("Bank CSV format", { exact: true }).click();
  await page.getByRole("option", { name: "MyBank", exact: true }).click();
  await form.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/#\/import\/review$/);
}

/** Confirms the batch through the footer, and returns what the confirmation said. */
async function confirmReview(page: Page): Promise<string> {
  await footer(page)
    .getByRole("button", { name: /^Confirm / })
    .click();
  const dialog = page.getByRole("alertdialog");
  const said = await dialog.innerText();
  await dialog.getByRole("button", { name: /^Add / }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#\/$/);
  return said;
}

async function storedRows(page: Page): Promise<(ParsedRow & { keptInReview?: true })[]> {
  const [batch] = await storedRecords<PendingBatch>(page, "pendingBatch");
  return (batch?.rows ?? []).filter(
    (row): row is ParsedRow => row.status === "parsed",
  ) as (ParsedRow & { keptInReview?: true })[];
}

const storedAmount = async (page: Page) =>
  (await storedRecord<Settings & { setAsideUnderCents?: number }>(page, "settings", "settings"))
    ?.setAsideUnderCents;

async function balanceOf(page: Page, name: string): Promise<Locator> {
  await page.goto("/#/accounts");
  return page.getByRole("row").filter({ has: page.getByRole("cell", { name, exact: true }) });
}

test.beforeEach(async ({ page }) => {
  await setToday(page, "2026-09-20");
});

/** The MyBank format saved, the August file imported into Cash, and review open. */
async function openReview(page: Page, testInfo: TestInfo) {
  await saveMyBankProfile(page);
  await importFrom(page, "Cash", writeFile(testInfo, "mybank-2026-08.csv", augustLines()));
}

test("entering 1.00 takes the 30 rows under 1.00 out of review, and the status and the line say so (scenario 1)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  await expect(amountField(page)).toHaveValue("");
  // The status is there before anything is skipped (FR-153), and the line says none are (FR-161).
  await expect(noneSkipped(page)).toBeVisible();
  await expect(noLine(page)).toBeVisible();
  await expect(skippedButton(page, SMALL)).toHaveCount(0);
  // Nothing is skipped while the field is empty, so the 32 rows outside the group are plain rows.
  await expect(plainRows(page)).toHaveCount(2 + SMALL);

  await amountField(page).fill("1.00");

  await expect(line(page, SMALL, ALL, SMALL_TOTAL)).toBeVisible();
  await expect(skippedButton(page, SMALL)).toBeVisible();
  await expect(noneSkipped(page)).toHaveCount(0);
  // The Shop group, the bakery and the kiosk's 1.00 stay; none of the 30 is a group or a plain row.
  await expect(plainRows(page)).toHaveCount(2);
  await expect(header(page)).toContainText("5 rows to review");
  await expect(reviewList(page)).toContainText("Bakery");
  await expect(reviewList(page)).toContainText("Kiosk");
  await expect(reviewList(page)).not.toContainText("Tiny 00");
  await expect(reviewList(page)).not.toContainText("Refund 00");
  await expect(
    reviewList(page).getByRole("group", { name: "Shop, expenses", exact: true }),
  ).toBeVisible();

  // The amount is saved in the settings, for every later review, and no row holds a mark for it.
  await expect.poll(() => storedAmount(page)).toBe(100);
  expect((await storedRows(page)).filter((row) => row.keptInReview)).toEqual([]);

  // The amount and what it skipped survive a reload.
  await page.reload();
  await expect(amountField(page)).toHaveValue("1.00");
  await expect(skippedButton(page, SMALL)).toBeVisible();
});

test("explains beside the field that rows under the amount are not reviewed but still imported (FR-154)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  await expect(
    skipSection(page).getByText(
      "Rows under this amount are not reviewed. They are still imported, as Uncategorised, so your balances stay right.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("Under 1, Under 5 and Under 10 set their amount and show pressed; Skip none clears it and shows every row (FR-161, scenario 8)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  const names = ["Under 1", "Under 5", "Under 10", "Skip none"];
  const pressed = async (expected: string) => {
    for (const name of names) {
      await expect(preset(page, name)).toHaveAttribute(
        "aria-pressed",
        name === expected ? "true" : "false",
      );
    }
  };
  // No amount: only Skip none is pressed.
  await pressed("Skip none");

  await preset(page, "Under 1").click();
  await expect(amountField(page)).toHaveValue("1.00");
  await pressed("Under 1");
  await expect(skippedButton(page, SMALL)).toBeVisible();
  await expect(line(page, SMALL, ALL, SMALL_TOTAL)).toBeVisible();
  await expect.poll(() => storedAmount(page)).toBe(100);

  // 5.00 also skips the kiosk's 1.00; the Shop group's 10.00 and up stay.
  await preset(page, "Under 5").click();
  await expect(amountField(page)).toHaveValue("5.00");
  await pressed("Under 5");
  await expect(skippedButton(page, SMALL + 1)).toBeVisible();
  await expect.poll(() => storedAmount(page)).toBe(500);

  await preset(page, "Under 10").click();
  await expect(amountField(page)).toHaveValue("10.00");
  await pressed("Under 10");
  await expect(skippedButton(page, SMALL + 1)).toBeVisible();
  await expect.poll(() => storedAmount(page)).toBe(1000);

  // An amount typed in the field that no button stands for leaves them all unpressed.
  await amountField(page).fill("2.50");
  for (const name of names) await expect(preset(page, name)).toHaveAttribute("aria-pressed", "false");
  await expect(skippedButton(page, SMALL + 1)).toBeVisible();

  // Skip none: no amount, every row under review, nothing dropped.
  await preset(page, "Skip none").click();
  await expect(amountField(page)).toHaveValue("");
  await pressed("Skip none");
  await expect(noneSkipped(page)).toBeVisible();
  await expect(noLine(page)).toBeVisible();
  await expect(plainRows(page)).toHaveCount(2 + SMALL);
  await expect.poll(() => storedAmount(page)).toBeUndefined();
});

test("with an amount and no row under it, the line says so, and the header says none are skipped (FR-153, FR-161)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  await amountField(page).fill("0.10");
  await expect(skipSection(page).getByText("No rows are under €0.10.", { exact: true })).toBeVisible();
  await expect(noneSkipped(page)).toBeVisible();
  await expect(plainRows(page)).toHaveCount(2 + SMALL);
});

test("a single skipped row is said in the singular (FR-161)", async ({ page }, testInfo) => {
  await openReview(page, testInfo);
  await amountField(page).fill("0.11");
  // Only the income of 0.10 is under 0.11.
  await expect(line(page, 1, ALL, "€0.10", "€0.11")).toBeVisible();
  await expect(skippedButton(page, 1)).toBeVisible();
});

test("a row given a category before the amount is entered stays under review (scenario 2)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  const tiny = plainRows(page).filter({ hasText: "Tiny 03" });
  await expect(tiny).toHaveCount(1);
  await tiny.getByRole("combobox", { name: "Category", exact: true }).click();
  await page.getByRole("option", { name: "Groceries", exact: true }).click();
  await expectCategory(assignment(page, `row ${FIRST_SMALL + 3}`), "Groceries");

  await amountField(page).fill("1.00");

  await expect(skippedButton(page, SMALL - 1)).toBeVisible();
  await expect(plainRows(page)).toHaveCount(3);
  await expect(plainRows(page).filter({ hasText: "Tiny 03" })).toHaveCount(1);
  await expectCategory(assignment(page, `row ${FIRST_SMALL + 3}`), "Groceries");
  expect((await storedRows(page)).find((r) => r.rowNumber === FIRST_SMALL + 3)).toMatchObject({
    keptInReview: true,
  });
});

test("abc and 0 show the message of set-aside-amount-invalid, and skip nothing (scenario 3)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  const message = messageFor({ code: "set-aside-amount-invalid" });

  for (const text of ["abc", "0", "-1", "1.005"]) {
    await amountField(page).fill(text);
    await expect(
      page
        .locator('[data-slot="field"]')
        .filter({ has: amountField(page) })
        .getByRole("alert"),
    ).toContainText(message);
    await expect(noneSkipped(page)).toBeVisible();
    await expect(plainRows(page)).toHaveCount(2 + SMALL);
    await expect.poll(() => storedAmount(page)).toBeUndefined();
  }

  // A valid amount takes the message away, and clearing the field skips nothing again.
  await amountField(page).fill("1.00");
  await expect(skippedButton(page, SMALL)).toBeVisible();
  await expect(page.getByText(message)).toHaveCount(0);
  await amountField(page).fill("");
  await expect(noneSkipped(page)).toBeVisible();
  await expect(plainRows(page)).toHaveCount(2 + SMALL);
  await expect.poll(() => storedAmount(page)).toBeUndefined();
});

test("the drawer lists the rows by date, and one chosen for review is under review with what it held (scenario 4)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  await amountField(page).fill("1.00");
  await expect(skippedButton(page, SMALL)).toBeVisible();

  await skippedButton(page, SMALL).click();

  const rows = drawer(page).getByRole("listitem");
  await expect(rows).toHaveCount(SMALL);
  // By date, each with its date, description, vendor and amount: the first is the one of 07.08.
  await expect(rows.first()).toContainText("Small purchase");
  await expect(rows.first()).toContainText("Tiny 00");
  await expect(rows.first()).toContainText("-€0.50");
  await expect(rows.nth(1)).toContainText("Tiny 01");
  await expect(rows.last()).toContainText("Tiny 19");
  await expect(rows.first().getByRole("button", { name: "Review this row" })).toBeVisible();

  await rows
    .filter({ hasText: "Tiny 05" })
    .getByRole("button", { name: "Review this row", exact: true })
    .click();

  await expect(rows).toHaveCount(SMALL - 1);
  await expect(drawer(page).getByText("Tiny 05")).toHaveCount(0);
  await drawer(page).press("Escape");
  await expect(skippedButton(page, SMALL - 1)).toBeVisible();
  await expect(plainRows(page).filter({ hasText: "Tiny 05" })).toHaveCount(1);
  await expectCategory(assignment(page, `row ${FIRST_SMALL + 5}`), "Uncategorised");
  expect((await storedRows(page)).find((r) => r.rowNumber === FIRST_SMALL + 5)).toMatchObject({
    keptInReview: true,
  });
});

test("confirming says how many rows enter in Uncategorised because they were skipped, and the balances equal a file with nothing skipped (scenarios 5, 6; SC-034)", async ({
  page,
}, testInfo) => {
  const lines = augustLines();
  await saveMyBankProfile(page);
  await addAccount(page, "Checking");
  const file = writeFile(testInfo, "mybank-2026-08.csv", lines);

  // Checking gets the same file with nothing skipped, Cash with 1.00 set and one row chosen for review.
  await importFrom(page, "Checking", file);
  const withNothing = await confirmReview(page);
  expect(withNothing).not.toMatch(/because they were skipped/);

  await importFrom(page, "Cash", file);
  await preset(page, "Under 1").click();
  await skippedButton(page, SMALL).click();
  await drawer(page)
    .getByRole("listitem")
    .filter({ hasText: "Tiny 05" })
    .getByRole("button", { name: "Review this row", exact: true })
    .click();
  await drawer(page).press("Escape");

  const said = await confirmReview(page);
  expect(said).toMatch(new RegExp(`${lines.length} (rows|transactions)`));
  expect(said).toMatch(
    new RegExp(`${SMALL - 1} of them in .?Uncategorised.? because they were skipped`),
  );

  // The 29 skipped are expenses and incomes in their side's Uncategorised; the one chosen for
  // review is too, since the user gave it nothing. No row is dropped.
  const categories = await storedRecords<{ id: string; side: string; role: string | null }>(
    page,
    "categories",
  );
  const uncategorised = new Set(
    categories.filter((c) => c.role === "uncategorised").map((c) => c.id),
  );
  const cash = (await storedRecords<Account>(page, "accounts")).find((a) => a.name === "Cash")!;
  const booked = (await storedRecords<Transaction>(page, "transactions")).filter(
    (t) => t.accountId === cash.id,
  );
  expect(booked).toHaveLength(lines.length);
  const small = booked.filter((t) => t.kind !== "transfer" && Math.abs(t.amountCents) < 100);
  expect(small).toHaveLength(SMALL);
  expect(small.every((t) => t.kind !== "transfer" && uncategorised.has(t.categoryId))).toBe(true);
  expect(small.filter((t) => t.kind === "income")).toHaveLength(SMALL_INCOMES);

  // Every balance equals the one the same file gives with nothing skipped (SC-034).
  const expected = euros(total(lines));
  await expect(await balanceOf(page, "Cash")).toContainText(expected);
  await expect(await balanceOf(page, "Checking")).toContainText(expected);
});

test("the next import skips rows under 1.00 from the start (scenario 7)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  await amountField(page).fill("1.00");
  await expect(skippedButton(page, SMALL)).toBeVisible();
  await confirmReview(page);

  const september: Line[] = [
    { date: "02.09.2026", payee: "Market", purpose: "Fruit", cents: -850 },
    { date: "03.09.2026", payee: "Gift shop", purpose: "Card", cents: -30 },
    { date: "04.09.2026", payee: "Bank", purpose: "Interest", cents: 40 },
  ];
  await importFrom(page, "Cash", writeFile(testInfo, "mybank-2026-09.csv", september));

  await expect(amountField(page)).toHaveValue("1.00");
  await expect(line(page, 2, 3, "€0.70")).toBeVisible();
  await expect(plainRows(page)).toHaveCount(1);
  await expect(reviewList(page)).toContainText("Market");
  await expect(reviewList(page)).not.toContainText("Gift shop");
  await expect(skippedButton(page, 2)).toBeVisible();
});
