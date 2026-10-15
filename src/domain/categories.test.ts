import { describe, expect, test } from "vitest";
import {
  createCategory,
  deleteCategory,
  deletionImpact,
  pickerCategories,
  protectedCategory,
  recolourCategory,
  renameCategory,
  sortCategories,
} from "./categories";
import { seedState } from "./seed";
import { applyValid, changesOf, idCounter, testContext } from "./testing";
import type {
  Account,
  Category,
  CategoryRole,
  ParsedRow,
  PendingRow,
  Side,
  State,
  Transaction,
} from "./types";

const categories = seedState(idCounter()).categories;
const names = (list: readonly Category[]) => list.map((c) => c.name);

describe("protectedCategory", () => {
  test("finds a protected category by role, even after it is renamed", () => {
    const renamed = categories.map((c) =>
      c.side === "expense" && c.role === "uncategorised" ? { ...c, name: "To sort" } : c,
    );
    const found = protectedCategory(renamed, "expense", "uncategorised");
    expect(found).toMatchObject({ name: "To sort", side: "expense", role: "uncategorised" });
  });

  test("keeps the sides apart", () => {
    expect(protectedCategory(categories, "income", "unaccounted")).toMatchObject({
      side: "income",
      role: "unaccounted",
    });
  });
});

describe("sortCategories (list order)", () => {
  test("lists one side by name, ignoring case, with Uncategorised and Unaccounted last", () => {
    const withLowerCase = [...categories, { ...categories[0]!, id: "x", name: "atm fees" }];
    expect(names(sortCategories(withLowerCase, "expense"))).toEqual([
      "atm fees",
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
    ]);
  });

  test("never mixes in the other side (FR-030)", () => {
    expect(names(sortCategories(categories, "income"))).toEqual([
      "Gifts",
      "Interest",
      "Salary",
      "Uncategorised",
      "Unaccounted",
    ]);
  });
});

describe("pickerCategories (FR-030)", () => {
  test("offers the side's categories without Unaccounted", () => {
    expect(names(pickerCategories(categories, "income"))).toEqual([
      "Gifts",
      "Interest",
      "Salary",
      "Uncategorised",
    ]);
  });
});

// FR-032 – FR-035, data-model.md (state transitions), R-12 item 4; User Story 6 scenarios 3–5.

const giro: Account = { id: "giro", name: "Giro", type: "checking", openingBalanceCents: 0 };

function categoryNamed(state: State, side: Side, name: string): Category {
  const found = state.categories.find((c) => c.side === side && c.name === name);
  if (!found) throw new Error(`No ${side} category ${name}`);
  return found;
}

const roleOf = (state: State, side: Side, role: CategoryRole) =>
  protectedCategory(state.categories, side, role);

/** The seed state with a second account, Giro, for transfers. */
function seeded(): State {
  return applyValid(seedState(idCounter()), { accounts: { put: [giro] } });
}

/** `count` transactions of 10.00 on Cash in `category`, after those `state` already has. */
function entriesIn(state: State, category: Category, count: number): Transaction[] {
  const cashId = state.accounts.find((a) => a.name === "Cash")!.id;
  return Array.from({ length: count }, (_, i): Transaction => {
    const seq = state.transactions.length + i + 1;
    return {
      id: `${category.name}-${i + 1}`,
      seq,
      date: "2026-09-03",
      amountCents: 1000,
      accountId: cashId,
      description: "",
      kind: category.side,
      categoryId: category.id,
    };
  });
}

function withTransactions(state: State, transactions: Transaction[]): State {
  return applyValid(state, { transactions: { put: transactions } });
}

const PROTECTED: [Side, CategoryRole][] = [
  ["expense", "uncategorised"],
  ["expense", "unaccounted"],
  ["income", "uncategorised"],
  ["income", "unaccounted"],
];

