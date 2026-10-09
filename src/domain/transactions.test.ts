import { describe, expect, test } from "vitest";
import { protectedCategory } from "./categories";
import { seedState } from "./seed";
import { applyValid, changesOf, idCounter, testContext } from "./testing";
import {
  changeAccount,
  changeKind,
  deleteTransaction,
  draftOf,
  listTransactions,
  newDraft,
  saveDraft,
  type Draft,
} from "./transactions";
import type { State, Transaction } from "./types";

function seeded(): State {
  return seedState(idCounter());
}

/** Cash plus a "Checking" account, so transfers are possible. */
function withChecking(): State {
  return applyValid(seeded(), {
    accounts: {
      put: [{ id: "checking", name: "Checking", type: "checking", openingBalanceCents: 0 }],
    },
  });
}

const categoryNamed = (state: State, side: "expense" | "income", name: string) =>
  state.categories.find((c) => c.side === side && c.name === name)!.id;

/** Saves a draft that is expected to succeed and returns the resulting state. */
function saved(state: State, draft: Draft, context = testContext()): State {
  return applyValid(state, changesOf(saveDraft(state, draft, context)));
}

describe("newDraft (FR-014)", () => {
  test("opens with kind expense, today, 0.00, Cash, expense Uncategorised and no description (scenario 8)", () => {
    const state = seeded();
    expect(newDraft(state, "2026-09-03")).toEqual({
      id: null,
      kind: "expense",
      amountCents: 0,
      accountId: state.accounts[0]!.id,
      categoryId: protectedCategory(state.categories, "expense", "uncategorised").id,
      date: "2026-09-03",
      description: "",
    });
  });

  test("uses the account of the last manual entry (FR-006, scenario 9)", () => {
    const state: State = { ...seeded(), settings: { manualEntryAccountId: "checking" } };
    expect(newDraft(state, "2026-09-03").accountId).toBe("checking");
  });
});

describe("changeKind (FR-015)", () => {
  const state = seeded();
  const uncategorised = (side: "expense" | "income") =>
    protectedCategory(state.categories, side, "uncategorised").id;
  const groceries = state.categories.find((c) => c.name === "Groceries")!.id;
  const expense: Draft = {
    ...newDraft(state, "2026-09-03"),
    kind: "expense",
    categoryId: groceries,
  };

  test("moves between expense and income to the new side's Uncategorised", () => {
    const income = changeKind(expense, "income", state.categories);
    expect(income).toMatchObject({ kind: "income", categoryId: uncategorised("income") });
    expect(changeKind(income, "expense", state.categories)).toMatchObject({
      kind: "expense",
      categoryId: uncategorised("expense"),
    });
  });

  test("removes the category and asks for a destination when changing to transfer", () => {
    const transfer = changeKind(expense, "transfer", state.categories);
    expect(transfer).toMatchObject({ kind: "transfer", destinationAccountId: null });
    expect(transfer).not.toHaveProperty("categoryId");
  });

  test("removes the destination and sets Uncategorised when changing from transfer", () => {
    const transfer: Draft = {
      ...changeKind(expense, "transfer", state.categories),
      kind: "transfer",
      destinationAccountId: "checking",
    };
    for (const side of ["expense", "income"] as const) {
      const changed = changeKind(transfer, side, state.categories);
      expect(changed).toMatchObject({ kind: side, categoryId: uncategorised(side) });
      expect(changed).not.toHaveProperty("destinationAccountId");
    }
  });

  test("keeps the draft when the kind stays the same", () => {
    expect(changeKind(expense, "expense", state.categories)).toBe(expense);
  });

  test("keeps amount, account, date and description", () => {
    const filled: Draft = { ...expense, amountCents: 4000, description: "Weekly shop" };
    expect(changeKind(filled, "transfer", state.categories)).toMatchObject({
      amountCents: 4000,
      accountId: filled.accountId,
      date: "2026-09-03",
      description: "Weekly shop",
    });
  });
});

describe("changeAccount", () => {
  const state = seeded();
  const transfer: Draft = {
    ...changeKind(newDraft(state, "2026-09-03"), "transfer", state.categories),
    kind: "transfer",
    accountId: "cash",
    destinationAccountId: "checking",
  };

  test("clears a destination that equals the new account (transaction form)", () => {
    expect(changeAccount(transfer, "checking")).toMatchObject({
      accountId: "checking",
      destinationAccountId: null,
    });
  });

  test("keeps any other destination", () => {
    expect(changeAccount(transfer, "savings")).toMatchObject({
      accountId: "savings",
      destinationAccountId: "checking",
    });
  });

  test("only changes the account of an expense or income", () => {
    const expense = newDraft(state, "2026-09-03");
    expect(changeAccount(expense, "checking")).toEqual({ ...expense, accountId: "checking" });
  });
});

