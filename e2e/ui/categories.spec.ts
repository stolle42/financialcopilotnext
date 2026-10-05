import type { Locator, Page } from "@playwright/test";
import type { Category, Side } from "../../src/domain/types";
import { messageFor } from "../../src/ui/messages";
import {
  addTransaction,
  putBudgets,
  storedBudgets,
  storedRecords,
  storedTransactions,
} from "../support/app";
import { expect, setToday, test } from "../support/test";

// contracts/ui.md, categories and shared patterns (colour palette); User Story 6 scenarios 1, 4
// and 5; FR-030, FR-032 – FR-034.

test.beforeEach(async ({ page }) => {
  await setToday(page, "2026-09-03");
});

const main = (page: Page) => page.getByRole("main");
const panel = (page: Page) => main(page).getByRole("tabpanel");
const rows = (page: Page) => panel(page).getByRole("listitem");
const row = (page: Page, name: string) =>
  rows(page).filter({ has: page.getByText(name, { exact: true }) });

/**
 * Selects a side's tab and waits until its panel is the only one. The panel it replaces stays
 * mounted, inert, until its exit transition ends, and it holds rows of the same names, such as
 * "Uncategorised".
 */
async function selectTab(page: Page, tab: "Expenses" | "Income") {
  await main(page).getByRole("tab", { name: tab }).click();
  await expect(main(page).getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
  await expect(main(page).getByRole("tabpanel", { name: tab })).toBeVisible();
  await expect(main(page).getByRole("tabpanel")).toHaveCount(1);
}

async function openCategories(page: Page, tab: "Expenses" | "Income" = "Expenses") {
  await page.goto("/#/categories");
  await expect(main(page).getByRole("heading", { name: "Categories", level: 1 })).toBeVisible();
  await selectTab(page, tab);
}

async function storedCategory(page: Page, side: Side, name: string) {
  const categories = await storedRecords<Category>(page, "categories");
  return categories.find((c) => c.side === side && c.name === name);
}

/** Opens New category on the current tab, types `name` and returns the dialog, unsaved. */
async function newCategory(page: Page, name: string): Promise<Locator> {
  await main(page).getByRole("button", { name: "New category" }).click();
  const dialog = page.getByRole("dialog", { name: "New category" });
  await dialog.getByLabel("Name").fill(name);
  return dialog;
}

async function createCategory(page: Page, name: string) {
  const dialog = await newCategory(page, name);
  await dialog.getByRole("button", { name: "Create category" }).click();
  await expect(dialog).toHaveCount(0);
}

async function rename(page: Page, name: string, newName: string) {
  await row(page, name).getByRole("button", { name: "Rename" }).click();
  const field = rows(page).getByRole("textbox", { name: "Name" });
  await expect(field).toHaveValue(name);
  await field.fill(newName);
  await field.press("Enter");
}

async function recolour(page: Page, name: string, colour: string) {
  await row(page, name).getByRole("button", { name: "Colour" }).click();
  const palette = page.getByRole("radiogroup", { name: "Colour" });
  await palette.getByRole("radio", { name: colour, exact: true }).click();
  await expect(palette).toHaveCount(0);
}

/** The palette of shared patterns: the 14 distinct seed colours in seed order, then four more. */
const PALETTE = [
  "#40c057",
  "#fd7e14",
  "#4c6ef5",
  "#15aabf",
  "#228be6",
  "#fa5252",
  "#e64980",
  "#be4bdb",
  "#12b886",
  "#adb5bd",
  "#495057",
  "#37b24d",
  "#fab005",
  "#7950f2",
  "#82c91e",
  "#e8590c",
  "#1098ad",
  "#9c36b5",
];

test("Categories is the fifth entry in the sidebar", async ({ page }) => {
  await page.goto("/");
  const links = page.getByRole("navigation", { name: "Screens" }).getByRole("link");
  await expect(links.nth(4)).toHaveText("Categories");
  await links.nth(4).click();
  await expect(page).toHaveURL(/#\/categories$/);
  await expect(main(page).getByRole("heading", { name: "Categories", level: 1 })).toBeVisible();
});

test("each side has its own tab, listed by name with the protected ones last (scenario 1)", async ({
  page,
}) => {
  await openCategories(page);
  await expect(rows(page)).toHaveText(
    [
      "Eating out",
      "Groceries",
      "Health",
      "Housing",
      "Leisure",
      "Shopping",
      "Transport",
      "Travel",
      "Utilities",
      "Uncategorised",
      "Unaccounted",
    ].map((name) => new RegExp(`^${name}`)),
  );

  await selectTab(page, "Income");

  // FR-030: the two sides never share one list.
  await expect(rows(page)).toHaveText(
    ["Gifts", "Interest", "Salary", "Uncategorised", "Unaccounted"].map(
      (name) => new RegExp(`^${name}`),
    ),
  );
});

test.describe("New category", () => {
  test("offers the 18 palette colours", async ({ page }) => {
    await openCategories(page);
    const dialog = await newCategory(page, "Pets");
    const swatches = dialog.getByRole("radiogroup", { name: "Colour" }).getByRole("radio");
    await expect(swatches).toHaveCount(18);
    for (const [index, colour] of PALETTE.entries()) {
      await expect(swatches.nth(index)).toHaveAccessibleName(colour);
    }
  });

  test("defaults to the first palette colour its side does not use yet", async ({ page }) => {
    await openCategories(page);
    // The expense seed uses the first eleven colours, so the twelfth is the first free one.
    let dialog = await newCategory(page, "Pets");
    await expect(dialog.getByRole("radio", { name: "#37b24d" })).toBeChecked();
    await dialog.getByRole("button", { name: "Create category" }).click();
    await expect(dialog).toHaveCount(0);
    expect(await storedCategory(page, "expense", "Pets")).toMatchObject({ color: "#37b24d" });

    dialog = await newCategory(page, "Garden");
    await expect(dialog.getByRole("radio", { name: "#fab005" })).toBeChecked();
    await dialog.getByRole("button", { name: "Create category" }).click();
    await expect(dialog).toHaveCount(0);

    // The income seed leaves the first palette colour free.
    await selectTab(page, "Income");
    await createCategory(page, "Refunds");
    expect(await storedCategory(page, "income", "Refunds")).toMatchObject({ color: "#40c057" });
  });

  test("takes the colour the user picks", async ({ page }) => {
    await openCategories(page);
    const dialog = await newCategory(page, "Pets");
    await dialog.getByRole("radio", { name: "#9c36b5" }).click();
    await dialog.getByRole("button", { name: "Create category" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row(page, "Pets")).toBeVisible();
    expect(await storedCategory(page, "expense", "Pets")).toMatchObject({ color: "#9c36b5" });
  });

  test("a name the side already has is refused under the field; the other side may have it (scenario 5)", async ({
    page,
  }) => {
    await openCategories(page);
    await createCategory(page, "Refunds");
    await selectTab(page, "Income");
    await createCategory(page, "Refunds");
    await expect(row(page, "Refunds")).toBeVisible();

    await selectTab(page, "Expenses");
    const dialog = await newCategory(page, " refunds");
    await dialog.getByRole("button", { name: "Create category" }).click();

    await expect(dialog.getByRole("alert")).toHaveText(
      messageFor({ code: "category-name-taken", details: { side: "expense" } }),
    );
    const refunds = (await storedRecords<Category>(page, "categories")).filter(
      (c) => c.name.trim().toLowerCase() === "refunds",
    );
    expect(refunds.map((c) => c.side).sort()).toEqual(["expense", "income"]);
  });

  test("an empty name is refused under the field", async ({ page }) => {
    await openCategories(page);
    const dialog = await newCategory(page, "  ");
    await dialog.getByRole("button", { name: "Create category" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(messageFor({ code: "category-name-empty" }));
  });
});

test.describe("rename and colour", () => {
  test("Rename edits the name in its row and saves on Enter", async ({ page }) => {
    await openCategories(page);
    await rename(page, "Eating out", "Restaurants");
    await expect(row(page, "Restaurants")).toBeVisible();
    await expect(row(page, "Eating out")).toHaveCount(0);
    expect(await storedCategory(page, "expense", "Restaurants")).toBeDefined();
  });

  test("Escape leaves the name as it was", async ({ page }) => {
    await openCategories(page);
    await row(page, "Eating out").getByRole("button", { name: "Rename" }).click();
    const field = rows(page).getByRole("textbox", { name: "Name" });
    await field.fill("Restaurants");
    await field.press("Escape");
    await expect(field).toHaveCount(0);
    await expect(row(page, "Eating out")).toBeVisible();
    expect(await storedCategory(page, "expense", "Restaurants")).toBeUndefined();
  });

  test("a name its side already has is refused under the field", async ({ page }) => {
    await openCategories(page);
    await rename(page, "Eating out", "groceries");
    await expect(rows(page).getByRole("alert")).toHaveText(
      messageFor({ code: "category-name-taken", details: { side: "expense" } }),
    );
    expect(await storedCategory(page, "expense", "Eating out")).toBeDefined();
  });

  test("Colour saves the swatch picked from the palette", async ({ page }) => {
    await openCategories(page);
    await recolour(page, "Eating out", "#e8590c");
    expect(await storedCategory(page, "expense", "Eating out")).toMatchObject({
      color: "#e8590c",
    });
  });
});

test.describe("protected categories (scenario 4, FR-033)", () => {
  for (const tab of ["Expenses", "Income"] as const) {
    test(`on ${tab}, Delete explains why instead of asking`, async ({ page }) => {
      await openCategories(page, tab);
      for (const [name, role] of [
        ["Uncategorised", "uncategorised"],
        ["Unaccounted", "unaccounted"],
      ] as const) {
        await row(page, name).getByRole("button", { name: "Delete" }).click();
        await expect(page.getByRole("alertdialog")).toHaveCount(0);
        await expect(main(page).getByRole("alert")).toHaveText(
          messageFor({ code: "category-protected", details: { role } }),
        );
        await expect(row(page, name)).toBeVisible();
      }
    });
  }

  test("rename and recolour like any other", async ({ page }) => {
    await openCategories(page, "Income");
    await rename(page, "Unaccounted", "Unexplained");
    await expect(row(page, "Unexplained")).toBeVisible();
    await recolour(page, "Unexplained", "#1098ad");
    const categories = await storedRecords<Category>(page, "categories");
    expect(categories.find((c) => c.side === "income" && c.role === "unaccounted")).toMatchObject({
      name: "Unexplained",
      color: "#1098ad",
    });
  });
});

test.describe("deleting (FR-034)", () => {
  test("the confirmation states the counts, then the transactions move and the limit goes", async ({
    page,
  }) => {
    await page.goto("/");
    for (const amount of ["12.00", "8.50", "20.00"])
      await addTransaction(page, { amount, category: "Eating out" });
    await putBudgets(page, { "Eating out": 15000 });
    await openCategories(page);

    await row(page, "Eating out").getByRole("button", { name: "Delete" }).click();

    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toContainText("3 transactions");
    await expect(confirmation).toContainText("Uncategorised");
    await expect(confirmation).toContainText(/monthly limit/i);
    await confirmation.getByRole("button", { name: "Delete category" }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(row(page, "Eating out")).toHaveCount(0);
    const uncategorised = (await storedRecords<Category>(page, "categories")).find(
      (c) => c.side === "expense" && c.role === "uncategorised",
    )!;
    const transactions = await storedTransactions(page);
    expect(transactions).toHaveLength(3);
    expect(
      transactions.every((t) => t.kind === "expense" && t.categoryId === uncategorised.id),
    ).toBe(true);
    expect(await storedBudgets(page)).toEqual([]);
  });

  test("names one transaction in the singular, and no limit when there is none", async ({
    page,
  }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "40.00", category: "Groceries" });
    await openCategories(page);

    await row(page, "Groceries").getByRole("button", { name: "Delete" }).click();

    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toContainText(/\b1 transaction(?!s)/);
    await expect(confirmation).not.toContainText(/limit/i);
  });

  test("cancelling keeps the category and its transactions", async ({ page }) => {
    await page.goto("/");
    await addTransaction(page, { amount: "40.00", category: "Groceries" });
    await openCategories(page);

    await row(page, "Groceries").getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(row(page, "Groceries")).toBeVisible();
    const groceries = await storedCategory(page, "expense", "Groceries");
    expect(await storedTransactions(page)).toEqual([
      expect.objectContaining({ categoryId: groceries!.id }),
    ]);
  });
});
