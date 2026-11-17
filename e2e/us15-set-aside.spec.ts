import { writeFileSync } from "node:fs";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { messageFor } from "../src/ui/messages";
import type { Account, ParsedRow, PendingBatch, Settings, Transaction } from "../src/domain/types";
import { addAccount, expectCategory, storedRecord, storedRecords } from "./support/app";
import { saveMyBankProfile } from "./support/import";
import { euros, expect, setToday, test } from "./support/test";

// User Story 15 (FR-152, FR-153, FR-154, FR-157, FR-159) and SC-034, on the scenarios of
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
/** The field "Set aside rows under" (FR-152). */
const amountField = (page: Page) => page.getByLabel("Set aside rows under", { exact: true });
/** The line under the field, which is also the button that opens the drawer (FR-153). */
const line = (page: Page, count: number, under = "€1.00") =>
  page.getByRole("button", {
    name: `${count} ${count === 1 ? "row" : "rows"} under ${under} set aside`,
    exact: true,
  });
const drawer = (page: Page) => page.getByRole("dialog", { name: "Rows set aside" });

/** The expenses and incomes under 1.00, and the rows that stay under review. */
const SMALL_EXPENSES = 20;
const SMALL_INCOMES = 10;
const SMALL = SMALL_EXPENSES + SMALL_INCOMES;
/** Row numbers, which are CSV line numbers: the header is line 1. */
const FIRST_SMALL = 7;

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

test("entering 1.00 takes the 30 rows under 1.00 out of review, and the line says so (scenario 1)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  await expect(amountField(page)).toHaveValue("");
  await expect(header(page)).not.toContainText("set aside");
  await expect(line(page, SMALL)).toHaveCount(0);
  // Nothing is set aside while the field is empty, so the 32 rows outside the group are plain rows.
  await expect(plainRows(page)).toHaveCount(2 + SMALL);

  await amountField(page).fill("1.00");

  await expect(line(page, SMALL)).toBeVisible();
  await expect(line(page, SMALL)).toHaveText(`${SMALL} rows under €1.00 set aside`);
  await expect(header(page).getByRole("button", { name: `${SMALL} set aside` })).toBeVisible();
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

  // The amount and what it set aside survive a reload.
  await page.reload();
  await expect(amountField(page)).toHaveValue("1.00");
  await expect(line(page, SMALL)).toBeVisible();
});

test("explains beside the field that rows under the amount are left out of review (FR-154)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  await expect(
    page.getByText(/rows under this amount are left out of review and saved in Uncategorised/i),
  ).toBeVisible();
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

  await expect(line(page, SMALL - 1)).toBeVisible();
  await expect(plainRows(page)).toHaveCount(3);
  await expect(plainRows(page).filter({ hasText: "Tiny 03" })).toHaveCount(1);
  await expectCategory(assignment(page, `row ${FIRST_SMALL + 3}`), "Groceries");
  expect((await storedRows(page)).find((r) => r.rowNumber === FIRST_SMALL + 3)).toMatchObject({
    keptInReview: true,
  });
});

test("abc and 0 show the message of set-aside-amount-invalid, and set nothing aside (scenario 3)", async ({
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
    await expect(header(page)).not.toContainText("set aside");
    await expect(plainRows(page)).toHaveCount(2 + SMALL);
    await expect.poll(() => storedAmount(page)).toBeUndefined();
  }

  // A valid amount takes the message away, and clearing the field sets nothing aside again.
  await amountField(page).fill("1.00");
  await expect(line(page, SMALL)).toBeVisible();
  await expect(page.getByText(message)).toHaveCount(0);
  await amountField(page).fill("");
  await expect(line(page, SMALL)).toHaveCount(0);
  await expect(plainRows(page)).toHaveCount(2 + SMALL);
  await expect.poll(() => storedAmount(page)).toBeUndefined();
});

