import type { Locator, Page } from "@playwright/test";
import type { Category, Side } from "../../src/domain/types";
import {
  addAccount,
  addTransaction,
  putBudgets,
  putRecords,
  storedRecords,
  storedTransactions,
} from "../support/app";
import { euros, expect, setToday, test } from "../support/test";

// contracts/ui.md, insights; FR-050 – FR-053; R-14, R-19.

test.beforeEach(async ({ page }) => {
  await setToday(page, "2026-09-03");
});

const main = (page: Page) => page.getByRole("main");
const period = (page: Page) => main(page).getByRole("region", { name: "Period" });
const startDate = (page: Page) => period(page).getByLabel("Start date");
const endDate = (page: Page) => period(page).getByLabel("End date");
const preset = (page: Page, name: string) =>
  period(page).getByRole("button", { name, exact: true });
const spending = (page: Page) => main(page).getByRole("region", { name: "Spending over time" });

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PRESETS = ["This month", "Last month", "Last 3 months", "This year", "Last year"];

async function openInsights(page: Page) {
  await page.goto("/#/insights");
  await expect(main(page).getByRole("heading", { name: "Insights", level: 1 })).toBeVisible();
}

async function choosePeriod(page: Page, start: string, end: string) {
  await startDate(page).fill(start);
  await endDate(page).fill(end);
}

/** Only `name` among the presets shows as pressed, or none for `null`. */
async function expectPressedPreset(page: Page, name: string | null) {
  for (const other of PRESETS) {
    await expect(preset(page, other)).toHaveAttribute(
      "aria-pressed",
      other === name ? "true" : "false",
    );
  }
}

test.describe("the screen", () => {
  test("is the last entry in the sidebar", async ({ page }) => {
    await page.goto("/");
    const links = page.getByRole("navigation", { name: "Screens" }).getByRole("link");
    await expect(links.last()).toHaveText("Insights");
    await links.last().click();
    await expect(page).toHaveURL(/#\/insights$/);
    await expect(main(page).getByRole("heading", { name: "Insights", level: 1 })).toBeVisible();
  });

  test("shows its sections in the order of the contract", async ({ page }) => {
    await openInsights(page);
    const regions = main(page).getByRole("region");
    const names = [
      "Period",
      "Spending over time",
      "Expenses by category",
      "Income by category",
      "Budgets",
    ];
    await expect(regions).toHaveCount(names.length);
    for (const [index, name] of names.entries()) {
      await expect(regions.nth(index)).toHaveAccessibleName(new RegExp(`^${name}`));
    }
  });
});

test.describe("the period (FR-050)", () => {
  test("defaults to this month", async ({ page }) => {
    await openInsights(page);
    await expect(startDate(page)).toHaveValue("2026-09-01");
    await expect(endDate(page)).toHaveValue("2026-09-30");
    await expectPressedPreset(page, "This month");
  });

  test("each preset sets its own dates", async ({ page }) => {
    await openInsights(page);
    const ranges: [string, string, string][] = [
      ["Last month", "2026-08-01", "2026-08-31"],
      ["Last 3 months", "2026-07-01", "2026-09-30"],
      ["This year", "2026-01-01", "2026-12-31"],
      ["Last year", "2025-01-01", "2025-12-31"],
      ["This month", "2026-09-01", "2026-09-30"],
    ];
    for (const [name, start, end] of ranges) {
      await preset(page, name).click();
      await expect(startDate(page)).toHaveValue(start);
      await expect(endDate(page)).toHaveValue(end);
      await expectPressedPreset(page, name);
    }
  });

  test("presets follow today, across the turn of the year", async ({ page }) => {
    await setToday(page, "2026-01-15");
    await openInsights(page);
    await preset(page, "Last month").click();
    await expect(startDate(page)).toHaveValue("2025-12-01");
    await expect(endDate(page)).toHaveValue("2025-12-31");
    await preset(page, "Last 3 months").click();
    await expect(startDate(page)).toHaveValue("2025-11-01");
    await expect(endDate(page)).toHaveValue("2026-01-31");
  });

  test("typed dates set a period of their own, which every section follows", async ({ page }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "12.34", category: "Groceries", date: "2026-08-15" });
    await openInsights(page);
    const expenses = main(page).getByRole("region", { name: "Expenses by category" });
    await expect(expenses).toContainText("No expenses in this period");

    await choosePeriod(page, "2026-08-15", "2026-08-15");

    await expectPressedPreset(page, null);
    await expect(expenses).toContainText(euros(1234));
    await expect(spending(page)).not.toContainText("No spending in this period");
  });
});

