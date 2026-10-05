import { describe, expect, test } from "vitest";
import {
  budgetableCategories,
  budgetMonth,
  budgetProgress,
  removeLimit,
  setLimit,
  type BudgetProgress,
} from "./budgets";
import { seedState } from "./seed";
import { applyValid, changesOf, idCounter } from "./testing";
import type { Account, Category, Side, State, Transaction } from "./types";

// FR-040 – FR-042, R-14; User Story 4 scenarios 1–6 and SC-004.

const giro: Account = { id: "giro", name: "Giro", type: "checking", openingBalanceCents: 0 };

function categoryNamed(state: State, side: Side, name: string): Category {
  const found = state.categories.find((c) => c.side === side && c.name === name);
  if (!found) throw new Error(`No ${side} category ${name}`);
  return found;
}

const groceries = (state: State) => categoryNamed(state, "expense", "Groceries");

/** The seed state with a second account, Giro, for transfers. */
function seeded(): State {
  return applyValid(seedState(idCounter()), { accounts: { put: [giro] } });
}

type Entry =
  | { kind: Side; date: string; cents: number; category: string }
  | { kind: "transfer"; date: string; cents: number };

/** `state` with `entries` added as transactions after its own. */
function withEntries(state: State, entries: Entry[]): State {
  const cashId = state.accounts.find((a) => a.name === "Cash")!.id;
  const transactions = entries.map((entry, index): Transaction => {
    const seq = state.transactions.length + index + 1;
    const fields = {
      id: `t-${seq}`,
      seq,
      date: entry.date,
      amountCents: entry.cents,
      accountId: cashId,
      description: "",
    };
    return entry.kind === "transfer"
      ? { ...fields, kind: "transfer", destinationAccountId: giro.id }
      : {
          ...fields,
          kind: entry.kind,
          categoryId: categoryNamed(state, entry.kind, entry.category).id,
        };
  });
  return applyValid(state, { transactions: { put: transactions } });
}

const expense = (date: string, cents: number, category = "Groceries"): Entry => ({
  kind: "expense",
  date,
  cents,
  category,
});

/** `state` with a limit set on the expense category `name`. */
function withLimit(state: State, name: string, limitCents: number): State {
  const category = categoryNamed(state, "expense", name);
  return applyValid(state, changesOf(setLimit(state, category.id, limitCents)));
}

/** Each budgeted category's progress as [name, spent, limit, over limit]. */
const progressOf = (progress: BudgetProgress[]) =>
  progress.map((p) => [p.category.name, p.spentCents, p.limitCents, p.overLimit]);

describe("budgetableCategories (FR-040)", () => {
  test("are the ordinary expense categories, by name (scenario 4)", () => {
    expect(budgetableCategories(seeded().categories).map((c) => c.name)).toEqual([
      "Eating out",
      "Groceries",
      "Health",
      "Housing",
      "Leisure",
      "Shopping",
      "Transport",
      "Travel",
      "Utilities",
    ]);
  });

  test("leave out the protected categories by role, even when renamed", () => {
    const state = seeded();
    const uncategorised = categoryNamed(state, "expense", "Uncategorised");
    const unaccounted = categoryNamed(state, "expense", "Unaccounted");
    const renamed = applyValid(state, {
      categories: {
        put: [
          { ...uncategorised, name: "Misc" },
          { ...unaccounted, name: "Gap" },
        ],
      },
    });

    const names = budgetableCategories(renamed.categories).map((c) => c.name);

    expect(names).not.toContain("Misc");
    expect(names).not.toContain("Gap");
    expect(names).toHaveLength(9);
  });

  test("include a category the user added, in name order", () => {
    const state = seeded();
    const pets: Category = {
      id: "pets",
      side: "expense",
      name: "pets",
      color: "#82c91e",
      role: null,
    };
    const next = applyValid(state, { categories: { put: [pets] } });

    expect(budgetableCategories(next.categories).map((c) => c.name)).toEqual([
      "Eating out",
      "Groceries",
      "Health",
      "Housing",
      "Leisure",
      "pets",
      "Shopping",
      "Transport",
      "Travel",
      "Utilities",
    ]);
  });
});

