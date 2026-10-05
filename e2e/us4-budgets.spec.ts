import type { Page } from "@playwright/test";
import { addAccount, addTransaction, removeBudgetLimit, setBudgetLimit } from "./support/app";
import { euros, expect, setToday, test } from "./support/test";

// The journey of User Story 4, scenarios 1–6, in one fresh context (quickstart.md, US4). It moves
// the clock from September to October for scenario 3. The over-limit state is asserted by its
// marker alone, never by reading a number (SC-011), and a transfer must leave every bar as it was
// (SC-004).

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const main = (page: Page) => page.getByRole("main");
const period = (page: Page) => main(page).getByRole("region", { name: "Period" });
const budgets = (page: Page) => main(page).getByRole("region", { name: "Budgets" });
const bars = (page: Page) => budgets(page).getByRole("listitem");
const bar = (page: Page, name: string) => bars(page).filter({ hasText: name });
/** The bars carrying the over-limit marker, found by that marker alone. */
const overLimit = (page: Page) => budgets(page).locator('[data-state="over-limit"]');

/** A bar: the category's chip, then what was spent, then the limit. */
const barEntry = (name: string, spentCents: number, limitCents: number) =>
  new RegExp(`${escape(name)}.*${escape(euros(spentCents))}.*${escape(euros(limitCents))}`);

async function openInsights(page: Page) {
  await page.goto("/#/insights");
  await expect(main(page).getByRole("heading", { name: "Insights", level: 1 })).toBeVisible();
}

const choosePreset = (page: Page, name: string) =>
  period(page).getByRole("button", { name, exact: true }).click();

test("sets monthly limits and shows each month's progress against them, over limit or not", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await setToday(page, "2026-09-15");
  await addAccount(page, "Giro", "5000.00");

  // 4. Only the ordinary expense categories offer a budget.
  await page.goto("/#/budgets");
  await expect(main(page).getByRole("heading", { name: "Budgets", level: 1 })).toBeVisible();
  await expect(main(page).getByRole("listitem")).toHaveCount(9);
  for (const name of ["Uncategorised", "Unaccounted", "Salary", "Interest", "Gifts"]) {
    await expect(main(page)).not.toContainText(name);
  }

  // 1. A limit on Groceries, and one on Transport, which stays well within it.
  await setBudgetLimit(page, "Groceries", "400.00");
  await setBudgetLimit(page, "Transport", "50.00");
  await addTransaction(page, { amount: "100.00", category: "Groceries", date: "2026-09-03" });
  await addTransaction(page, { amount: "50.00", category: "Groceries", date: "2026-09-10" });
  await addTransaction(page, { amount: "20.00", category: "Transport", date: "2026-09-12" });
  // Not budgeted, so it has no bar.
  await addTransaction(page, { amount: "800.00", category: "Housing", date: "2026-09-01" });

  await openInsights(page);
  await expect(budgets(page).getByRole("heading")).toContainText("Sep 2026");
  await expect(bars(page)).toHaveText([
    barEntry("Groceries", 15000, 40000),
    barEntry("Transport", 2000, 5000),
  ]);
  await expect(overLimit(page)).toHaveCount(0);

  // SC-004: a transfer, whatever its size, changes no bar.
  await addTransaction(page, {
    kind: "Transfer",
    amount: "500.00",
    account: "Giro",
    destination: "Cash",
    date: "2026-09-12",
  });
  await expect(bars(page)).toHaveText([
    barEntry("Groceries", 15000, 40000),
    barEntry("Transport", 2000, 5000),
  ]);
  await expect(overLimit(page)).toHaveCount(0);

  // 6. July to September shows September only, labelled with it. August is its own month.
  await choosePreset(page, "Last 3 months");
  await expect(budgets(page).getByRole("heading")).toContainText("Sep 2026");
  await expect(bars(page)).toHaveText([
    barEntry("Groceries", 15000, 40000),
    barEntry("Transport", 2000, 5000),
  ]);
  await choosePreset(page, "Last month");
  await expect(budgets(page).getByRole("heading")).toContainText("Aug 2026");
  await expect(bars(page)).toHaveText([
    barEntry("Groceries", 0, 40000),
    barEntry("Transport", 0, 5000),
  ]);

  // 3. October begins: 250.00 of the Groceries limit went unspent in September, and none of it
  // carries over. October starts at 0.00 against the full 400.00.
  await setToday(page, "2026-10-02");
  await page.goto("/#/");
  await openInsights(page);
  await expect(budgets(page).getByRole("heading")).toContainText("Oct 2026");
  await expect(bars(page)).toHaveText([
    barEntry("Groceries", 0, 40000),
    barEntry("Transport", 0, 5000),
  ]);
  await choosePreset(page, "Last month");
  await expect(budgets(page).getByRole("heading")).toContainText("Sep 2026");
  await expect(bar(page, "Groceries")).toHaveText(barEntry("Groceries", 15000, 40000));

  // 2. Groceries spending of 430.00 in October puts that bar, and only that bar, over its limit.
  await addTransaction(page, { amount: "430.00", category: "Groceries" });
  await choosePreset(page, "This month");
  await expect(budgets(page).getByRole("heading")).toContainText("Oct 2026");
  await expect(overLimit(page)).toHaveCount(1);
  await expect(overLimit(page)).toContainText("Groceries");
  await expect(bar(page, "Groceries").getByText("Over limit")).toBeVisible();
  await expect(bar(page, "Transport")).not.toHaveAttribute("data-state", "over-limit");
  await expect(budgets(page).getByText("Over limit")).toHaveCount(1);

  // 5. A raised limit shows at once, and so does the old one coming back. It applies to every
  // month, September included (FR-041).
  await setBudgetLimit(page, "Groceries", "500.00");
  await openInsights(page);
  await expect(overLimit(page)).toHaveCount(0);
  await expect(bar(page, "Groceries")).toHaveText(barEntry("Groceries", 43000, 50000));
  await choosePreset(page, "Last month");
  await expect(bar(page, "Groceries")).toHaveText(barEntry("Groceries", 15000, 50000));

  await setBudgetLimit(page, "Groceries", "400.00");
  await openInsights(page);
  await expect(overLimit(page)).toHaveCount(1);
  await expect(overLimit(page)).toContainText("Groceries");

  // 5. Removing a limit takes its bar away, and removing the last one leaves the empty state.
  await removeBudgetLimit(page, "Transport");
  await openInsights(page);
  await expect(bars(page)).toHaveText([barEntry("Groceries", 43000, 40000)]);
  await expect(bar(page, "Transport")).toHaveCount(0);

  await removeBudgetLimit(page, "Groceries");
  await openInsights(page);
  await expect(bars(page)).toHaveCount(0);
  await expect(overLimit(page)).toHaveCount(0);
  await expect(budgets(page)).toContainText("No budgets set");
  await expect(budgets(page).getByRole("link", { name: "Set a budget" })).toBeVisible();
});