describe("saveDraft: new transactions", () => {
  test("books an expense with the next seq, and remembers its account as the default (FR-006)", () => {
    const state = withChecking();
    const draft: Draft = {
      ...newDraft(state, "2026-09-03"),
      kind: "expense",
      accountId: "checking",
      amountCents: 4000,
      categoryId: categoryNamed(state, "expense", "Groceries"),
      description: " Weekly shop ",
    };

    const next = saved(state, draft);

    expect(next.transactions).toEqual([
      {
        id: "new-1",
        seq: 1,
        date: "2026-09-03",
        amountCents: 4000,
        accountId: "checking",
        description: "Weekly shop",
        kind: "expense",
        categoryId: categoryNamed(state, "expense", "Groceries"),
      },
    ]);
    expect(next.settings.manualEntryAccountId).toBe("checking");
  });

  test("saves the unchanged form as an expense of 0.00 in Uncategorised (scenario 8)", () => {
    const state = seeded();
    const next = saved(state, newDraft(state, "2026-09-03"));
    expect(next.transactions[0]).toMatchObject({
      amountCents: 0,
      description: "",
      kind: "expense",
      categoryId: categoryNamed(state, "expense", "Uncategorised"),
    });
  });

  test("gives each new transaction the next seq", () => {
    const state = seeded();
    const context = testContext();
    const once = saved(state, newDraft(state, "2026-09-03"), context);
    const twice = saved(once, newDraft(once, "2026-09-03"), context);
    expect(twice.transactions.map((t) => t.seq)).toEqual([1, 2]);
  });

  test("books a transfer with its destination and no category", () => {
    const state = withChecking();
    const draft: Draft = {
      ...changeKind(newDraft(state, "2026-09-03"), "transfer", state.categories),
      kind: "transfer",
      amountCents: 10000,
      destinationAccountId: "checking",
    };
    const transaction = saved(state, draft).transactions[0];
    expect(transaction).toMatchObject({ kind: "transfer", destinationAccountId: "checking" });
    expect(transaction).not.toHaveProperty("categoryId");
  });
});

describe("saveDraft: field errors (FR-010, FR-011)", () => {
  test("reports every invalid field at once, keyed by field", () => {
    const state = withChecking();
    const draft: Draft = {
      ...changeKind(newDraft(state, "2026-09-03"), "transfer", state.categories),
      kind: "transfer",
      amountCents: null,
      date: "2026-02-30",
      destinationAccountId: null,
    };
    expect(saveDraft(state, draft, testContext())).toEqual({
      code: "draft-invalid",
      details: {
        amount: "amount-invalid",
        date: "date-invalid",
        destination: "transfer-destination-missing",
      },
    });
  });

  test("refuses a negative amount", () => {
    const state = seeded();
    const draft: Draft = { ...newDraft(state, "2026-09-03"), amountCents: -100 };
    expect(saveDraft(state, draft, testContext())).toEqual({
      code: "draft-invalid",
      details: { amount: "amount-invalid" },
    });
  });

  test("asks for a second account when there is only one", () => {
    const state = seeded();
    const draft = changeKind(newDraft(state, "2026-09-03"), "transfer", state.categories);
    expect(saveDraft(state, draft, testContext())).toEqual({
      code: "draft-invalid",
      details: { destination: "transfer-needs-second-account" },
    });
  });
});

describe("saveDraft: categories (FR-030, data-model.md)", () => {
  test("refuses a category from the other side", () => {
    const state = seeded();
    const draft: Draft = {
      ...newDraft(state, "2026-09-03"),
      kind: "expense",
      categoryId: categoryNamed(state, "income", "Salary"),
    };
    expect(saveDraft(state, draft, testContext())).toEqual({ code: "category-not-allowed" });
  });

  test("refuses Unaccounted for a new transaction", () => {
    const state = seeded();
    const draft: Draft = {
      ...newDraft(state, "2026-09-03"),
      kind: "expense",
      categoryId: categoryNamed(state, "expense", "Unaccounted"),
    };
    expect(saveDraft(state, draft, testContext())).toEqual({ code: "category-not-allowed" });
  });

  test("keeps Unaccounted on a reconciliation entry being edited, but never moves another one there", () => {
    const state = seeded();
    const unaccounted = categoryNamed(state, "expense", "Unaccounted");
    const reconciliation: Transaction = {
      id: "r1",
      seq: 1,
      date: "2026-09-01",
      amountCents: 1500,
      accountId: state.accounts[0]!.id,
      description: "",
      kind: "expense",
      categoryId: unaccounted,
    };
    const ordinary: Transaction = {
      ...reconciliation,
      id: "t2",
      seq: 2,
      categoryId: categoryNamed(state, "expense", "Groceries"),
    };
    const withBoth = applyValid(state, { transactions: { put: [reconciliation, ordinary] } });

    const kept = { ...draftOf(reconciliation), description: "Counted cash" };
    expect(saveDraft(withBoth, kept, testContext())).not.toHaveProperty("code");

    const moved: Draft = { ...draftOf(ordinary), kind: "expense", categoryId: unaccounted };
    expect(saveDraft(withBoth, moved, testContext())).toEqual({ code: "category-not-allowed" });
  });
});

