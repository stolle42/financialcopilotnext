import type { Locator, Page } from "@playwright/test";
import {
  addTransaction,
  expectCategory,
  openTransactionForm,
  shownCategory,
  storedRecords,
} from "../support/app";
import type { Category } from "../../src/domain/types";
import { importWithProfile, saveMyBankProfile } from "../support/import";
import { expect, setToday, test } from "../support/test";

// contracts/ui.md, category picker (FR-148): the search of the picker, in each place it is used.
// Every place gets the same tests, so one picker looks and behaves alike everywhere (FR-065).

const reviewList = (page: Page) => page.getByRole("region", { name: "Rows to review" });
const vendorGroups = (page: Page) =>
  reviewList(page).getByRole("group", { name: /^(?!Assignment of ).+, (expenses|income)$/ });
const plainRows = (page: Page) =>
  reviewList(page).getByRole("list", { name: "Plain rows" }).getByRole("listitem");

/** The expense categories of the seed in the list's order, with the one "Uncategorised" last. */
const EXPENSE_LIST = [
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
];

interface Place {
  name: string;
  /** Opens the place and returns the scope holding one category picker, and what it shows. */
  open(page: Page): Promise<{ scope: Locator; shown: string }>;
}

const places: Place[] = [
  {
    name: "the transaction form",
    async open(page) {
      await page.goto("/");
      return { scope: await openTransactionForm(page), shown: "Uncategorised" };
    },
  },
  {
    name: "a Category cell on Transactions",
    async open(page) {
      await page.goto("/");
      await addTransaction(page, { amount: "40.00", category: "Groceries", description: "Shop" });
      const row = page.getByRole("listitem").filter({ hasText: "Shop" });
      await row.getByRole("button", { name: "Groceries", exact: true }).click();
      return { scope: row, shown: "Groceries" };
    },
  },
  {
    name: "a review row",
    async open(page) {
      await saveMyBankProfile(page);
      await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
      return { scope: plainRows(page).first(), shown: "Uncategorised" };
    },
  },
  {
    name: "a review group",
    async open(page) {
      await saveMyBankProfile(page);
      await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
      return { scope: vendorGroups(page).first(), shown: "Uncategorised" };
    },
  },
];

const field = (scope: Locator) => scope.getByRole("combobox", { name: "Category", exact: true });
const options = (page: Page) => page.getByRole("option");
const names = async (page: Page) =>
  (await options(page).allTextContents()).map((text) => text.trim());

test.beforeEach(async ({ page }) => {
  await setToday(page, "2026-09-20");
});

for (const place of places) {
  test.describe(`the category picker in ${place.name}`, () => {
    test("opens on every category of the side, with New category… last, and no Unaccounted", async ({
      page,
    }) => {
      const { scope } = await place.open(page);
      await field(scope).click();
      await expect(options(page).first()).toBeVisible();
      const list = await names(page);
      // A review group of income, if the fixture's first group is one, lists the income side.
      const side = list.includes("Salary") ? "income" : "expense";
      if (side === "expense") expect(list).toEqual([...EXPENSE_LIST, "New category…"]);
      expect(list.at(-1)).toBe("New category…");
      expect(list).not.toContain("Unaccounted");
      expect(list).not.toContain("");
    });

    test("typing keeps the categories whose name contains the text, in the list's order", async ({
      page,
    }) => {
      const { scope } = await place.open(page);
      await field(scope).click();
      await field(scope).fill("ou");
      await expect.poll(() => names(page)).toEqual(["Eating out", "Housing", "New category…"]);
    });

    test("ignores case and the spaces around the text", async ({ page }) => {
      const { scope } = await place.open(page);
      await field(scope).click();
      await field(scope).fill("  GRO ");
      await expect.poll(() => names(page)).toEqual(["Groceries", "New category…"]);
    });

    test("highlights the first match, and the arrow keys and Enter pick another", async ({
      page,
    }) => {
      const { scope } = await place.open(page);
      await field(scope).click();
      await field(scope).fill("ou");
      await expect(options(page).first()).toHaveText("Eating out");
      // The picker exposes the highlighted item to assistive technology and to tests alike.
      const first = await options(page).first().getAttribute("id");
      await expect(field(scope)).toHaveAttribute("aria-activedescendant", first!);

      await field(scope).press("ArrowDown");
      const second = await options(page).nth(1).getAttribute("id");
      await expect(field(scope)).toHaveAttribute("aria-activedescendant", second!);
      await field(scope).press("Enter");

      await expect(page.getByRole("listbox")).toHaveCount(0);
      await expectCategory(scope, "Housing");
    });

    test("Enter picks the first match when the arrow keys were not used", async ({ page }) => {
      const { scope } = await place.open(page);
      await field(scope).click();
      await field(scope).fill("gro");
      await field(scope).press("Enter");
      await expect(page.getByRole("listbox")).toHaveCount(0);
      await expectCategory(scope, "Groceries");
    });

    test("Escape closes the list and leaves the field as it was", async ({ page }) => {
      const { scope, shown } = await place.open(page);
      await field(scope).click();
      await field(scope).fill("gro");
      await expect(options(page).first()).toBeVisible();
      await field(scope).press("Escape");

      await expect(page.getByRole("listbox")).toHaveCount(0);
      expect(await shownCategory(scope)).toBe(shown);
    });

    test("says No category matches, still offering New category…, and never finds Unaccounted", async ({
      page,
    }) => {
      const { scope } = await place.open(page);
      await field(scope).click();
      await field(scope).fill("unacc");
      await expect(page.getByText("No category matches")).toBeVisible();
      expect(await names(page)).toEqual(["New category…"]);
    });
  });
}

