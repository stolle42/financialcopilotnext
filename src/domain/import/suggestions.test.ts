import { describe, expect, test } from "vitest";
import { protectedCategory } from "../categories";
import { seedState } from "../seed";
import { applyValid, changesOf, idCounter } from "../testing";
import type {
  Assignment,
  Category,
  ParsedRow,
  PendingRow,
  Side,
  State,
  Transaction,
} from "../types";
import { reviewView } from "./groups";
import { assignRow, includeDuplicate } from "./review";
import {
  MAX_SUGGESTION_EXAMPLES,
  MAX_SUGGESTION_ROWS,
  applySuggestions,
  suggestableRows,
  suggestionRequest,
} from "./suggestions";

// FR-090 – FR-093; contracts/categoriser.md, request and answer; R-23.

const categoryNamed = (state: State, side: Side, name: string): Category =>
  state.categories.find((c) => c.side === side && c.name === name)!;
const uncategorised = (state: State, side: Side): Assignment => ({
  type: "category",
  categoryId: protectedCategory(state.categories, side, "uncategorised").id,
});

/** The seed state with a credit card account and the ledger `transactions` on Cash. */
function ledger(transactions: (state: State, cash: string) => Transaction[] = () => []): State {
  const seeded = seedState(idCounter());
  const cash = seeded.accounts[0]!.id;
  return applyValid(seeded, {
    accounts: {
      put: [{ id: "card", name: "Credit card", type: "credit-card", openingBalanceCents: 0 }],
    },
    transactions: { put: transactions(seeded, cash) },
  });
}

/** `state` with a pending batch on Cash holding `rows`. */
function withBatch(state: State, rows: (state: State) => PendingRow[]): State {
  return applyValid(state, {
    pendingBatch: {
      put: [
        {
          id: "batch",
          accountId: state.accounts.find((a) => a.name === "Cash")!.id,
          fileName: "mybank-2026-09.csv",
          createdAt: "2026-09-03T10:00:00.000Z",
          rows: rows(state),
        },
      ],
    },
  });
}

function row(
  state: State,
  rowNumber: number,
  amountCents: number,
  fields: Partial<ParsedRow> = {},
): ParsedRow {
  return {
    rowNumber,
    status: "parsed",
    date: "2026-09-01",
    amountCents,
    description: `Row ${rowNumber}`,
    counterparty: null,
    duplicate: false,
    included: true,
    assignment: uncategorised(state, amountCents > 0 ? "income" : "expense"),
    ...fields,
  };
}

/**
 * A batch with rows of every kind: a REWE group of two in Uncategorised, a row in another category,
 * a transfer, an included and an excluded duplicate, a row without text, a salary, and an
 * unparsable row. Review shows the group first, then the plain rows by date.
 */
function mixedBatch(): State {
  return withBatch(ledger(), (s) => [
    row(s, 2, -4520, { counterparty: "REWE", description: "Card payment REWE Berlin" }),
    row(s, 3, -1250, { counterparty: "rewe ", description: "Card payment REWE Mitte" }),
    row(s, 4, -999, {
      counterparty: "Netflix",
      assignment: { type: "category", categoryId: categoryNamed(s, "expense", "Leisure").id },
    }),
    row(s, 5, -3000, {
      counterparty: "Kiosk",
      assignment: { type: "transfer", counterAccountId: "card" },
    }),
    row(s, 6, -500, { date: "2026-09-02", description: "Bakery", duplicate: true, included: true }),
    row(s, 7, -700, { description: "Bakery", duplicate: true, included: false }),
    row(s, 8, -200, { description: "  " }),
    row(s, 9, 245000, { date: "2026-08-31", counterparty: "ACME", description: "Salary August" }),
    {
      rowNumber: 10,
      status: "unparsable",
      cells: ["32.08.2026", "Kiosk", "Newspaper", "-2,80"],
      failure: { code: "date-unreadable" },
    },
  ]);
}

