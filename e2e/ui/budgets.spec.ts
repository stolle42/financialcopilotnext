import type { Locator, Page } from "@playwright/test";
import type { Category } from "../../src/domain/types";
import { messageFor } from "../../src/ui/messages";
import { budgetRow, storedBudgets, storedRecords } from "../support/app";
import { expect, test } from "../support/test";

// contracts/ui.md, budgets; FR-040, FR-041; User Story 4 scenarios 4 and 5.

const main = (page: Page) => page.getByRole("main");
const limitField = (row: Locator) => row.getByLabel("Monthly limit");
const remove = (row: Locator) => row.getByRole("button", { name: "Remove" });

const BUDGETABLE = [
  "Eating out",
  "Groceries",
  "Health",
  "Housing",
  "Leisure",
  "Shopping",
  "Transport",
  "Travel",
  "Utilities",
];

async function openBudgets(page: Page) {
  await page.goto("/#/budgets");
  await expect(main(page).getByRole("heading", { name: "Budgets", level: 1 })).toBeVisible();
}

async function categoryId(page: Page, name: string): Promise<string> {
  const categories = await storedRecords<Category>(page, "categories");
  return categories.find((c) => c.side === "expense" && c.name === name)!.id;
}

/** Types `text` into the limit of `name` and saves it with Enter. */
async function typeLimit(page: Page, name: string, text: string) {
  const field = limitField(budgetRow(page, name));
  await field.fill(text);
  await field.press("Enter");
}