describe("createCategory (FR-032)", () => {
  test("adds an ordinary category with a new id, a trimmed name and its colour", () => {
    const state = seeded();
    const input = { side: "expense" as const, name: "  Pets ", color: "#82c91e" };

    const changes = changesOf(createCategory(state, input, testContext()));

    expect(changes).toEqual({
      categories: {
        put: [{ id: "new-1", side: "expense", name: "Pets", color: "#82c91e", role: null }],
      },
    });
    const next = applyValid(state, changes);
    expect(names(sortCategories(next.categories, "expense"))).toContain("Pets");
  });

  test("allows a name the other side already has (scenario 5)", () => {
    const state = seeded();
    const refunds = { name: "Refunds", color: "#82c91e" };
    // One context for both, as the app has one id generator: two would both hand out "new-1".
    const context = testContext();
    const withExpense = applyValid(
      state,
      changesOf(createCategory(state, { side: "expense", ...refunds }, context)),
    );

    const next = applyValid(
      withExpense,
      changesOf(createCategory(withExpense, { side: "income", ...refunds }, context)),
    );

    expect(categoryNamed(next, "expense", "Refunds").side).toBe("expense");
    expect(categoryNamed(next, "income", "Refunds").side).toBe("income");
  });

  test("refuses a name its side already has, ignoring case and spaces (scenario 5)", () => {
    const state = seeded();
    const input = { side: "expense" as const, name: "Refunds", color: "#82c91e" };
    const withRefunds = applyValid(state, changesOf(createCategory(state, input, testContext())));

    const again = { side: "expense" as const, name: " refunds ", color: "#e8590c" };

    expect(createCategory(withRefunds, again, testContext())).toEqual({
      code: "category-name-taken",
      details: { side: "expense" },
    });
  });

  test("refuses the name of a protected category of its side", () => {
    const input = { side: "income" as const, name: "UNCATEGORISED", color: "#82c91e" };
    expect(createCategory(seeded(), input, testContext())).toEqual({
      code: "category-name-taken",
      details: { side: "income" },
    });
  });

  test.each(["", "   "])("refuses the empty name %j", (name) => {
    const input = { side: "expense" as const, name, color: "#82c91e" };
    expect(createCategory(seeded(), input, testContext())).toEqual({
      code: "category-name-empty",
    });
  });

  test.each(["82c91e", "#82c91", "#82c91e0", "#82c9zz", "green", ""])(
    "refuses the colour %j, which is not #rrggbb",
    (color) => {
      const input = { side: "expense" as const, name: "Pets", color };
      expect(createCategory(seeded(), input, testContext())).toEqual({
        code: "category-color-invalid",
      });
    },
  );
});

describe("renameCategory (FR-032, FR-033)", () => {
  test("renames a category in place, so everything that refers to it shows the new name", () => {
    const state = seeded();
    const eatingOut = categoryNamed(state, "expense", "Eating out");

    const next = applyValid(state, changesOf(renameCategory(state, eatingOut.id, " Restaurants ")));

    expect(next.categories.find((c) => c.id === eatingOut.id)).toEqual({
      ...eatingOut,
      name: "Restaurants",
    });
  });

  test("lets a category keep its own name, in another case", () => {
    const state = seeded();
    const groceries = categoryNamed(state, "expense", "Groceries");

    const next = applyValid(state, changesOf(renameCategory(state, groceries.id, "GROCERIES")));

    expect(next.categories.find((c) => c.id === groceries.id)?.name).toBe("GROCERIES");
  });

  test("refuses another category's name on its side, and an empty name", () => {
    const state = seeded();
    const groceries = categoryNamed(state, "expense", "Groceries");

    expect(renameCategory(state, groceries.id, "eating out")).toEqual({
      code: "category-name-taken",
      details: { side: "expense" },
    });
    expect(renameCategory(state, groceries.id, " ")).toEqual({ code: "category-name-empty" });
  });

  test("allows a name the other side has", () => {
    const state = seeded();
    const gifts = categoryNamed(state, "income", "Gifts");

    const next = applyValid(state, changesOf(renameCategory(state, gifts.id, "Groceries")));

    expect(categoryNamed(next, "income", "Groceries").id).toBe(gifts.id);
  });

  test.each(PROTECTED)(
    "renames %s %s, which stays protected by its role (scenario 4)",
    (side, role) => {
      const state = seeded();
      const category = roleOf(state, side, role);

      const next = applyValid(state, changesOf(renameCategory(state, category.id, "To sort")));

      expect(roleOf(next, side, role)).toEqual({ ...category, name: "To sort" });
    },
  );
});

describe("recolourCategory (FR-032, FR-033)", () => {
  test("gives a category another colour and keeps its name", () => {
    const state = seeded();
    const eatingOut = categoryNamed(state, "expense", "Eating out");

    const next = applyValid(state, changesOf(recolourCategory(state, eatingOut.id, "#e8590c")));

    expect(next.categories.find((c) => c.id === eatingOut.id)).toEqual({
      ...eatingOut,
      color: "#e8590c",
    });
  });

  test.each(PROTECTED)("recolours %s %s (scenario 4)", (side, role) => {
    const state = seeded();
    const category = roleOf(state, side, role);

    const next = applyValid(state, changesOf(recolourCategory(state, category.id, "#9c36b5")));

    expect(roleOf(next, side, role).color).toBe("#9c36b5");
  });

  test("refuses a colour that is not #rrggbb", () => {
    const state = seeded();
    const groceries = categoryNamed(state, "expense", "Groceries");
    expect(recolourCategory(state, groceries.id, "red")).toEqual({
      code: "category-color-invalid",
    });
  });
});