// New category… (FR-149): the last item of every picker, opening Categories' own dialog.

const newCategoryItem = (page: Page) => page.getByRole("option", { name: "New category…" });
const newCategoryDialog = (page: Page) => page.getByRole("dialog", { name: "New category" });
const header = (page: Page) => page.getByRole("region", { name: "Batch" });
const current = (page: Page) => reviewList(page).locator('[aria-current="true"]');

/** The first palette colour each side of the seed does not use yet (categories.spec.ts). */
const FIRST_FREE = { expense: "#37b24d", income: "#40c057" } as const;

for (const place of places) {
  test.describe(`New category… in ${place.name}`, () => {
    test("is the only item when nothing matches, highlighted, and Enter opens the dialog named by the text", async ({
      page,
    }) => {
      const { scope } = await place.open(page);
      await field(scope).click();
      await field(scope).fill("Pets");
      await expect(page.getByText("No category matches")).toBeVisible();
      await expect(options(page)).toHaveCount(1);
      await expect(newCategoryItem(page)).toBeVisible();
      const id = await newCategoryItem(page).getAttribute("id");
      await expect(field(scope)).toHaveAttribute("aria-activedescendant", id!);

      await field(scope).press("Enter");

      await expect(newCategoryDialog(page)).toBeVisible();
      await expect(newCategoryDialog(page).getByLabel("Name")).toHaveValue("Pets");
    });

    test("opens Categories' dialog with the first free colour, and creating picks the new category", async ({
      page,
    }) => {
      const { scope } = await place.open(page);
      await field(scope).click();
      const side = (await names(page)).includes("Salary") ? "income" : "expense";
      await newCategoryItem(page).click();

      const dialog = newCategoryDialog(page);
      await expect(dialog.getByRole("radio", { name: FIRST_FREE[side] })).toBeChecked();
      await dialog.getByLabel("Name").fill("Pets");
      await dialog.getByRole("button", { name: "Create category" }).click();

      await expect(dialog).toHaveCount(0);
      await expectCategory(scope, "Pets");
      const stored = (await storedRecords<Category>(page, "categories")).find(
        (c) => c.side === side && c.name === "Pets",
      );
      expect(stored).toMatchObject({ color: FIRST_FREE[side] });
    });

    test("Cancel leaves the field as it was, and creates nothing", async ({ page }) => {
      const { scope, shown } = await place.open(page);
      await field(scope).click();
      await newCategoryItem(page).click();
      const dialog = newCategoryDialog(page);
      await dialog.getByLabel("Name").fill("Pets");

      await dialog.getByRole("button", { name: "Cancel" }).click();

      await expect(dialog).toHaveCount(0);
      expect(await shownCategory(scope)).toBe(shown);
      const all = await storedRecords<Category>(page, "categories");
      expect(all.some((c) => c.name === "Pets")).toBe(false);
    });
  });
}

test("the cell of Transactions saves the new category at once", async ({ page }) => {
  await page.goto("/");
  await addTransaction(page, { amount: "40.00", category: "Groceries", description: "Shop" });
  const row = page.getByRole("listitem").filter({ hasText: "Shop" });
  await row.getByRole("button", { name: "Groceries", exact: true }).click();
  await field(row).click();
  await newCategoryItem(page).click();
  const dialog = newCategoryDialog(page);
  await dialog.getByLabel("Name").fill("Pets");
  await dialog.getByRole("button", { name: "Create category" }).click();
  await expect(dialog).toHaveCount(0);

  const pets = (await storedRecords<Category>(page, "categories")).find((c) => c.name === "Pets")!;
  await expect
    .poll(async () => {
      const [saved] = await storedRecords<{ kind: string; categoryId?: string }>(
        page,
        "transactions",
      );
      return saved?.categoryId;
    })
    .toBe(pets.id);
  await expect(row.getByRole("button", { name: "Pets", exact: true })).toBeVisible();
});

test("opening the dialog from the current review item leaves it current and not seen (FR-151)", async ({
  page,
}) => {
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
  const count = await header(page).textContent();
  expect(count).toMatch(/\d+ not seen yet/);
  const item = current(page);
  await expect(item).toHaveCount(1);
  const text = await item.textContent();

  await field(item).click();
  await newCategoryItem(page).click();
  await expect(newCategoryDialog(page)).toBeVisible();
  await newCategoryDialog(page).getByRole("button", { name: "Cancel" }).click();

  await expect(newCategoryDialog(page)).toHaveCount(0);
  await expect(current(page)).toHaveCount(1);
  expect(await current(page).textContent()).toBe(text);
  await expect(header(page)).toHaveText(count!);
  await expect(page.getByRole("img", { name: "Seen" })).toHaveCount(0);
});