test.describe("spending over time (FR-051, FR-053)", () => {
  const surface = (page: Page) => spending(page).locator("svg.recharts-surface");
  const tooltip = (page: Page) => spending(page).locator(".recharts-tooltip-wrapper");

  /** Points at the chart near its right edge, where the line's last point is. */
  async function hoverLastPoint(page: Page) {
    const box = await surface(page).boundingBox();
    if (!box) throw new Error("The spending chart is not drawn");
    await page.mouse.move(box.x + box.width - 40, box.y + box.height / 2);
  }

  test("with no expenses in the period, says so instead of drawing a chart", async ({ page }) => {
    await page.goto("/");
    await addTransaction(page, { kind: "Income", amount: "100.00", category: "Salary" });
    await openInsights(page);
    await expect(spending(page)).toContainText("No spending in this period");
    await expect(surface(page)).toHaveCount(0);
    await expect(main(page).getByRole("alert")).toHaveCount(0);
  });

  test("draws the line inside the Content-Security-Policy", async ({ page }) => {
    // The network guard fails the test on any CSP violation, such as an injected <style> (R-19).
    await page.goto("/");
    await addTransaction(page, { amount: "40.00", category: "Groceries" });
    await openInsights(page);
    await expect(spending(page).locator(".recharts-line-curve")).toBeVisible();
    await expect(spending(page)).not.toContainText("No spending in this period");
  });

  test("a daily point's tooltip shows its date and its total in euros", async ({ page }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "40.00", category: "Groceries" });
    await addTransaction(page, { amount: "2.17", category: "Eating out" });
    await addTransaction(page, { amount: "9.00", category: "Groceries", date: "2026-09-02" });
    await openInsights(page);
    await choosePeriod(page, "2026-08-28", "2026-09-03");
    await expect(spending(page)).not.toContainText(euros(4217));

    await hoverLastPoint(page);

    await expect(tooltip(page)).toContainText("Sep 3, 2026");
    await expect(tooltip(page)).toContainText(euros(4217));
  });

  test("beyond 92 days, a point is a month, labelled with it", async ({ page }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "40.00", category: "Groceries" });
    await addTransaction(page, { amount: "9.00", category: "Groceries", date: "2026-08-20" });
    await addTransaction(page, { amount: "2.17", category: "Groceries", date: "2026-09-01" });
    await openInsights(page);
    // 3 June to 3 September is 93 days: the points are June, July, August and September.
    await choosePeriod(page, "2026-06-03", "2026-09-03");

    await hoverLastPoint(page);

    await expect(tooltip(page)).toContainText("Sep 2026");
    await expect(tooltip(page)).toContainText(euros(4217));
  });

  test("offers no click-through", async ({ page }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "40.00", category: "Groceries" });
    await openInsights(page);
    await hoverLastPoint(page);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page).toHaveURL(/#\/insights$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("the category breakdowns (FR-051, FR-052)", () => {
  const expenses = (page: Page) => main(page).getByRole("region", { name: "Expenses by category" });
  const income = (page: Page) => main(page).getByRole("region", { name: "Income by category" });
  const chart = (region: Locator) => region.locator("svg.recharts-surface");

  /** A legend entry: the category's chip, then its amount, then its share. */
  const legendEntry = (name: string, cents: number, share: string) =>
    new RegExp(`${escape(name)}.*${escape(euros(cents))}.*${escape(share)}`);

  test("list each side by amount with its share, titled with the side's total", async ({
    page,
  }) => {
    await addAccount(page, "Giro");
    await addTransaction(page, { amount: "25.00", category: "Groceries" });
    await addTransaction(page, { amount: "30.00", category: "Eating out" });
    await addTransaction(page, { amount: "25.00", category: "Groceries" });
    await addTransaction(page, { amount: "20.00" });
    await addTransaction(page, { kind: "Income", amount: "500.00", category: "Gifts" });
    await addTransaction(page, { kind: "Income", amount: "1500.00", category: "Salary" });
    await addTransaction(page, { kind: "Transfer", amount: "70.00", destination: "Giro" });
    await openInsights(page);

    await expect(expenses(page).getByRole("heading")).toContainText("Expenses by category");
    await expect(expenses(page).getByRole("heading")).toContainText(euros(10000));
    // "Uncategorised" is its own entry, so the user sees how much sorting remains (scenario 5).
    await expect(expenses(page).getByRole("listitem")).toHaveText([
      legendEntry("Groceries", 5000, "50%"),
      legendEntry("Eating out", 3000, "30%"),
      legendEntry("Uncategorised", 2000, "20%"),
    ]);
    await expect(chart(expenses(page)).locator(".recharts-sector")).toHaveCount(3);

    await expect(income(page).getByRole("heading")).toContainText("Income by category");
    await expect(income(page).getByRole("heading")).toContainText(euros(200000));
    await expect(income(page).getByRole("listitem")).toHaveText([
      legendEntry("Salary", 150000, "75%"),
      legendEntry("Gifts", 50000, "25%"),
    ]);

    // The transfer is in no figure (FR-012): the totals above already leave it out.
    await expect(expenses(page)).not.toContainText(euros(7000));
    await expect(income(page)).not.toContainText(euros(7000));
  });

  test("shares keep one decimal, and equal amounts sort by name", async ({ page }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "10.00", category: "Transport" });
    await addTransaction(page, { amount: "10.00", category: "Groceries" });
    await addTransaction(page, { amount: "10.00", category: "Health" });
    await openInsights(page);
    await expect(expenses(page).getByRole("listitem")).toHaveText([
      legendEntry("Groceries", 1000, "33.3%"),
      legendEntry("Health", 1000, "33.3%"),
      legendEntry("Transport", 1000, "33.3%"),
    ]);
  });

  test("each side has its own empty state (scenario 6)", async ({ page }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "40.00", category: "Groceries" });
    await openInsights(page);
    await expect(income(page)).toContainText("No income in this period");
    await expect(chart(income(page))).toHaveCount(0);
    await expect(expenses(page).getByRole("listitem")).toHaveCount(1);

    await preset(page, "Last month").click();

    await expect(expenses(page)).toContainText("No expenses in this period");
    await expect(chart(expenses(page))).toHaveCount(0);
    await expect(spending(page)).toContainText("No spending in this period");
    await expect(main(page).getByRole("alert")).toHaveCount(0);
  });

  test("Unaccounted is hatched and marked unknown, at its true share, on both sides", async ({
    page,
  }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "30.00", category: "Groceries" });
    await addTransaction(page, { kind: "Income", amount: "40.00", category: "Salary" });
    // Only reconciliation files money under "Unaccounted" (User Story 5), so the shortfall and
    // the surplus go straight into storage.
    const categories = await storedRecords<Category>(page, "categories");
    const unaccounted = (side: Side) =>
      categories.find((c) => c.side === side && c.role === "unaccounted")!.id;
    const [first, second] = await storedTransactions(page);
    const records = [first!, second!].map((t) => ({
      ...t,
      id: `${t.id}-unaccounted`,
      seq: t.seq + 2,
      amountCents: 1000,
      categoryId: unaccounted(t.kind === "income" ? "income" : "expense"),
    }));
    await putRecords(page, "transactions", records);
    await page.goto("/#/insights");
    await page.reload();

    const sides = [
      { region: expenses(page), known: "Groceries", cents: 3000, shares: ["75%", "25%"] },
      { region: income(page), known: "Salary", cents: 4000, shares: ["80%", "20%"] },
    ];
    for (const { region, known, cents, shares } of sides) {
      await expect(region.getByRole("listitem")).toHaveText([
        legendEntry(known, cents, shares[0]!),
        legendEntry("Unaccounted", 1000, shares[1]!),
      ]);
      const marked = region.getByRole("listitem").filter({ hasText: "unknown" });
      await expect(marked).toHaveCount(1);
      await expect(marked).toContainText("Unaccounted");

      // The pattern lives in the chart's <defs>, and only the Unaccounted slice is filled with it.
      const pattern = chart(region).locator("defs pattern");
      await expect(pattern).toHaveCount(1);
      const patternId = await pattern.getAttribute("id");
      await expect(chart(region).locator(".recharts-sector")).toHaveCount(2);
      await expect(
        chart(region).locator(`.recharts-sector[fill="url(#${patternId})"]`),
      ).toHaveCount(1);
    }
  });

  test("a slice shows its tooltip and offers no click-through (FR-053)", async ({ page }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "40.00", category: "Groceries" });
    await openInsights(page);
    const slice = chart(expenses(page)).locator(".recharts-sector");
    await expect(slice).toHaveCount(1);
    const box = await slice.boundingBox();
    if (!box) throw new Error("The expense donut is not drawn");

    // The only slice is the whole ring, so point at its top rather than at the hole in the middle.
    await slice.hover({ position: { x: box.width / 2, y: 4 } });

    const tooltip = expenses(page).locator(".recharts-tooltip-wrapper");
    await expect(tooltip).toContainText("Groceries");
    await expect(tooltip).toContainText(euros(4000));
    await page.mouse.down();
    await page.mouse.up();
    await expect(page).toHaveURL(/#\/insights$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("the budgets (FR-041, FR-042, SC-011)", () => {
  const budgets = (page: Page) => main(page).getByRole("region", { name: "Budgets" });
  const bar = (page: Page, name: string) =>
    budgets(page).getByRole("listitem").filter({ hasText: name });
  const overLimit = (page: Page) => budgets(page).locator('[data-state="over-limit"]');
  /** A bar: the category's chip, then what was spent, then the limit. */
  const barEntry = (name: string, spentCents: number, limitCents: number) =>
    new RegExp(`${escape(name)}.*${escape(euros(spentCents))}.*${escape(euros(limitCents))}`);

  test("with no budgets, says so and links to Budgets", async ({ page }) => {
    await page.goto("/");
    await openInsights(page);
    await expect(budgets(page)).toContainText("No budgets set");
    await expect(budgets(page).getByRole("listitem")).toHaveCount(0);
    await expect(main(page).getByRole("alert")).toHaveCount(0);

    await budgets(page).getByRole("link", { name: "Set a budget" }).click();

    await expect(page).toHaveURL(/#\/budgets$/);
    await expect(main(page).getByRole("heading", { name: "Budgets", level: 1 })).toBeVisible();
  });

  test("shows each budgeted category's spending in the month against its limit, by name", async ({
    page,
  }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "150.50", category: "Groceries" });
    await addTransaction(page, { amount: "12.00", category: "Eating out", date: "2026-09-01" });
    // Neither of these is budgeted, so neither has a bar.
    await addTransaction(page, { amount: "999.00", category: "Housing" });
    await addTransaction(page, { kind: "Income", amount: "500.00", category: "Salary" });
    await putBudgets(page, { Groceries: 40000, "Eating out": 15000 });

    await openInsights(page);

    await expect(budgets(page).getByRole("listitem")).toHaveText([
      barEntry("Eating out", 1200, 15000),
      barEntry("Groceries", 15050, 40000),
    ]);
    await expect(budgets(page).getByRole("progressbar")).toHaveCount(2);
    await expect(budgets(page)).not.toContainText("No budgets set");
    await expect(overLimit(page)).toHaveCount(0);
  });

  test("shows a budgeted category without spending as 0.00 against its limit", async ({ page }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "10.00", category: "Groceries", date: "2026-08-20" });
    await putBudgets(page, { Transport: 8000 });

    await openInsights(page);

    await expect(budgets(page).getByRole("listitem")).toHaveText([barEntry("Transport", 0, 8000)]);
    await expect(overLimit(page)).toHaveCount(0);
  });

  test("is labelled with the month, which is that of the period's end (scenario 6)", async ({
    page,
  }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "10.00", category: "Groceries", date: "2026-07-20" });
    await addTransaction(page, { amount: "20.00", category: "Groceries", date: "2026-08-20" });
    await addTransaction(page, { amount: "30.00", category: "Groceries", date: "2026-09-02" });
    await putBudgets(page, { Groceries: 40000 });
    await openInsights(page);
    await expect(budgets(page).getByRole("heading")).toContainText("Sep 2026");
    await expect(bar(page, "Groceries")).toHaveText(barEntry("Groceries", 3000, 40000));

    // July to September: September only.
    await preset(page, "Last 3 months").click();
    await expect(budgets(page).getByRole("heading")).toContainText("Sep 2026");
    await expect(budgets(page).getByRole("listitem")).toHaveText([
      barEntry("Groceries", 3000, 40000),
    ]);

    await preset(page, "Last month").click();
    await expect(budgets(page).getByRole("heading")).toContainText("Aug 2026");
    await expect(bar(page, "Groceries")).toHaveText(barEntry("Groceries", 2000, 40000));

    await preset(page, "This year").click();
    await expect(budgets(page).getByRole("heading")).toContainText("Dec 2026");
    await expect(bar(page, "Groceries")).toHaveText(barEntry("Groceries", 0, 40000));
  });

  test("measures the whole end month, whatever day the period starts on (R-14)", async ({
    page,
  }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "5.00", category: "Groceries", date: "2026-08-31" });
    await addTransaction(page, { amount: "20.00", category: "Groceries", date: "2026-09-01" });
    await addTransaction(page, { amount: "30.00", category: "Groceries", date: "2026-09-30" });
    await addTransaction(page, { amount: "7.00", category: "Groceries", date: "2026-10-01" });
    await putBudgets(page, { Groceries: 40000 });
    await openInsights(page);

    await choosePeriod(page, "2026-09-10", "2026-09-12");

    await expect(budgets(page).getByRole("heading")).toContainText("Sep 2026");
    await expect(bar(page, "Groceries")).toHaveText(barEntry("Groceries", 5000, 40000));
  });

  test("marks an over-limit category by its state and its label, and no other (SC-011)", async ({
    page,
  }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "430.00", category: "Groceries" });
    await addTransaction(page, { amount: "80.00", category: "Transport" });
    await addTransaction(page, { amount: "10.00", category: "Eating out" });
    await putBudgets(page, { Groceries: 40000, Transport: 8000, "Eating out": 15000 });

    await openInsights(page);

    // Groceries is over its limit. Transport has spent exactly its limit, which is not over it.
    await expect(overLimit(page)).toHaveCount(1);
    await expect(overLimit(page)).toContainText("Groceries");
    await expect(bar(page, "Groceries")).toHaveAttribute("data-state", "over-limit");
    await expect(bar(page, "Groceries").getByText("Over limit")).toBeVisible();
    for (const name of ["Transport", "Eating out"]) {
      await expect(bar(page, name)).not.toHaveAttribute("data-state", "over-limit");
      await expect(bar(page, name).getByText("Over limit")).toHaveCount(0);
    }
    await expect(budgets(page).getByText("Over limit")).toHaveCount(1);
  });

  test("a category is within its limit again in a month with less spending", async ({ page }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "430.00", category: "Groceries" });
    await addTransaction(page, { amount: "40.00", category: "Groceries", date: "2026-08-10" });
    await putBudgets(page, { Groceries: 40000 });
    await openInsights(page);
    await expect(overLimit(page)).toHaveCount(1);

    await preset(page, "Last month").click();

    await expect(overLimit(page)).toHaveCount(0);
    await expect(bar(page, "Groceries")).toHaveText(barEntry("Groceries", 4000, 40000));
  });

  test("a bar is plain information, with no click-through (FR-053)", async ({ page }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "40.00", category: "Groceries" });
    await putBudgets(page, { Groceries: 40000 });
    await openInsights(page);

    await bar(page, "Groceries").click();

    await expect(page).toHaveURL(/#\/insights$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
