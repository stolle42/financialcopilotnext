import type { Locator, Page } from "@playwright/test";
import { addAccount, addTransaction, reconcileAccount } from "./support/app";
import { euros, expect, setToday, test } from "./support/test";

// The journey of User Story 3 (quickstart.md, US3), in two fresh contexts. The first covers
// scenarios 1, 2, 5, 6 and 7: it enters three months of expenses, incomes and transfers through the
// transaction form, because restoring the backup that quickstart.md names only arrives with User
// Story 7. Every figure is checked against sums of the entered amounts, computed here without the
// app's code. The second covers scenarios 3 and 4 with entries that reconciling two accounts books
// to "Unaccounted" (User Story 5).

interface Entry {
  kind: "Expense" | "Income" | "Transfer";
  /** As typed in en-US. */
  amount: string;
  date: string;
  account: "Giro" | "Cash";
  /** No category leaves the form's default, "Uncategorised". */
  category?: string;
}

const LEDGER: Entry[] = [
  { kind: "Expense", amount: "45.20", date: "2026-07-03", account: "Giro", category: "Groceries" },
  { kind: "Expense", amount: "18.50", date: "2026-07-15", account: "Cash", category: "Eating out" },
  { kind: "Income", amount: "2100.00", date: "2026-07-25", account: "Giro", category: "Salary" },
  { kind: "Transfer", amount: "200.00", date: "2026-07-28", account: "Giro" },
  { kind: "Expense", amount: "800.00", date: "2026-08-01", account: "Giro", category: "Housing" },
  { kind: "Expense", amount: "62.35", date: "2026-08-09", account: "Giro", category: "Groceries" },
  { kind: "Expense", amount: "9.99", date: "2026-08-20", account: "Cash" },
  { kind: "Income", amount: "2100.00", date: "2026-08-25", account: "Giro", category: "Salary" },
  { kind: "Income", amount: "50.00", date: "2026-08-30", account: "Cash", category: "Gifts" },
  { kind: "Transfer", amount: "100.00", date: "2026-08-31", account: "Giro" },
  { kind: "Expense", amount: "800.00", date: "2026-09-01", account: "Giro", category: "Housing" },
  { kind: "Expense", amount: "30.10", date: "2026-09-05", account: "Giro", category: "Groceries" },
  { kind: "Expense", amount: "25.00", date: "2026-09-10", account: "Cash", category: "Transport" },
  { kind: "Income", amount: "3.21", date: "2026-09-12", account: "Giro", category: "Interest" },
  { kind: "Transfer", amount: "150.00", date: "2026-09-14", account: "Giro" },
];

/** Records an entry through the form; a transfer goes from Giro to Cash. */
async function enter(page: Page, entry: Entry) {
  await addTransaction(page, {
    kind: entry.kind,
    amount: entry.amount,
    date: entry.date,
    account: entry.account,
    ...(entry.kind === "Transfer" ? { destination: "Cash" } : { category: entry.category }),
  });
}

const cents = (amount: string) => Math.round(Number(amount) * 100);

/** The period's sum per category of one side, by amount and then by name, as the legend lists it. */
function expectedBreakdown(side: "Expense" | "Income", start: string, end: string) {
  const sums = new Map<string, number>();
  for (const entry of LEDGER) {
    if (entry.kind !== side || entry.date < start || entry.date > end) continue;
    const name = entry.category ?? "Uncategorised";
    sums.set(name, (sums.get(name) ?? 0) + cents(entry.amount));
  }
  const entries = [...sums].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  return { total: entries.reduce((sum, [, amount]) => sum + amount, 0), entries };
}

const share = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const main = (page: Page) => page.getByRole("main");
const period = (page: Page) => main(page).getByRole("region", { name: "Period" });
const spending = (page: Page) => main(page).getByRole("region", { name: "Spending over time" });
const expenses = (page: Page) => main(page).getByRole("region", { name: "Expenses by category" });
const income = (page: Page) => main(page).getByRole("region", { name: "Income by category" });