describe("deletionImpact (FR-034)", () => {
  test("counts the category's transactions and says whether its budget goes", () => {
    let state = seeded();
    const eatingOut = categoryNamed(state, "expense", "Eating out");
    const groceries = categoryNamed(state, "expense", "Groceries");
    state = withTransactions(state, entriesIn(state, eatingOut, 3));
    state = withTransactions(state, entriesIn(state, groceries, 2));
    state = applyValid(state, {
      budgets: { put: [{ categoryId: eatingOut.id, limitCents: 15000 }] },
    });

    expect(deletionImpact(state, eatingOut.id)).toEqual({
      transactionCount: 3,
      budgetRemoved: true,
    });
    expect(deletionImpact(state, groceries.id)).toEqual({
      transactionCount: 2,
      budgetRemoved: false,
    });
    expect(deletionImpact(state, categoryNamed(state, "expense", "Travel").id)).toEqual({
      transactionCount: 0,
      budgetRemoved: false,
    });
  });
});

describe("deleteCategory (FR-033, FR-034)", () => {
  /**
   * "Restaurants", renamed from "Eating out", with 12 transactions and a budget (scenario 3), next
   * to Groceries with a budget of its own, an income and a transfer.
   */
  function withRestaurants(): { state: State; restaurants: Category } {
    let state = seeded();
    const eatingOut = categoryNamed(state, "expense", "Eating out");
    state = applyValid(state, changesOf(renameCategory(state, eatingOut.id, "Restaurants")));
    const restaurants = categoryNamed(state, "expense", "Restaurants");
    const groceries = categoryNamed(state, "expense", "Groceries");
    state = withTransactions(state, entriesIn(state, restaurants, 12));
    state = withTransactions(state, entriesIn(state, groceries, 2));
    state = withTransactions(state, entriesIn(state, categoryNamed(state, "income", "Salary"), 1));
    state = withTransactions(state, [
      {
        id: "transfer",
        seq: state.transactions.length + 1,
        date: "2026-09-04",
        amountCents: 5000,
        accountId: giro.id,
        description: "",
        kind: "transfer",
        destinationAccountId: state.accounts.find((a) => a.name === "Cash")!.id,
      },
    ]);
    state = applyValid(state, {
      budgets: {
        put: [
          { categoryId: restaurants.id, limitCents: 15000 },
          { categoryId: groceries.id, limitCents: 40000 },
        ],
      },
    });
    return { state, restaurants };
  }

  const isRestaurants = (t: Transaction) => t.id.startsWith("Restaurants-");

  test("moves its 12 transactions to expense Uncategorised and removes its budget (scenario 3)", () => {
    const { state, restaurants } = withRestaurants();
    const uncategorised = roleOf(state, "expense", "uncategorised");

    const next = applyValid(state, changesOf(deleteCategory(state, restaurants.id)));

    expect(next.categories.find((c) => c.id === restaurants.id)).toBeUndefined();
    const moved = next.transactions.filter(isRestaurants);
    expect(moved).toHaveLength(12);
    expect(moved.every((t) => t.kind === "expense" && t.categoryId === uncategorised.id)).toBe(
      true,
    );
    expect(next.budgets.map((b) => b.categoryId)).toEqual([
      categoryNamed(state, "expense", "Groceries").id,
    ]);
  });

  test("changes nothing else: other transactions, the moved ones' other fields, settings", () => {
    const { state, restaurants } = withRestaurants();

    const next = applyValid(state, changesOf(deleteCategory(state, restaurants.id)));

    const others = (t: Transaction) => !isRestaurants(t);
    expect(next.transactions.filter(others)).toEqual(state.transactions.filter(others));
    const withoutCategory = (t: Transaction) => ({ ...t, categoryId: undefined });
    expect(next.transactions.filter(isRestaurants).map(withoutCategory)).toEqual(
      state.transactions.filter(isRestaurants).map(withoutCategory),
    );
    expect(next.settings).toEqual(state.settings);
  });

  test("moves an income category's transactions to income Uncategorised", () => {
    let state = seeded();
    const gifts = categoryNamed(state, "income", "Gifts");
    state = withTransactions(state, entriesIn(state, gifts, 2));
    const uncategorised = roleOf(state, "income", "uncategorised").id;

    const next = applyValid(state, changesOf(deleteCategory(state, gifts.id)));

    expect(next.transactions.map((t) => t.kind === "income" && t.categoryId)).toEqual([
      uncategorised,
      uncategorised,
    ]);
  });

  test("deletes a category without transactions or budget", () => {
    const state = seeded();
    const travel = categoryNamed(state, "expense", "Travel");

    const next = applyValid(state, changesOf(deleteCategory(state, travel.id)));

    expect(next.categories).toHaveLength(state.categories.length - 1);
    expect(next.transactions).toEqual([]);
    expect(next.budgets).toEqual([]);
  });

  test("moves the pending rows assigned to it to their side's Uncategorised (R-12 item 4)", () => {
    const { state: ledger, restaurants } = withRestaurants();
    const groceries = categoryNamed(ledger, "expense", "Groceries");
    const row = (rowNumber: number, assignment: ParsedRow["assignment"]): ParsedRow => ({
      rowNumber,
      status: "parsed",
      date: "2026-09-10",
      amountCents: -1200,
      description: `Row ${rowNumber}`,
      counterparty: "Bistro",
      duplicate: false,
      included: true,
      assignment,
    });
    const rows: PendingRow[] = [
      row(2, { type: "category", categoryId: restaurants.id }),
      row(3, { type: "category", categoryId: groceries.id }),
      row(4, { type: "transfer", counterAccountId: giro.id }),
      {
        ...row(5, { type: "category", categoryId: restaurants.id }),
        duplicate: true,
        included: false,
      },
      {
        rowNumber: 6,
        status: "unparsable",
        cells: ["32.08.2026", "Bistro", "-12,00"],
        failure: { code: "date-unreadable" },
      },
    ];
    const state = applyValid(ledger, {
      pendingBatch: {
        put: [
          {
            id: "batch",
            accountId: ledger.accounts.find((a) => a.name === "Cash")!.id,
            fileName: "mybank-2026-09.csv",
            createdAt: "2026-09-10T10:00:00.000Z",
            rows,
          },
        ],
      },
    });
    const toUncategorised = {
      type: "category",
      categoryId: roleOf(state, "expense", "uncategorised").id,
    } as const;

    const next = applyValid(state, changesOf(deleteCategory(state, restaurants.id)));

    expect(next.pendingBatch?.rows).toEqual([
      row(2, toUncategorised),
      rows[1],
      rows[2],
      { ...rows[3], assignment: toUncategorised },
      rows[4],
    ]);
  });

  test("moves a pending row whose suggested category is deleted to Uncategorised, without the mark (FR-093)", () => {
    const { state: ledger, restaurants } = withRestaurants();
    const row: ParsedRow = {
      rowNumber: 2,
      status: "parsed",
      date: "2026-09-10",
      amountCents: -1200,
      description: "Lunch",
      counterparty: "Bistro",
      duplicate: false,
      included: true,
      assignment: { type: "category", categoryId: restaurants.id, suggested: true },
    };
    const state = applyValid(ledger, {
      pendingBatch: {
        put: [
          {
            id: "batch",
            accountId: ledger.accounts.find((a) => a.name === "Cash")!.id,
            fileName: "mybank-2026-09.csv",
            createdAt: "2026-09-10T10:00:00.000Z",
            rows: [row],
          },
        ],
      },
    });

    const next = applyValid(state, changesOf(deleteCategory(state, restaurants.id)));

    expect((next.pendingBatch?.rows[0] as ParsedRow).assignment).toStrictEqual({
      type: "category",
      categoryId: roleOf(state, "expense", "uncategorised").id,
    });
  });

  test("leaves no pending batch where there was none", () => {
    const { state, restaurants } = withRestaurants();

    const next = applyValid(state, changesOf(deleteCategory(state, restaurants.id)));

    expect(next.pendingBatch).toBeNull();
  });

  test.each(PROTECTED)(
    "refuses to delete %s %s, saying which role protects it (scenario 4)",
    (side, role) => {
      const state = seeded();
      expect(deleteCategory(state, roleOf(state, side, role).id)).toEqual({
        code: "category-protected",
        details: { role },
      });
    },
  );

  test("refuses a protected category that was renamed, by its role", () => {
    const state = seeded();
    const uncategorised = roleOf(state, "expense", "uncategorised");
    const renamed = applyValid(state, changesOf(renameCategory(state, uncategorised.id, "Misc")));

    expect(deleteCategory(renamed, uncategorised.id)).toEqual({
      code: "category-protected",
      details: { role: "uncategorised" },
    });
  });
});