test("the drawer lists the rows by date, and one brought back is under review with what it held (scenario 4)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  await amountField(page).fill("1.00");
  await expect(line(page, SMALL)).toBeVisible();

  await line(page, SMALL).click();

  const rows = drawer(page).getByRole("listitem");
  await expect(rows).toHaveCount(SMALL);
  // By date, each with its date, description, vendor and amount: the first is the one of 07.08.
  await expect(rows.first()).toContainText("Small purchase");
  await expect(rows.first()).toContainText("Tiny 00");
  await expect(rows.first()).toContainText("-€0.50");
  await expect(rows.nth(1)).toContainText("Tiny 01");
  await expect(rows.last()).toContainText("Tiny 19");
  await expect(rows.first().getByRole("button", { name: "Bring back" })).toBeVisible();

  await rows
    .filter({ hasText: "Tiny 05" })
    .getByRole("button", { name: "Bring back", exact: true })
    .click();

  await expect(rows).toHaveCount(SMALL - 1);
  await expect(drawer(page).getByText("Tiny 05")).toHaveCount(0);
  await drawer(page).press("Escape");
  await expect(line(page, SMALL - 1)).toBeVisible();
  await expect(plainRows(page).filter({ hasText: "Tiny 05" })).toHaveCount(1);
  await expectCategory(assignment(page, `row ${FIRST_SMALL + 5}`), "Uncategorised");
  expect((await storedRows(page)).find((r) => r.rowNumber === FIRST_SMALL + 5)).toMatchObject({
    keptInReview: true,
  });
});

test("confirming says how many rows enter in Uncategorised because they were set aside, and the balances equal a file with nothing set aside (scenarios 5, 6; SC-034)", async ({
  page,
}, testInfo) => {
  const lines = augustLines();
  await saveMyBankProfile(page);
  await addAccount(page, "Checking");
  const file = writeFile(testInfo, "mybank-2026-08.csv", lines);

  // Checking gets the same file with nothing set aside, Cash with 1.00 set and one row brought back.
  await importFrom(page, "Checking", file);
  const withNothing = await confirmReview(page);
  expect(withNothing).not.toMatch(/because they were set aside/);

  await importFrom(page, "Cash", file);
  await amountField(page).fill("1.00");
  await line(page, SMALL).click();
  await drawer(page)
    .getByRole("listitem")
    .filter({ hasText: "Tiny 05" })
    .getByRole("button", { name: "Bring back", exact: true })
    .click();
  await drawer(page).press("Escape");

  const said = await confirmReview(page);
  expect(said).toMatch(new RegExp(`${lines.length} (rows|transactions)`));
  expect(said).toMatch(
    new RegExp(`${SMALL - 1} of them in .?Uncategorised.? because they were set aside`),
  );

  // The 29 set aside are expenses and incomes in their side's Uncategorised; the one brought back
  // is too, since the user gave it nothing.
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

  // Every balance equals the one the same file gives with nothing set aside (SC-034).
  const expected = euros(total(lines));
  await expect(await balanceOf(page, "Cash")).toContainText(expected);
  await expect(await balanceOf(page, "Checking")).toContainText(expected);
});

test("the next import sets rows under 1.00 aside from the start (scenario 7)", async ({
  page,
}, testInfo) => {
  await openReview(page, testInfo);
  await amountField(page).fill("1.00");
  await expect(line(page, SMALL)).toBeVisible();
  await confirmReview(page);

  const september: Line[] = [
    { date: "02.09.2026", payee: "Market", purpose: "Fruit", cents: -850 },
    { date: "03.09.2026", payee: "Gift shop", purpose: "Card", cents: -30 },
    { date: "04.09.2026", payee: "Bank", purpose: "Interest", cents: 40 },
  ];
  await importFrom(page, "Cash", writeFile(testInfo, "mybank-2026-09.csv", september));

  await expect(amountField(page)).toHaveValue("1.00");
  await expect(line(page, 2)).toBeVisible();
  await expect(plainRows(page)).toHaveCount(1);
  await expect(reviewList(page)).toContainText("Market");
  await expect(reviewList(page)).not.toContainText("Gift shop");
  await expect(header(page).getByRole("button", { name: "2 set aside" })).toBeVisible();
});