async function openInsights(page: Page) {
  await page.goto("/#/insights");
  await expect(main(page).getByRole("heading", { name: "Insights", level: 1 })).toBeVisible();
}

async function choosePreset(page: Page, name: string) {
  await period(page).getByRole("button", { name, exact: true }).click();
}

async function choosePeriod(page: Page, start: string, end: string) {
  await period(page).getByLabel("Start date").fill(start);
  await period(page).getByLabel("End date").fill(end);
}

/** Both breakdowns hold exactly the period's non-transfer entries, or say there are none. */
async function expectBreakdowns(page: Page, start: string, end: string) {
  const sides: [Locator, "Expense" | "Income", string][] = [
    [expenses(page), "Expense", "No expenses in this period"],
    [income(page), "Income", "No income in this period"],
  ];
  for (const [region, side, emptyState] of sides) {
    const { total, entries } = expectedBreakdown(side, start, end);
    if (entries.length === 0) {
      await expect(region).toContainText(emptyState);
      await expect(region.getByRole("listitem")).toHaveCount(0);
      continue;
    }
    await expect(region.getByRole("heading")).toContainText(euros(total));
    await expect(region.getByRole("listitem")).toHaveText(
      entries.map(
        ([name, amount]) =>
          new RegExp(
            `${escape(name)}.*${escape(euros(amount))}.*${escape(share.format(amount / total))}`,
          ),
      ),
    );
  }
}

/** The tooltip of the spending line's last point, the period's end. */
async function lastPointTooltip(page: Page) {
  const box = await spending(page).locator("svg.recharts-surface").boundingBox();
  if (!box) throw new Error("The spending chart is not drawn");
  await page.mouse.move(box.x + box.width - 40, box.y + box.height / 2);
  return spending(page).locator(".recharts-tooltip-wrapper");
}