const rowNumbersOf = (rows: readonly ParsedRow[]) => rows.map((r) => r.rowNumber);
const suggestable = (state: State) =>
  rowNumbersOf(suggestableRows(reviewView(state.pendingBatch!), state.categories));
const rowOf = (state: State, rowNumber: number) =>
  state.pendingBatch!.rows.find((r) => r.rowNumber === rowNumber) as ParsedRow;
const sentRows = (state: State) => ({
  batchId: state.pendingBatch!.id,
  rowNumbers: suggestionRequest(state).rows.map((r) => r.rowNumber),
});

describe("suggestableRows (FR-090)", () => {
  test("gives the rows under review still in Uncategorised, in review order: groups, then plain rows by date", () => {
    expect(suggestable(mixedBatch())).toEqual([2, 3, 9, 6]);
  });

  test("leaves out a row with neither description nor counterparty", () => {
    expect(suggestable(mixedBatch())).not.toContain(8);
  });

  test("leaves out the rows of a side without a category other than the protected ones", () => {
    const state = mixedBatch();
    const incomeCategories = state.categories
      .filter((c) => c.side === "income" && c.role === null)
      .map((c) => c.id);
    const withoutIncome = applyValid(state, { categories: { delete: incomeCategories } });

    expect(suggestable(withoutIncome)).toEqual([2, 3, 6]);
  });

  test(`sends at most ${MAX_SUGGESTION_ROWS} rows, the first in review order`, () => {
    const count = MAX_SUGGESTION_ROWS + 50;
    const state = withBatch(ledger(), (s) =>
      Array.from({ length: count }, (_, i) =>
        row(s, i + 2, -100, { date: `2026-09-${String((i % 28) + 1).padStart(2, "0")}` }),
      ),
    );
    const inReviewOrder = rowNumbersOf(reviewView(state.pendingBatch!).plainRows);

    expect(suggestable(state)).toEqual(inReviewOrder.slice(0, MAX_SUGGESTION_ROWS));
  });
});