describe("setLimit (FR-040, FR-041)", () => {
  test("sets a monthly limit on an expense category (scenario 1)", () => {
    const state = seeded();

    const next = withLimit(state, "Groceries", 40000);

    expect(next.budgets).toEqual([{ categoryId: groceries(state).id, limitCents: 40000 }]);
  });

  test("changes an existing limit, keeping one budget per category (scenario 5)", () => {
    const state = withLimit(seeded(), "Groceries", 40000);

    const next = withLimit(state, "Groceries", 45000);

    expect(next.budgets).toEqual([{ categoryId: groceries(state).id, limitCents: 45000 }]);
  });

  test.each<[number | null, string]>([
    [null, "an amount that does not parse"],
    [0, "0.00"],
    [-100, "a negative amount"],
  ])("refuses %s, %s, as budget-limit-invalid", (limitCents) => {
    const state = seeded();
    expect(setLimit(state, groceries(state).id, limitCents)).toEqual({
      code: "budget-limit-invalid",
    });
  });

  test.each([
    ["income", "Salary"],
    ["expense", "Uncategorised"],
    ["expense", "Unaccounted"],
    ["income", "Uncategorised"],
  ] as const)(
    "refuses %s %s, which cannot carry a budget, with a code of its own (scenario 4)",
    (side, name) => {
      const state = seeded();
      expect(setLimit(state, categoryNamed(state, side, name).id, 40000)).toEqual({
        code: "budget-category-not-allowed",
      });
    },
  );

  test("refuses a category that does not exist", () => {
    expect(setLimit(seeded(), "no-such-category", 40000)).toEqual({
      code: "budget-category-not-allowed",
    });
  });

  test("checks the category before the limit", () => {
    const state = seeded();
    expect(setLimit(state, categoryNamed(state, "income", "Salary").id, 0)).toEqual({
      code: "budget-category-not-allowed",
    });
  });
});

describe("removeLimit (FR-040)", () => {
  test("removes the category's limit and leaves the others (scenario 5)", () => {
    const state = withLimit(withLimit(seeded(), "Groceries", 40000), "Transport", 8000);

    const next = applyValid(state, changesOf(removeLimit(state, groceries(state).id)));

    expect(next.budgets).toEqual([
      { categoryId: categoryNamed(state, "expense", "Transport").id, limitCents: 8000 },
    ]);
  });

  test("changes nothing for a category without a limit", () => {
    const state = withLimit(seeded(), "Transport", 8000);

    const next = applyValid(state, changesOf(removeLimit(state, groceries(state).id)));

    expect(next.budgets).toEqual(state.budgets);
  });
});

describe("budgetMonth (R-14)", () => {
  test.each([
    [{ start: "2026-09-01", end: "2026-09-30" }, "2026-09", "this month"],
    [{ start: "2026-07-01", end: "2026-09-30" }, "2026-09", "July to September (scenario 6)"],
    [{ start: "2026-08-15", end: "2026-09-03" }, "2026-09", "a period ending early in a month"],
    [{ start: "2025-12-15", end: "2026-01-05" }, "2026-01", "a period over the turn of the year"],
    [{ start: "2026-01-01", end: "2026-12-31" }, "2026-12", "a whole year: its last month"],
  ])("of %o is %s: %s", (period, month) => {
    expect(budgetMonth(period)).toBe(month);
  });
});