test("shows where the money went over a chosen period, leaving out transfers", async ({ page }) => {
  test.setTimeout(240_000);
  await setToday(page, "2026-09-15");
  await addAccount(page, "Giro", "5000.00");
  for (const entry of LEDGER) await enter(page, entry);

  // 7. Insights opens on the current calendar month.
  await openInsights(page);
  await expect(period(page).getByLabel("Start date")).toHaveValue("2026-09-01");
  await expect(period(page).getByLabel("End date")).toHaveValue("2026-09-30");
  await expect(period(page).getByRole("button", { name: "This month" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // 1 and 2. Each period holds exactly its own transactions, both ends included, and no transfer.
  await expectBreakdowns(page, "2026-09-01", "2026-09-30");

  await choosePreset(page, "Last month");
  await expectBreakdowns(page, "2026-08-01", "2026-08-31");
  // 5. "Uncategorised" is its own slice, so the user sees how much sorting remains.
  await expect(
    expenses(page).getByRole("listitem").filter({ hasText: "Uncategorised" }),
  ).toHaveText(new RegExp(`Uncategorised.*${escape(euros(999))}`));

  await choosePreset(page, "Last 3 months");
  await expectBreakdowns(page, "2026-07-01", "2026-09-30");

  await choosePreset(page, "This year");
  await expectBreakdowns(page, "2026-01-01", "2026-09-15");

  await choosePeriod(page, "2026-07-10", "2026-08-20");
  await expectBreakdowns(page, "2026-07-10", "2026-08-20");
  // A short period, so the line's last point is easy to point at: 20 August holds only the
  // Uncategorised 9.99.
  await choosePeriod(page, "2026-08-18", "2026-08-20");
  await expectBreakdowns(page, "2026-08-18", "2026-08-20");
  const tooltip = await lastPointTooltip(page);
  await expect(tooltip).toContainText("Aug 20, 2026");
  await expect(tooltip).toContainText(euros(999));

  // 6. A period without transactions shows an empty state in every section, and no error.
  await choosePreset(page, "Last year");
  await expectBreakdowns(page, "2025-01-01", "2025-12-31");
  await expect(spending(page)).toContainText("No spending in this period");
  await expect(main(page).getByRole("alert")).toHaveCount(0);

  // SC-004: recording one more transfer leaves every total as it was. Opening the URL the page
  // already has is no navigation, so Insights is left first and opened afresh, on this month.
  await enter(page, { kind: "Transfer", amount: "75.00", date: "2026-09-15", account: "Giro" });
  await page.goto("/#/");
  await openInsights(page);
  await expectBreakdowns(page, "2026-09-01", "2026-09-30");
  await choosePeriod(page, "2026-09-15", "2026-09-15");
  await expect(spending(page)).toContainText("No spending in this period");
  await expectBreakdowns(page, "2026-09-15", "2026-09-15");
});

/** The legend lists `entries` as [name, cents], in order, each with its share of their total. */
async function expectLegend(region: Locator, entries: [string, number][]) {
  const total = entries.reduce((sum, [, amount]) => sum + amount, 0);
  await expect(region.getByRole("heading")).toContainText(euros(total));
  await expect(region.getByRole("listitem")).toHaveText(
    entries.map(
      ([name, amount]) =>
        new RegExp(
          `${escape(name)}.*${escape(euros(amount))}.*${escape(share.format(amount / total))}`,
        ),
    ),
  );
}

/** "Unaccounted" alone is marked unknown and filled with the hatch from the chart's <defs>. */
async function expectHatchedUnaccounted(region: Locator, slices: number) {
  const marked = region.getByRole("listitem").filter({ hasText: "unknown" });
  await expect(marked).toHaveCount(1);
  await expect(marked).toContainText("Unaccounted");
  const chart = region.locator("svg.recharts-surface");
  await expect(chart.locator(".recharts-sector")).toHaveCount(slices);
  const pattern = chart.locator("defs pattern");
  await expect(pattern).toHaveCount(1);
  const patternId = await pattern.getAttribute("id");
  await expect(chart.locator(`.recharts-sector[fill="url(#${patternId})"]`)).toHaveCount(1);
}

test("shows what reconciling books to Unaccounted, hatched and at its true share", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setToday(page, "2026-09-15");
  await addAccount(page, "Giro", "5000.00");
  await enter(page, {
    kind: "Income",
    amount: "100.00",
    date: "2026-09-02",
    account: "Cash",
    category: "Gifts",
  });
  await enter(page, {
    kind: "Expense",
    amount: "30.00",
    date: "2026-09-05",
    account: "Cash",
    category: "Groceries",
  });
  await enter(page, {
    kind: "Income",
    amount: "2000.00",
    date: "2026-09-01",
    account: "Giro",
    category: "Salary",
  });
  // Cash computes to 70.00 but holds 60.00: a shortfall of 10.00.
  await reconcileAccount(page, "Cash", "60.00");
  // Giro computes to 7,000.00 but holds 7,025.00: a surplus of 25.00.
  await reconcileAccount(page, "Giro", "7025.00");

  await openInsights(page);

  // 3. The shortfall is expense "Unaccounted", distinguished from the ordinary categories.
  await expectLegend(expenses(page), [
    ["Groceries", 3000],
    ["Unaccounted", 1000],
  ]);
  await expectHatchedUnaccounted(expenses(page), 2);

  // 4. The surplus is income "Unaccounted", at its true share however small.
  await expectLegend(income(page), [
    ["Salary", 200000],
    ["Gifts", 10000],
    ["Unaccounted", 2500],
  ]);
  await expectHatchedUnaccounted(income(page), 3);

  // The shortfall is money spent, so the line counts it; the surplus shows nowhere but income.
  await choosePeriod(page, "2026-09-13", "2026-09-15");
  await expectLegend(expenses(page), [["Unaccounted", 1000]]);
  await expectLegend(income(page), [["Unaccounted", 2500]]);
  const tooltip = await lastPointTooltip(page);
  await expect(tooltip).toContainText("Sep 15, 2026");
  await expect(tooltip).toContainText(euros(1000));
});