describe("suggestionRequest (FR-091, contracts/categoriser.md)", () => {
  test("holds exactly each row's number, side, counterparty and description", () => {
    expect(suggestionRequest(mixedBatch()).rows).toStrictEqual([
      {
        rowNumber: 2,
        side: "expense",
        counterparty: "REWE",
        description: "Card payment REWE Berlin",
      },
      {
        rowNumber: 3,
        side: "expense",
        counterparty: "rewe ",
        description: "Card payment REWE Mitte",
      },
      { rowNumber: 9, side: "income", counterparty: "ACME", description: "Salary August" },
      { rowNumber: 6, side: "expense", counterparty: null, description: "Bakery" },
    ]);
  });

  test("names each side's categories other than the protected ones, in list order", () => {
    const state = applyValid(mixedBatch(), {
      categories: {
        put: [{ id: "pets", side: "expense", name: "pets", color: "#82c91e", role: null }],
      },
    });
    expect(suggestionRequest(state).categories).toStrictEqual({
      expense: [
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
      ],
      income: ["Gifts", "Interest", "Salary"],
    });
  });

  test("holds both sides' keys even when a side has no category to offer", () => {
    const state = mixedBatch();
    const income = state.categories.filter((c) => c.side === "income" && c.role === null);
    const withoutIncome = applyValid(state, {
      categories: { delete: income.map((c) => c.id) },
    });
    expect(suggestionRequest(withoutIncome).categories.income).toEqual([]);
  });

  test("gives the newest decision for each side and description as an example, newest first", () => {
    let seq = 0;
    const entry = (
      s: State,
      cash: string,
      date: string,
      side: Side,
      category: string,
      description: string,
    ): Transaction => ({
      id: `t${++seq}`,
      seq,
      date,
      amountCents: 1000,
      accountId: cash,
      description,
      kind: side,
      categoryId: category.startsWith("role:")
        ? protectedCategory(s.categories, side, category.slice(5) as "uncategorised").id
        : categoryNamed(s, side, category).id,
    });
    const state = withBatch(
      ledger((s, cash) => [
        entry(s, cash, "2026-07-01", "expense", "Groceries", "Lidl"),
        entry(s, cash, "2026-08-01", "expense", "Eating out", "Lidl"),
        entry(s, cash, "2026-07-15", "expense", "Housing", " LIDL "),
        entry(s, cash, "2026-08-05", "expense", "role:uncategorised", "Unknown shop"),
        entry(s, cash, "2026-08-06", "income", "Salary", "ACME payroll"),
        entry(s, cash, "2026-08-08", "expense", "Groceries", ""),
        entry(s, cash, "2026-08-09", "expense", "role:unaccounted", "Reconciliation"),
        entry(s, cash, "2026-06-01", "income", "Gifts", "Lidl"),
        {
          id: "transfer",
          seq: ++seq,
          date: "2026-08-07",
          amountCents: 5000,
          accountId: cash,
          description: "Savings",
          kind: "transfer",
          destinationAccountId: "card",
        },
      ]),
      (s) => [row(s, 2, -100)],
    );

    expect(suggestionRequest(state).examples).toStrictEqual([
      { side: "income", description: "ACME payroll", category: "Salary" },
      { side: "expense", description: "Lidl", category: "Eating out" },
      { side: "income", description: "Lidl", category: "Gifts" },
    ]);
  });

  test("breaks a tie between equal dates by the order of entry", () => {
    const state = withBatch(
      ledger((s, cash) =>
        ["Groceries", "Eating out"].map((name, i) => ({
          id: `t${i + 1}`,
          seq: i + 1,
          date: "2026-08-01",
          amountCents: 1000,
          accountId: cash,
          description: "Corner shop",
          kind: "expense",
          categoryId: categoryNamed(s, "expense", name).id,
        })),
      ),
      (s) => [row(s, 2, -100)],
    );

    expect(suggestionRequest(state).examples).toEqual([
      { side: "expense", description: "Corner shop", category: "Eating out" },
    ]);
  });

  test(`gives at most ${MAX_SUGGESTION_EXAMPLES} examples, the newest`, () => {
    const count = MAX_SUGGESTION_EXAMPLES + 50;
    const state = withBatch(
      ledger((s, cash) =>
        Array.from({ length: count }, (_, i) => ({
          id: `t${i + 1}`,
          seq: i + 1,
          date: "2026-08-01",
          amountCents: 1000,
          accountId: cash,
          description: `Shop ${i + 1}`,
          kind: "expense",
          categoryId: categoryNamed(s, "expense", "Groceries").id,
        })),
      ),
      (s) => [row(s, 2, -100)],
    );

    const examples = suggestionRequest(state).examples;

    expect(examples).toHaveLength(MAX_SUGGESTION_EXAMPLES);
    expect(examples[0]!.description).toBe(`Shop ${count}`);
    expect(examples.at(-1)!.description).toBe(`Shop ${count - MAX_SUGGESTION_EXAMPLES + 1}`);
  });

  test("holds no amount, date, account or file name", () => {
    const text = JSON.stringify(suggestionRequest(mixedBatch()));
    for (const leak of ["amount", "date", "account", "fileName", "mybank", "4520", "2026-09"]) {
      expect(text).not.toContain(leak);
    }
  });

  test("throws when no batch is pending, since review offers it only for a batch", () => {
    expect(() => suggestionRequest(ledger())).toThrow();
  });
});

