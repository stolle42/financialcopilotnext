import type { Locator, Page } from "@playwright/test";
import type { Category, Side } from "../../src/domain/types";
import {
  addAccount,
  addTransaction,
  putBudgets,
  putRecords,
  reconcileAccount,
  storedRecord,
  storedRecords,
  storedTransactions,
} from "../support/app";
import { messageFor } from "../../src/ui/messages";
// A namespace import, so the spec loads even before the catalogue words a new message.
import * as catalogue from "../../src/ui/messages";
import {
  aiFeaturesSwitch,
  answer,
  askInChat,
  chat,
  chatButton,
  conversation,
  LOCAL_ONLY,
  onHostedCopy,
  openChat,
  outOfScope,
  questionField,
  standInChat,
  turnOnAiFeatures,
  type SourceNamed,
} from "../support/ai";
import { euros, expect, setToday, test } from "../support/test";

// contracts/ui.md, insights; FR-050 – FR-053, FR-100 – FR-110; R-14, R-19, R-25, R-26.

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
  test("follows Backup in the sidebar, with only Settings after it (FR-084)", async ({ page }) => {
    await page.goto("/");
    const links = page.getByRole("navigation", { name: "Screens" }).getByRole("link");
    await expect(links.nth(5)).toHaveText("Insights");
    await expect(links).toHaveCount(7);
    await links.nth(5).click();
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
      ["This year", "2026-01-01", "2026-09-03"],
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
    await preset(page, "This year").click();
    await expect(startDate(page)).toHaveValue("2026-01-01");
    await expect(endDate(page)).toHaveValue("2026-01-15");
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
  const tooltipCategories = (page: Page) => tooltip(page).getByRole("listitem");

  /** A line of the tooltip's preview: the category, then its amount. */
  const previewLine = (name: string, cents: number) =>
    new RegExp(`^${escape(name)}.*${escape(euros(cents))}$`);

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

  test("a point's tooltip previews its spending by category, largest first", async ({ page }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "2.17", category: "Eating out" });
    await addTransaction(page, { amount: "40.00", category: "Groceries" });
    await addTransaction(page, { kind: "Income", amount: "100.00", category: "Salary" });
    await openInsights(page);
    await choosePeriod(page, "2026-08-28", "2026-09-03");

    await hoverLastPoint(page);

    await expect(tooltip(page)).toContainText(euros(4217));
    await expect(tooltipCategories(page)).toHaveText([
      previewLine("Groceries", 4000),
      previewLine("Eating out", 217),
    ]);
  });

  test("beyond five categories, the preview shows four and sums the rest", async ({ page }) => {
    await page.goto("/");
    const amounts: [string, string][] = [
      ["Groceries", "70.00"],
      ["Eating out", "60.00"],
      ["Health", "50.00"],
      ["Housing", "40.00"],
      ["Leisure", "30.00"],
      ["Shopping", "20.00"],
      ["Transport", "10.00"],
    ];
    for (const [category, amount] of amounts) await addTransaction(page, { amount, category });
    await openInsights(page);
    await choosePeriod(page, "2026-08-28", "2026-09-03");

    await hoverLastPoint(page);

    await expect(tooltipCategories(page)).toHaveText([
      previewLine("Groceries", 7000),
      previewLine("Eating out", 6000),
      previewLine("Health", 5000),
      previewLine("Housing", 4000),
      previewLine("3 more categories", 6000),
    ]);
  });

  test("the preview marks Unaccounted unknown, as the legend does (FR-052)", async ({ page }) => {
    await page.goto("/");
    // Cash holds 0.00, so stating -15.00 books an expense of 15.00 to "Unaccounted" today.
    await reconcileAccount(page, "Cash", "-15.00");
    await addTransaction(page, { amount: "40.00", category: "Groceries" });
    await openInsights(page);
    await choosePeriod(page, "2026-08-28", "2026-09-03");

    await hoverLastPoint(page);

    await expect(tooltipCategories(page)).toHaveCount(2);
    await expect(tooltipCategories(page).first()).toHaveText(previewLine("Groceries", 4000));
    const unaccounted = tooltipCategories(page).last();
    await expect(unaccounted).toContainText("Unaccounted");
    await expect(unaccounted).toContainText("unknown");
    await expect(unaccounted).toContainText(euros(1500));
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

    // This year runs to today, so its budgets are this month's.
    await preset(page, "This year").click();
    await expect(budgets(page).getByRole("heading")).toContainText("Sep 2026");
    await expect(bar(page, "Groceries")).toHaveText(barEntry("Groceries", 3000, 40000));
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

test.describe("the finance chat (FR-100 – FR-110)", () => {
  test.skip(({ baseURL }) => onHostedCopy(baseURL), LOCAL_ONLY);
  const examples = (page: Page) =>
    chat(page).getByRole("button", {
      name: new RegExp(`^(${catalogue.financeChat.examples.map(escape).join("|")})$`),
    });
  const sendButton = (page: Page) => chat(page).getByRole("button", { name: "Send" });
  const stopButton = (page: Page) => chat(page).getByRole("button", { name: "Stop" });
  const clearButton = (page: Page) =>
    chat(page).getByRole("button", { name: "Clear conversation" });
  /** The sources of the answers, each answer's in a navigation region of its own (FR-110). */
  const sources = (page: Page) => chat(page).getByRole("navigation", { name: "Sources" });
  const groceriesInSeptember: SourceNamed = {
    name: "Groceries, September 2026",
    from: "2026-09-01",
    to: "2026-09-30",
    category: { side: "expense", name: "Groceries" },
    account: null,
  };

  test("the chat button on Insights opens the chat, which names itself and offers the example questions (FR-100, FR-101)", async ({
    page,
  }) => {
    await turnOnAiFeatures(page);
    await page.goto("/#/insights");

    await chatButton(page).click();

    await expect(chat(page)).toBeVisible();
    expect(catalogue.financeChat.examples).toEqual(
      expect.arrayContaining([
        "How can I reduce my spending?",
        "Which of my subscriptions have become more expensive?",
      ]),
    );
    for (const example of catalogue.financeChat.examples) {
      await expect(chat(page).getByRole("button", { name: example, exact: true })).toBeEnabled();
    }
    await expect(conversation(page)).toHaveCount(0);
    await expect(clearButton(page)).toHaveCount(0);
  });

  test("with AI features off, says they are needed, links to Settings, and offers nothing to send (FR-100)", async ({
    page,
  }) => {
    const standIn = await standInChat(page);
    await openChat(page);

    await expect(chat(page)).toContainText(catalogue.financeChat.needsAiFeatures);
    await expect(examples(page)).toHaveCount(0);
    await expect(questionField(page)).toHaveCount(0);
    await chat(page).getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/#\/settings$/);
    expect(standIn.requests).toEqual([]);
  });

  test("with AI features turned off later, the stored conversation still shows, with nothing to send (FR-100, FR-104)", async ({
    page,
  }) => {
    await standInChat(page, answer("Groceries."));
    await turnOnAiFeatures(page);
    await openChat(page);
    await askInChat(page, "Where does my money go?");
    await expect(conversation(page)).toHaveText(["Where does my money go?", "Groceries."]);

    await page.goto("/#/settings");
    await aiFeaturesSwitch(page).click();
    await expect(aiFeaturesSwitch(page)).not.toBeChecked();
    await openChat(page);

    await expect(conversation(page)).toHaveText(["Where does my money go?", "Groceries."]);
    await expect(chat(page)).toContainText(catalogue.financeChat.needsAiFeatures);
    await expect(questionField(page)).toHaveCount(0);
  });

  test("the chat opens on every screen, with the conversation asked on another (FR-100, FR-104)", async ({
    page,
  }) => {
    await standInChat(page, answer("Groceries."));
    await turnOnAiFeatures(page);
    await openChat(page);
    await askInChat(page, "Where does my money go?");
    const kept = ["Where does my money go?", "Groceries."];
    await expect(conversation(page)).toHaveText(kept);

    await page.goto("/#/budgets");
    await expect(chat(page)).toBeHidden();
    await chatButton(page).click();

    await expect(conversation(page)).toHaveText(kept);
    await expect(questionField(page)).toBeEditable();
  });

  test("opening another screen closes the chat, by its link to Settings or by going back (FR-100)", async ({
    page,
  }) => {
    await page.goto("/");
    await chatButton(page).click();
    await expect(chat(page)).toBeVisible();

    await chat(page).getByRole("link", { name: "Settings" }).click();

    await expect(page).toHaveURL(/#\/settings$/);
    await expect(chat(page)).toBeHidden();
    await expect(main(page).getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    await chatButton(page).click();
    await expect(chat(page)).toBeVisible();
    await page.goBack();

    await expect(chat(page)).toBeHidden();
    await expect(main(page).getByRole("heading", { name: "Transactions", level: 1 })).toBeVisible();
  });

  test("an example question sends at once, with today's data, and its answer follows it as plain text (FR-101 – FR-103)", async ({
    page,
  }) => {
    const standIn = await standInChat(
      page,
      answer("Spotify Premium rose from €10.99 to €11.99.\n- <b>Check it</b>"),
    );
    await page.goto("/");
    await addTransaction(page, {
      amount: "11.99",
      category: "Leisure",
      description: "Spotify Premium",
    });
    await turnOnAiFeatures(page);
    await openChat(page);

    await chat(page)
      .getByRole("button", { name: "Which of my subscriptions have become more expensive?" })
      .click();

    await expect(conversation(page)).toHaveText([
      "Which of my subscriptions have become more expensive?",
      /^Spotify Premium rose from €10\.99 to €11\.99\.\s+- <b>Check it<\/b>$/,
    ]);
    await expect(chat(page).locator("b")).toHaveCount(0);
    await expect(sources(page)).toHaveCount(0);
    expect(standIn.requests).toHaveLength(1);
    const [sent] = standIn.requests;
    expect(sent!.question).toBe("Which of my subscriptions have become more expensive?");
    expect(sent!.turns).toEqual([]);
    expect(sent!.request.stream).toBe(true);
    expect(sent!.context.today).toBe("2026-09-03");
    expect(sent!.context.transactions.rows).toContainEqual([
      "2026-09-03",
      "Spotify Premium",
      -11.99,
      "Leisure",
    ]);
    await expect(examples(page)).toHaveCount(0);
  });

  test("an answer ends with its sources as links, named as the answer names them, leaving out those the app cannot use (FR-110)", async ({
    page,
  }) => {
    await standInChat(
      page,
      answer("You spent €40.00 on groceries in September.", [
        groceriesInSeptember,
        { ...groceriesInSeptember, name: "An account you do not have", account: "Savings" },
        { ...groceriesInSeptember, name: "September 2026", category: null },
      ]),
    );
    await turnOnAiFeatures(page);
    await openChat(page);

    await askInChat(page, "How much did I spend on groceries?");

    await expect(sources(page)).toHaveCount(1);
    await expect(sources(page)).toContainText(catalogue.financeChat.sources);
    await expect(sources(page).getByRole("link")).toHaveText([
      "Groceries, September 2026",
      "September 2026",
    ]);
    await expect(conversation(page).last()).toContainText(
      "You spent €40.00 on groceries in September.",
    );
  });

  test("a source closes the chat and opens Transactions with its filters, where the chat shows the conversation (FR-100, FR-104, FR-110)", async ({
    page,
  }) => {
    await standInChat(
      page,
      answer("You spent €40.00 on groceries in September.", [groceriesInSeptember]),
    );
    await page.goto("/");
    await addTransaction(page, { amount: "40.00", category: "Groceries", description: "Shop" });
    await addTransaction(page, { amount: "3.00", category: "Eating out", description: "Cafe" });
    await addTransaction(page, {
      amount: "25.00",
      category: "Groceries",
      date: "2026-08-20",
      description: "August shop",
    });
    await turnOnAiFeatures(page);
    await openChat(page);
    await askInChat(page, "How much did I spend on groceries?");

    await sources(page).getByRole("link", { name: "Groceries, September 2026" }).click();

    await expect(chat(page)).toBeHidden();
    const groceries = (await storedRecords<Category>(page, "categories")).find(
      (c) => c.side === "expense" && c.name === "Groceries",
    )!;
    await expect(page).toHaveURL(
      new RegExp(`#/\\?category=${groceries.id}&from=2026-09-01&to=2026-09-30$`),
    );
    const listed = page.getByRole("list", { name: "Transactions" }).getByRole("listitem");
    await expect(listed).toHaveCount(1);
    await expect(listed).toContainText("Shop");
    await expect(
      page.getByRole("region", { name: "Filters" }).getByLabel("From", { exact: true }),
    ).toHaveValue("2026-09-01");

    await chatButton(page).click();
    await expect(conversation(page)).toHaveText([
      "How much did I spend on groceries?",
      /^You spent €40\.00 on groceries in September\./,
    ]);
  });

  test("a source whose category was deleted shows its name as text, without a link (FR-110)", async ({
    page,
  }) => {
    await standInChat(
      page,
      answer("Leisure took €12.00.", [
        {
          ...groceriesInSeptember,
          name: "Leisure, September 2026",
          category: { side: "expense", name: "Leisure" },
        },
      ]),
    );
    await turnOnAiFeatures(page);
    await openChat(page);
    await askInChat(page, "What did leisure cost?");
    await expect(sources(page).getByRole("link")).toHaveText(["Leisure, September 2026"]);

    await page.goto("/#/categories");
    await main(page)
      .getByRole("tabpanel")
      .getByRole("listitem")
      .filter({ has: page.getByText("Leisure", { exact: true }) })
      .getByRole("button", { name: "Delete" })
      .click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete category" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await openChat(page);

    await expect(sources(page)).toContainText("Leisure, September 2026");
    await expect(sources(page).getByRole("link")).toHaveCount(0);
  });

  test("a typed question sends with Enter, and the next one sends the earlier turn too (FR-101, FR-102)", async ({
    page,
  }) => {
    let count = 0;
    const standIn = await standInChat(page, () => ({
      json: { inScope: true, answer: `Answer ${++count}`, sources: [] },
    }));
    await turnOnAiFeatures(page);
    await openChat(page);

    await expect(sendButton(page)).toBeDisabled();
    await askInChat(page, "Where does my money go?");
    await expect(conversation(page)).toHaveText(["Where does my money go?", "Answer 1"]);
    await expect(questionField(page)).toHaveValue("");
    await askInChat(page, "And last month?");

    await expect(conversation(page)).toHaveText([
      "Where does my money go?",
      "Answer 1",
      "And last month?",
      "Answer 2",
    ]);
    expect(standIn.requests[1]!.turns).toEqual([
      { question: "Where does my money go?", answer: "Answer 1" },
    ]);
  });

  test("while an answer is awaited, says Thinking…, offers Stop in place of Send, keeps the field editable and sends nothing more (FR-107, FR-108)", async ({
    page,
  }) => {
    const standIn = await standInChat(page, answer("Done."));
    await turnOnAiFeatures(page);
    await openChat(page);
    await askInChat(page, "First question?");
    await expect(conversation(page)).toHaveText(["First question?", "Done."]);
    standIn.hold();

    await askInChat(page, "Where does my money go?");

    await expect(conversation(page)).toHaveText([
      "First question?",
      "Done.",
      "Where does my money go?",
      catalogue.financeChat.thinking,
    ]);
    await expect(sendButton(page)).toHaveCount(0);
    await expect(stopButton(page)).toBeEnabled();
    await expect(clearButton(page)).toBeDisabled();
    await questionField(page).fill("Another question");
    await expect(questionField(page)).toHaveValue("Another question");
    await questionField(page).press("Enter");
    await expect(questionField(page)).toHaveValue("Another question");

    standIn.release();
    await expect(conversation(page)).toHaveText([
      "First question?",
      "Done.",
      "Where does my money go?",
      "Done.",
    ]);
    await expect(chat(page)).not.toContainText(catalogue.financeChat.thinking);
    await expect(stopButton(page)).toHaveCount(0);
    await expect(sendButton(page)).toBeEnabled();
    expect(standIn.requests).toHaveLength(2);
  });

  test("Stop ends the answer at once, marked Stopped and without sources, and nothing arrives later (FR-108)", async ({
    page,
  }) => {
    const standIn = await standInChat(page, answer("Late answer.", [groceriesInSeptember]));
    await turnOnAiFeatures(page);
    await openChat(page);
    standIn.hold();
    await askInChat(page, "Where does my money go?");
    await expect(stopButton(page)).toBeVisible();

    await stopButton(page).click();

    await expect(conversation(page)).toHaveText([
      "Where does my money go?",
      catalogue.financeChat.stopped,
    ]);
    await expect(sendButton(page)).toBeVisible();
    standIn.release();
    await page.waitForTimeout(300);
    await expect(conversation(page)).toHaveText([
      "Where does my money go?",
      catalogue.financeChat.stopped,
    ]);
    await expect(sources(page)).toHaveCount(0);
    await expect(chat(page).getByRole("alert")).toHaveCount(0);
    expect(await storedRecord(page, "settings", "conversation")).toEqual([
      { question: "Where does my money go?", answer: "", stopped: true, sources: [] },
    ]);
  });

  test("a question out of scope gets the fixed answer, not the model's text, and no sources (FR-103)", async ({
    page,
  }) => {
    await standInChat(page, outOfScope);
    await turnOnAiFeatures(page);
    await openChat(page);

    await askInChat(page, "What is the capital of France?");

    await expect(conversation(page)).toHaveText([
      "What is the capital of France?",
      catalogue.financeChat.outOfScope,
    ]);
    await expect(chat(page)).not.toContainText("Paris");
    await expect(sources(page)).toHaveCount(0);
  });

  test("a failure shows its message and keeps the conversation, with the question in the field (FR-104)", async ({
    page,
  }) => {
    let fail = false;
    await standInChat(page, () =>
      fail ? "unreachable" : { json: { inScope: true, answer: "Fine.", sources: [] } },
    );
    await turnOnAiFeatures(page);
    await openChat(page);
    await askInChat(page, "Am I on track?");
    await expect(conversation(page)).toHaveText(["Am I on track?", "Fine."]);
    fail = true;

    await askInChat(page, "And next month?");

    await expect(chat(page).getByRole("alert")).toHaveText(messageFor({ code: "ai-unreachable" }));
    await expect(conversation(page)).toHaveText(["Am I on track?", "Fine."]);
    await expect(questionField(page)).toHaveValue("And next month?");
  });

  test("closing and opening the chat, leaving Insights and reloading all keep the conversation (FR-104)", async ({
    page,
  }) => {
    await standInChat(page, answer("Groceries."));
    await turnOnAiFeatures(page);
    await openChat(page);
    await askInChat(page, "Where does my money go?");
    const kept = ["Where does my money go?", "Groceries."];
    await expect(conversation(page)).toHaveText(kept);

    await page.keyboard.press("Escape");
    await expect(chat(page)).toBeHidden();
    await chatButton(page).click();
    await expect(conversation(page)).toHaveText(kept);

    await page.goto("/#/");
    await openChat(page);
    await expect(conversation(page)).toHaveText(kept);

    await page.reload();
    await chatButton(page).click();
    await expect(conversation(page)).toHaveText(kept);
    await expect(examples(page)).toHaveCount(0);
  });

  test("an answer awaited while the user leaves Insights is there once the user is back (FR-108)", async ({
    page,
  }) => {
    const standIn = await standInChat(page, answer("Late answer."));
    await turnOnAiFeatures(page);
    await openChat(page);
    standIn.hold();
    await askInChat(page, "Where does my money go?");
    await expect.poll(() => standIn.requests.length).toBe(1);

    await page.goto("/#/");
    standIn.release();
    await page.waitForTimeout(300);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.goto("/#/insights");
    await chatButton(page).click();

    await expect(conversation(page)).toHaveText(["Where does my money go?", "Late answer."]);
  });

  test("Clear conversation asks first: Cancel keeps it, and confirming shows the examples again, also after a reload (FR-069, FR-104)", async ({
    page,
  }) => {
    await standInChat(page, answer("Groceries."));
    await turnOnAiFeatures(page);
    await openChat(page);
    await askInChat(page, "Where does my money go?");
    await expect(conversation(page)).toHaveCount(2);

    await clearButton(page).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toContainText(catalogue.financeChat.clearWarning);
    await confirmation.getByRole("button", { name: "Cancel" }).click();
    await expect(conversation(page)).toHaveCount(2);

    await clearButton(page).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Clear conversation" }).click();

    await expect(conversation(page)).toHaveCount(0);
    await expect(examples(page)).toHaveCount(catalogue.financeChat.examples.length);
    await expect(clearButton(page)).toHaveCount(0);
    await page.reload();
    await chatButton(page).click();
    await expect(conversation(page)).toHaveCount(0);
  });
});