describe("budgetProgress (FR-041, FR-042)", () => {
  test("compares a category's expenses in the month with its limit (scenario 1)", () => {
    const state = withEntries(withLimit(seeded(), "Groceries", 40000), [
      expense("2026-09-01", 12000),
      expense("2026-09-30", 3050),
      expense("2026-09-15", 9900, "Eating out"),
    ]);

    expect(progressOf(budgetProgress(state, "2026-09"))).toEqual([
      ["Groceries", 15050, 40000, false],
    ]);
  });

  test("is over the limit only once spending exceeds it (scenario 2)", () => {
    const atLimit = withEntries(withLimit(seeded(), "Groceries", 40000), [
      expense("2026-09-03", 40000),
    ]);
    expect(progressOf(budgetProgress(atLimit, "2026-09"))).toEqual([
      ["Groceries", 40000, 40000, false],
    ]);

    const over = withEntries(atLimit, [expense("2026-09-20", 3000)]);
    expect(progressOf(budgetProgress(over, "2026-09"))).toEqual([
      ["Groceries", 43000, 40000, true],
    ]);
  });

  test("starts each month at zero, with nothing rolled over (scenario 3)", () => {
    const state = withEntries(withLimit(seeded(), "Groceries", 40000), [
      expense("2026-09-10", 15000),
    ]);

    expect(progressOf(budgetProgress(state, "2026-09"))).toEqual([
      ["Groceries", 15000, 40000, false],
    ]);
    expect(progressOf(budgetProgress(state, "2026-10"))).toEqual([["Groceries", 0, 40000, false]]);
  });

  test("follows a changed or removed limit at once (scenario 5)", () => {
    const state = withEntries(withLimit(seeded(), "Groceries", 40000), [
      expense("2026-09-10", 35000),
    ]);

    const lowered = withLimit(state, "Groceries", 30000);
    expect(progressOf(budgetProgress(lowered, "2026-09"))).toEqual([
      ["Groceries", 35000, 30000, true],
    ]);

    const removed = applyValid(lowered, changesOf(removeLimit(lowered, groceries(lowered).id)));
    expect(budgetProgress(removed, "2026-09")).toEqual([]);
  });

  test("applies a changed limit to past months too, keeping no history", () => {
    const state = withEntries(withLimit(seeded(), "Groceries", 40000), [
      expense("2026-08-10", 35000),
    ]);
    expect(progressOf(budgetProgress(state, "2026-08"))).toEqual([
      ["Groceries", 35000, 40000, false],
    ]);

    const lowered = withLimit(state, "Groceries", 30000);

    expect(progressOf(budgetProgress(lowered, "2026-08"))).toEqual([
      ["Groceries", 35000, 30000, true],
    ]);
  });

  test("counts only the month's own expenses, for the month of a longer period (scenario 6)", () => {
    const state = withEntries(withLimit(seeded(), "Groceries", 40000), [
      expense("2026-07-31", 10000),
      expense("2026-08-31", 20000),
      expense("2026-09-01", 3000),
      expense("2026-10-01", 4000),
    ]);

    const month = budgetMonth({ start: "2026-07-01", end: "2026-09-30" });

    expect(progressOf(budgetProgress(state, month))).toEqual([["Groceries", 3000, 40000, false]]);
  });

  test("lists every budgeted category by name, including one with no spending yet", () => {
    let state = withLimit(seeded(), "Transport", 8000);
    state = withLimit(state, "Eating out", 15000);
    state = withEntries(withLimit(state, "Groceries", 40000), [
      expense("2026-09-02", 2000, "Eating out"),
      expense("2026-09-03", 5000, "Housing"),
    ]);

    expect(progressOf(budgetProgress(state, "2026-09"))).toEqual([
      ["Eating out", 2000, 15000, false],
      ["Groceries", 0, 40000, false],
      ["Transport", 0, 8000, false],
    ]);
  });

  test("is empty without budgets", () => {
    const state = withEntries(seeded(), [expense("2026-09-02", 2000)]);
    expect(budgetProgress(state, "2026-09")).toEqual([]);
  });

  test("leaves transfers out, so one more transfer changes no figure (SC-004, FR-012)", () => {
    const state = withEntries(withLimit(seeded(), "Groceries", 40000), [
      expense("2026-09-02", 2000),
    ]);
    const before = budgetProgress(state, "2026-09");

    const after = budgetProgress(
      withEntries(state, [{ kind: "transfer", date: "2026-09-05", cents: 50000 }]),
      "2026-09",
    );

    expect(after).toEqual(before);
  });
});