test.describe("the screen", () => {
  test("is the fourth entry in the sidebar", async ({ page }) => {
    await page.goto("/");
    const links = page.getByRole("navigation", { name: "Screens" }).getByRole("link");
    await expect(links).toHaveText(["Transactions", "Insights", "Import", "Budgets", "Accounts"]);
    await links.nth(3).click();
    await expect(page).toHaveURL(/#\/budgets$/);
    await expect(main(page).getByRole("heading", { name: "Budgets", level: 1 })).toBeVisible();
    await expect(links.nth(3)).toHaveAttribute("aria-current", "page");
  });

  test("lists the ordinary expense categories by name, with no limit set yet", async ({ page }) => {
    await openBudgets(page);
    await expect(main(page).getByRole("listitem")).toHaveText(
      BUDGETABLE.map((name) => new RegExp(`^${name}`)),
    );
    for (const name of BUDGETABLE) {
      await expect(limitField(budgetRow(page, name))).toHaveValue("");
      await expect(remove(budgetRow(page, name))).toHaveCount(0);
    }
    expect(await storedBudgets(page)).toEqual([]);
  });

  test("offers no budget on income or protected categories (scenario 4)", async ({ page }) => {
    await openBudgets(page);
    await expect(main(page).getByRole("listitem")).toHaveCount(BUDGETABLE.length);
    for (const name of ["Uncategorised", "Unaccounted", "Salary", "Interest", "Gifts"]) {
      await expect(main(page)).not.toContainText(name);
    }
  });
});

test.describe("saving a limit (FR-040)", () => {
  test("saves on Enter and shows the limit as an amount, with Remove (scenario 1)", async ({
    page,
  }) => {
    await openBudgets(page);
    const groceries = budgetRow(page, "Groceries");

    await typeLimit(page, "Groceries", "400");

    await expect(limitField(groceries)).toHaveValue("400.00");
    await expect(remove(groceries)).toBeVisible();
    await expect
      .poll(() => storedBudgets(page))
      .toEqual([{ categoryId: await categoryId(page, "Groceries"), limitCents: 40000 }]);
    // Only the budgeted category has a limit to remove.
    await expect(main(page).getByRole("button", { name: "Remove" })).toHaveCount(1);
  });

  test("saves when the field loses focus", async ({ page }) => {
    await openBudgets(page);
    const transport = limitField(budgetRow(page, "Transport"));

    await transport.fill("80.5");
    await transport.press("Tab");

    await expect(transport).toHaveValue("80.50");
    await expect(remove(budgetRow(page, "Transport"))).toBeVisible();
    await expect
      .poll(() => storedBudgets(page))
      .toEqual([{ categoryId: await categoryId(page, "Transport"), limitCents: 8050 }]);
  });

  test("changes a limit the user already set, keeping one per category (scenario 5)", async ({
    page,
  }) => {
    await openBudgets(page);
    await typeLimit(page, "Groceries", "400.00");
    await expect.poll(() => storedBudgets(page)).toHaveLength(1);

    await typeLimit(page, "Groceries", "450.00");

    await expect(limitField(budgetRow(page, "Groceries"))).toHaveValue("450.00");
    await expect
      .poll(() => storedBudgets(page))
      .toEqual([{ categoryId: await categoryId(page, "Groceries"), limitCents: 45000 }]);
  });

  test("keeps each category's limit apart", async ({ page }) => {
    await openBudgets(page);
    await typeLimit(page, "Groceries", "400.00");
    await typeLimit(page, "Transport", "80.00");

    await expect(limitField(budgetRow(page, "Groceries"))).toHaveValue("400.00");
    await expect(limitField(budgetRow(page, "Transport"))).toHaveValue("80.00");
    await expect(limitField(budgetRow(page, "Housing"))).toHaveValue("");
    await expect.poll(() => storedBudgets(page)).toHaveLength(2);
  });

  test("a limit is still there after a reload", async ({ page }) => {
    await openBudgets(page);
    await typeLimit(page, "Groceries", "400.00");
    await expect.poll(() => storedBudgets(page)).toHaveLength(1);

    await page.reload();

    await expect(limitField(budgetRow(page, "Groceries"))).toHaveValue("400.00");
    await expect(remove(budgetRow(page, "Groceries"))).toBeVisible();
    await expect(remove(budgetRow(page, "Transport"))).toHaveCount(0);
  });

  test("leaving a field that was never filled is no error and saves nothing", async ({ page }) => {
    await openBudgets(page);
    const groceries = limitField(budgetRow(page, "Groceries"));

    await groceries.focus();
    await groceries.press("Tab");

    await expect(main(page).getByRole("alert")).toHaveCount(0);
    await expect(groceries).toHaveValue("");
    expect(await storedBudgets(page)).toEqual([]);
  });
});

test.describe("refusals, beside the field (FR-040, FR-068)", () => {
  test("0.00 is refused under the field, which keeps what was typed, and nothing is saved", async ({
    page,
  }) => {
    await openBudgets(page);
    const groceries = budgetRow(page, "Groceries");

    await typeLimit(page, "Groceries", "0.00");

    await expect(groceries.getByRole("alert")).toHaveText(
      messageFor({ code: "budget-limit-invalid" }),
    );
    await expect(limitField(groceries)).toHaveAttribute("aria-invalid", "true");
    await expect(limitField(groceries)).toHaveValue("0.00");
    await expect(remove(groceries)).toHaveCount(0);
    // The refusal belongs to its own row only.
    await expect(main(page).getByRole("alert")).toHaveCount(1);
    expect(await storedBudgets(page)).toEqual([]);
  });

  const UNREADABLE: [string, string][] = [
    ["abc", "text that is not an amount"],
    ["-5.00", "a negative amount"],
    ["12.345", "three decimals"],
  ];
  for (const [text, what] of UNREADABLE) {
    test(`${text}, ${what}, is refused the same way`, async ({ page }) => {
      await openBudgets(page);

      await typeLimit(page, "Housing", text);

      await expect(budgetRow(page, "Housing").getByRole("alert")).toHaveText(
        messageFor({ code: "budget-limit-invalid" }),
      );
      expect(await storedBudgets(page)).toEqual([]);
    });
  }

  test("a refused change leaves the saved limit as it was", async ({ page }) => {
    await openBudgets(page);
    await typeLimit(page, "Groceries", "400.00");
    await expect.poll(() => storedBudgets(page)).toHaveLength(1);

    await typeLimit(page, "Groceries", "0");

    await expect(budgetRow(page, "Groceries").getByRole("alert")).toBeVisible();
    await expect(remove(budgetRow(page, "Groceries"))).toBeVisible();
    expect(await storedBudgets(page)).toEqual([
      { categoryId: await categoryId(page, "Groceries"), limitCents: 40000 },
    ]);
  });

  test("clearing the field of a saved limit is refused: Remove is the way to remove it", async ({
    page,
  }) => {
    await openBudgets(page);
    await typeLimit(page, "Groceries", "400.00");
    await expect.poll(() => storedBudgets(page)).toHaveLength(1);

    await typeLimit(page, "Groceries", "");

    await expect(budgetRow(page, "Groceries").getByRole("alert")).toHaveText(
      messageFor({ code: "budget-limit-invalid" }),
    );
    expect(await storedBudgets(page)).toHaveLength(1);
  });

  test("the message goes away once a valid limit is saved", async ({ page }) => {
    await openBudgets(page);
    const groceries = budgetRow(page, "Groceries");
    await typeLimit(page, "Groceries", "0.00");
    await expect(groceries.getByRole("alert")).toBeVisible();

    await typeLimit(page, "Groceries", "10.00");

    await expect(groceries.getByRole("alert")).toHaveCount(0);
    await expect(limitField(groceries)).not.toHaveAttribute("aria-invalid", "true");
    await expect
      .poll(() => storedBudgets(page))
      .toEqual([{ categoryId: await categoryId(page, "Groceries"), limitCents: 1000 }]);
  });
});

test.describe("Remove (FR-040, scenario 5)", () => {
  test("removes the limit, empties the field and offers no Remove any more", async ({ page }) => {
    await openBudgets(page);
    await typeLimit(page, "Groceries", "400.00");
    await typeLimit(page, "Transport", "80.00");
    await expect.poll(() => storedBudgets(page)).toHaveLength(2);

    await remove(budgetRow(page, "Groceries")).click();

    await expect(limitField(budgetRow(page, "Groceries"))).toHaveValue("");
    await expect(remove(budgetRow(page, "Groceries"))).toHaveCount(0);
    await expect(limitField(budgetRow(page, "Transport"))).toHaveValue("80.00");
    await expect
      .poll(() => storedBudgets(page))
      .toEqual([{ categoryId: await categoryId(page, "Transport"), limitCents: 8000 }]);
  });

  test("clears a refusal that was showing", async ({ page }) => {
    await openBudgets(page);
    await typeLimit(page, "Groceries", "400.00");
    await expect.poll(() => storedBudgets(page)).toHaveLength(1);
    await typeLimit(page, "Groceries", "0");
    await expect(budgetRow(page, "Groceries").getByRole("alert")).toBeVisible();

    await remove(budgetRow(page, "Groceries")).click();

    await expect(main(page).getByRole("alert")).toHaveCount(0);
    await expect(limitField(budgetRow(page, "Groceries"))).toHaveValue("");
    await expect.poll(() => storedBudgets(page)).toEqual([]);
  });

  test("a removed limit stays removed after a reload", async ({ page }) => {
    await openBudgets(page);
    await typeLimit(page, "Groceries", "400.00");
    await expect.poll(() => storedBudgets(page)).toHaveLength(1);
    await remove(budgetRow(page, "Groceries")).click();
    await expect.poll(() => storedBudgets(page)).toEqual([]);

    await page.reload();

    await expect(limitField(budgetRow(page, "Groceries"))).toHaveValue("");
    await expect(main(page).getByRole("button", { name: "Remove" })).toHaveCount(0);
  });
});
