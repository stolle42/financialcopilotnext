import type { Page } from "@playwright/test";
import type { PendingBatch } from "../src/domain/types";
import { choose, storedRecords } from "./support/app";
import { backupText, restoreBackup, storedData, type BackupData } from "./support/backup";
import { generateBackup, generateBankCsv } from "./support/generate";
import { saveMyBankProfile } from "./support/import";
import { euros, expect, setToday, test } from "./support/test";

// quickstart.md, performance. Each check restores or imports generated data through the screens a
// person would use, and times what follows. The data is big, so each test may take a while to set
// up; only the step the criterion names is timed. A file's tests run one after another in one
// worker, so they do not slow each other down, but other spec files may run beside them.

// Restoring thousands of transactions takes about a second or two on a quiet machine, and the
// setup is not what these tests time, so it may take far longer before a test gives up on it.
const RESTORE_TIMEOUT = 90_000;

const main = (page: Page) => page.getByRole("main");

/** Records the measured time in the report, so a pass still shows how much room it had. */
function record(milliseconds: number) {
  test.info().annotations.push({ type: "timing", description: `${milliseconds} ms` });
}

/** The app's own starting data, which a generated backup builds on. */
async function freshData(page: Page): Promise<BackupData> {
  await page.goto("/");
  return storedData(page);
}

test("Insights renders every section within 2 s for a period of 5,000 transactions (SC-009)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  // Today is in October, so the default period (this month) is empty and "Last month" is a
  // real choice of the September that holds the data.
  await setToday(page, "2026-10-03");
  const base = await freshData(page);
  const groceries = base.categories.find((c) => c.side === "expense" && c.name === "Groceries")!;
  const transport = base.categories.find((c) => c.side === "expense" && c.name === "Transport")!;
  const backup = generateBackup(
    {
      ...base,
      budgets: [
        { categoryId: groceries.id, limitCents: 40_000 },
        { categoryId: transport.id, limitCents: 8_000 },
      ],
    },
    { count: 5_000, start: "2026-09-01", end: "2026-09-30" },
  );
  await restoreBackup(page, backupText(backup), undefined, { timeout: RESTORE_TIMEOUT });

  // What the sections must show, summed here from the generated records.
  const total = (kind: "expense" | "income") =>
    backup.transactions.filter((t) => t.kind === kind).reduce((sum, t) => sum + t.amountCents, 0);
  await page.goto("/#/insights");
  await expect(main(page).getByRole("heading", { name: "Insights", level: 1 })).toBeVisible();
  const section = (name: string) => main(page).getByRole("region", { name });

  const started = Date.now();
  await page
    .getByRole("region", { name: "Period" })
    .getByRole("button", { name: "Last month", exact: true })
    .click();
  await expect(section("Spending over time").locator(".recharts-line-curve")).toBeVisible();
  await expect(section("Expenses by category").getByRole("heading")).toContainText(
    euros(total("expense")),
  );
  await expect(section("Income by category").getByRole("heading")).toContainText(
    euros(total("income")),
  );
  await expect(section("Budgets").getByRole("listitem")).toHaveCount(2);
  const elapsed = Date.now() - started;

  record(elapsed);
  expect(elapsed, "Insights for 5,000 transactions, from choosing the period").toBeLessThan(2_000);
});

test("A 5,000-row bank file is in review within 10 s (SC-010)", async ({ page }) => {
  test.setTimeout(180_000);
  await saveMyBankProfile(page);
  const csv = generateBankCsv({ rows: 5_000, vendors: 100 });

  await page.goto("/#/import");
  const form = page.getByRole("region", { name: "Import a file" });
  await choose(page, form, "Account", "Cash");
  await form.getByLabel("Bank file").setInputFiles({
    name: "bank-5000.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "latin1"),
  });
  const started = Date.now();
  await form.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/#\/import\/review$/);
  await expect(page.getByRole("region", { name: "Rows to review" })).toBeVisible();
  const elapsed = Date.now() - started;

  record(elapsed);
  expect(elapsed, "A 5,000-row file, from pressing Import to the review").toBeLessThan(10_000);
  const [batch] = await storedRecords<PendingBatch>(page, "pendingBatch");
  expect(batch?.rows).toHaveLength(5_000);
});

test("The transaction list shows within 1 s at 10,000 transactions (R-21)", async ({ page }) => {
  test.setTimeout(180_000);
  // The time is taken inside the page, from the start of its navigation to the paint after the
  // first row appears. A locator would measure Playwright's own work as well: it resolves roles
  // for every one of the 10,000 rows on each poll, on the thread that is drawing them.
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector('ul[aria-label="Transactions"] > li')) return;
      observer.disconnect();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          (window as unknown as { listShownAt?: number }).listShownAt = performance.now();
        }),
      );
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  const listShownAt = () =>
    page.evaluate(() => (window as unknown as { listShownAt?: number }).listShownAt);

  await setToday(page, "2026-09-03");
  const base = await freshData(page);
  const backup = generateBackup(base, { count: 10_000, start: "2026-01-01", end: "2026-09-03" });
  await restoreBackup(page, backupText(backup), undefined, { timeout: RESTORE_TIMEOUT });

  // Opening the app again: the page loads, reads storage and draws the first rows.
  await page.reload();
  await page.waitForFunction(
    () => (window as unknown as { listShownAt?: number }).listShownAt !== undefined,
    null,
    { timeout: 30_000 },
  );
  const elapsed = Math.round((await listShownAt())!);

  record(elapsed);
  expect(elapsed, "The first rows of 10,000 transactions, from opening the app").toBeLessThan(
    1_000,
  );
  expect((await storedData(page)).transactions).toHaveLength(10_000);
});