describe("saveDraft: edits", () => {
  test("keeps id and seq, and leaves the manual-entry default alone (state transitions)", () => {
    const state = withChecking();
    const first = saved(state, newDraft(state, "2026-09-03"));
    const transaction = first.transactions[0]!;
    const edited: Draft = { ...draftOf(transaction), accountId: "checking", amountCents: 999 };

    const next = saved(first, edited);

    expect(next.transactions).toEqual([
      { ...transaction, accountId: "checking", amountCents: 999 },
    ]);
    expect(next.settings).toBe(first.settings);
  });
});

describe("draftOf", () => {
  test("opens a transfer for editing with its destination", () => {
    const transfer: Transaction = {
      id: "t1",
      seq: 4,
      date: "2026-09-03",
      amountCents: 10000,
      accountId: "cash",
      description: "To bank",
      kind: "transfer",
      destinationAccountId: "checking",
    };
    expect(draftOf(transfer)).toEqual({
      id: "t1",
      kind: "transfer",
      amountCents: 10000,
      accountId: "cash",
      destinationAccountId: "checking",
      date: "2026-09-03",
      description: "To bank",
    });
  });
});

describe("deleteTransaction (FR-013)", () => {
  test("removes the transaction", () => {
    const state = seeded();
    const withOne = saved(state, newDraft(state, "2026-09-03"));
    const id = withOne.transactions[0]!.id;
    expect(applyValid(withOne, deleteTransaction(withOne, id)).transactions).toEqual([]);
  });
});

describe("listTransactions (FR-016)", () => {
  const base = { amountCents: 100, description: "" };
  const expense = (id: string, seq: number, date: string, accountId = "cash"): Transaction => ({
    ...base,
    id,
    seq,
    date,
    accountId,
    kind: "expense",
    categoryId: "groceries",
  });
  const transactions: Transaction[] = [
    expense("old", 1, "2026-09-01"),
    expense("shop", 2, "2026-09-03", "checking"),
    {
      ...base,
      id: "move",
      seq: 3,
      date: "2026-09-03",
      accountId: "checking",
      kind: "transfer",
      destinationAccountId: "cash",
    },
    { ...expense("pay", 4, "2026-09-02", "checking"), kind: "income", categoryId: "salary" },
  ];
  const ids = (list: readonly Transaction[]) => list.map((t) => t.id);

  test("lists newest first, with the later entry first on the same date (scenario 12)", () => {
    expect(ids(listTransactions(transactions, {}))).toEqual(["move", "shop", "pay", "old"]);
  });

  test("filters by account, including transfers into it", () => {
    expect(ids(listTransactions(transactions, { accountId: "cash" }))).toEqual(["move", "old"]);
    expect(ids(listTransactions(transactions, { accountId: "checking" }))).toEqual([
      "move",
      "shop",
      "pay",
    ]);
  });

  test("filters by category, which leaves out transfers", () => {
    expect(ids(listTransactions(transactions, { categoryId: "groceries" }))).toEqual([
      "shop",
      "old",
    ]);
  });

  test("combines both filters", () => {
    const filters = { accountId: "cash", categoryId: "groceries" };
    expect(ids(listTransactions(transactions, filters))).toEqual(["old"]);
  });

  // An empty date limits nothing, like an empty account or category: the screen's fields hold ""
  // until a date is entered.
  test("filters from a date, that date included", () => {
    const expected = ["move", "shop", "pay"];
    expect(ids(listTransactions(transactions, { from: "2026-09-02" }))).toEqual(expected);
    expect(ids(listTransactions(transactions, { from: "2026-09-02", to: "" }))).toEqual(expected);
  });

  test("filters up to a date, that date included", () => {
    expect(ids(listTransactions(transactions, { to: "2026-09-02" }))).toEqual(["pay", "old"]);
    expect(ids(listTransactions(transactions, { from: "", to: "2026-09-02" }))).toEqual([
      "pay",
      "old",
    ]);
  });

  test("filters between two dates, both included", () => {
    expect(ids(listTransactions(transactions, { from: "2026-09-02", to: "2026-09-02" }))).toEqual([
      "pay",
    ]);
    expect(ids(listTransactions(transactions, { from: "2026-09-01", to: "2026-09-03" }))).toEqual([
      "move",
      "shop",
      "pay",
      "old",
    ]);
  });

  test("combines the dates with the account and category filters", () => {
    expect(ids(listTransactions(transactions, { accountId: "cash", from: "2026-09-02" }))).toEqual([
      "move",
    ]);
    expect(
      ids(listTransactions(transactions, { categoryId: "groceries", to: "2026-09-02" })),
    ).toEqual(["old"]);
  });

  test("leaves its input in its order", () => {
    const input = [...transactions];
    listTransactions(input, {});
    expect(ids(input)).toEqual(["old", "shop", "move", "pay"]);
  });
});
