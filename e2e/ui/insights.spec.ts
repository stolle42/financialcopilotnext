import type { Page } from "@playwright/test";
import { addTransaction } from "../support/app";
import { euros, expect, setToday, test } from "../support/test";

// contracts/ui.md, insights; FR-050, FR-051, FR-053; R-14, R-19.

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
  test("is the second entry in the sidebar", async ({ page }) => {
    await page.goto("/");
    const links = page.getByRole("navigation", { name: "Screens" }).getByRole("link");
    await expect(links.nth(1)).toHaveText("Insights");
    await links.nth(1).click();
    await expect(page).toHaveURL(/#\/insights$/);
    await expect(main(page).getByRole("heading", { name: "Insights", level: 1 })).toBeVisible();
  });

  test("shows its sections in the order of the contract", async ({ page }) => {
    await openInsights(page);
    const regions = main(page).getByRole("region");
    const names = ["Period", "Spending over time", "Expenses by category", "Income by category"];
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