describe("applySuggestions (FR-092, FR-093)", () => {
  test("fills rows with the suggested categories, marked as suggestions, and counts them", () => {
    const state = mixedBatch();
    const result = applySuggestions(state, sentRows(state), [
      { rowNumber: 2, category: "Groceries" },
      { rowNumber: 9, category: "Salary" },
    ]);
    if ("code" in result) throw new Error(`Refused: ${result.code}`);

    const next = applyValid(state, result.changes);

    expect(result.filled).toBe(2);
    expect(rowOf(next, 2).assignment).toStrictEqual({
      type: "category",
      categoryId: categoryNamed(state, "expense", "Groceries").id,
      suggested: true,
    });
    expect(rowOf(next, 9).assignment).toStrictEqual({
      type: "category",
      categoryId: categoryNamed(state, "income", "Salary").id,
      suggested: true,
    });
    expect(rowOf(next, 3)).toEqual(rowOf(state, 3));
  });

  test("matches names ignoring case and surrounding spaces, as category names compare (FR-032)", () => {
    const state = mixedBatch();
    const result = applySuggestions(state, sentRows(state), [
      { rowNumber: 2, category: "  groceries " },
    ]);
    if ("code" in result) throw new Error(`Refused: ${result.code}`);
    expect(rowOf(applyValid(state, result.changes), 2).assignment).toMatchObject({
      categoryId: categoryNamed(state, "expense", "Groceries").id,
      suggested: true,
    });
  });

  test("ignores null, unknown names, names of the other side and the protected categories", () => {
    const state = mixedBatch();
    const result = applySuggestions(state, sentRows(state), [
      { rowNumber: 2, category: null },
      { rowNumber: 3, category: "Pets" },
      { rowNumber: 9, category: "Groceries" },
      { rowNumber: 6, category: "Uncategorised" },
    ]);
    expect(result).toEqual({ changes: {}, filled: 0 });

    const unaccounted = applySuggestions(state, sentRows(state), [
      { rowNumber: 6, category: "Unaccounted" },
    ]);
    expect(unaccounted).toEqual({ changes: {}, filled: 0 });
  });

  test("ignores rows that were not sent, or are not in the batch", () => {
    const state = mixedBatch();
    const result = applySuggestions(state, sentRows(state), [
      { rowNumber: 8, category: "Groceries" },
      { rowNumber: 4, category: "Groceries" },
      { rowNumber: 10, category: "Groceries" },
      { rowNumber: 99, category: "Groceries" },
    ]);
    expect(result).toEqual({ changes: {}, filled: 0 });
  });

  test("takes the first suggestion for a row", () => {
    const state = mixedBatch();
    const result = applySuggestions(state, sentRows(state), [
      { rowNumber: 2, category: "Groceries" },
      { rowNumber: 2, category: "Travel" },
    ]);
    if ("code" in result) throw new Error(`Refused: ${result.code}`);
    expect(result.filled).toBe(1);
    expect(rowOf(applyValid(state, result.changes), 2).assignment).toMatchObject({
      categoryId: categoryNamed(state, "expense", "Groceries").id,
    });
  });

  test("never replaces what the user chose or changed while Claude answered", () => {
    const state = mixedBatch();
    const sent = sentRows(state);
    const travel: Assignment = {
      type: "category",
      categoryId: categoryNamed(state, "expense", "Travel").id,
    };
    let changed = applyValid(state, changesOf(assignRow(state, 2, travel)));
    changed = applyValid(changed, changesOf(includeDuplicate(changed, 6, false)));

    const result = applySuggestions(changed, sent, [
      { rowNumber: 2, category: "Groceries" },
      { rowNumber: 6, category: "Groceries" },
      { rowNumber: 3, category: "Groceries" },
    ]);
    if ("code" in result) throw new Error(`Refused: ${result.code}`);
    const next = applyValid(changed, result.changes);

    expect(result.filled).toBe(1);
    expect(rowOf(next, 2).assignment).toStrictEqual(travel);
    expect(rowOf(next, 6).assignment).toStrictEqual(uncategorised(state, "expense"));
    expect(rowOf(next, 3).assignment).toMatchObject({ suggested: true });
  });

  test("refuses with suggestions-outdated when no batch, or another batch, is pending", () => {
    const state = mixedBatch();
    const sent = sentRows(state);
    const answer = [{ rowNumber: 2, category: "Groceries" }];

    expect(applySuggestions({ ...state, pendingBatch: null }, sent, answer)).toEqual({
      code: "suggestions-outdated",
    });
    const another = { ...state, pendingBatch: { ...state.pendingBatch!, id: "another" } };
    expect(applySuggestions(another, sent, answer)).toEqual({ code: "suggestions-outdated" });
  });
});
