import { describe, expect, test } from "vitest";
import { accountBalance } from "../accounts";
import { protectedCategory } from "../categories";
import { seedState } from "../seed";
import { applyValid, idCounter, testContext } from "../testing";
import type { Assignment, ParsedRow, PendingRow, Side, State, Transaction } from "../types";
import { confirmBatch, discardBatch } from "./confirm";

// FR-027; data-model.md, state transitions (confirmation).

const categoryNamed = (state: State, side: Side, name: string) =>
  state.categories.find((c) => c.side === side && c.name === name)!.id;

/** Cash with one manual entry, a credit card account, and a pending batch on Cash. */
function withBatch(rows: (state: State) => PendingRow[]): State {
  const seeded = seedState(idCounter());
  const cash = seeded.accounts[0]!.id;
  const withLedger = applyValid(seeded, {
    accounts: {
      put: [{ id: "card", name: "Credit card", type: "credit-card", openingBalanceCents: 0 }],
    },
    transactions: {
      put: [
        {
          id: "manual",
          seq: 7,
          date: "2026-07-30",
          amountCents: 500,
          accountId: cash,
          description: "Coffee",
          kind: "expense",
          categoryId: categoryNamed(seeded, "expense", "Eating out"),
        },
      ],
    },
  });
  return applyValid(withLedger, {
    pendingBatch: {
      put: [
        {
          id: "batch",
          accountId: cash,
          fileName: "mybank-2026-08.csv",
          createdAt: "2026-09-03T10:00:00.000Z",
          rows: rows(withLedger),
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
  const side = amountCents > 0 ? "income" : "expense";
  return {
    rowNumber,
    status: "parsed",
    date: "2026-08-01",
    amountCents,
    description: `Row ${rowNumber}`,
    counterparty: null,
    duplicate: false,
    included: true,
    assignment: {
      type: "category",
      categoryId: protectedCategory(state.categories, side, "uncategorised").id,
    },
    ...fields,
  };
}

const confirmed = (state: State) => applyValid(state, confirmBatch(state, testContext()));
const added = (before: State, after: State): Transaction[] =>
  after.transactions.filter((t) => !before.transactions.includes(t));

describe("confirmBatch (FR-027)", () => {
  test("books the rows under review with their categories, untouched rows in Uncategorised, and updates balances (scenario 9)", () => {
    const state = withBatch((s) => [
      row(s, 2, -4520, {
        description: "Groceries",
        assignment: { type: "category", categoryId: categoryNamed(s, "expense", "Groceries") },
      }),
      row(s, 3, 245000, {
        description: "Salary August",
        assignment: { type: "category", categoryId: categoryNamed(s, "income", "Salary") },
      }),
      row(s, 4, -999, { description: "Monthly plan" }),
    ]);
    const next = confirmed(state);

    expect(added(state, next)).toEqual([
      {
        id: "new-1",
        seq: 8,
        date: "2026-08-01",
        amountCents: 4520,
        accountId: state.pendingBatch!.accountId,
        description: "Groceries",
        kind: "expense",
        categoryId: categoryNamed(state, "expense", "Groceries"),
      },
      expect.objectContaining({ seq: 9, amountCents: 245000, kind: "income" }),
      expect.objectContaining({
        seq: 10,
        amountCents: 999,
        kind: "expense",
        categoryId: protectedCategory(state.categories, "expense", "uncategorised").id,
      }),
    ]);
    expect(accountBalance(next, state.pendingBatch!.accountId)).toBe(-500 - 4520 + 245000 - 999);
    expect(next.pendingBatch).toBeNull();
  });

  test("books a category the AI suggested exactly as a chosen one, without the mark (FR-093)", () => {
    const groceries = (s: State) => categoryNamed(s, "expense", "Groceries");
    const chosen = withBatch((s) => [
      row(s, 2, -4520, { assignment: { type: "category", categoryId: groceries(s) } }),
    ]);
    const suggested = withBatch((s) => [
      row(s, 2, -4520, {
        assignment: { type: "category", categoryId: groceries(s), suggested: true },
      }),
    ]);

    const booked = added(suggested, confirmed(suggested));

    expect(booked).toStrictEqual(added(chosen, confirmed(chosen)));
    expect(booked[0]).not.toHaveProperty("suggested");
  });

  test("books a payment to the credit card as a transfer with no category (scenario 7)", () => {
    const transfer: Assignment = { type: "transfer", counterAccountId: "card" };
    const state = withBatch((s) => [row(s, 2, -25000, { assignment: transfer })]);
    const next = confirmed(state);
    const cash = state.pendingBatch!.accountId;

    expect(added(state, next)).toEqual([
      {
        id: "new-1",
        seq: 8,
        date: "2026-08-01",
        amountCents: 25000,
        accountId: cash,
        description: "Row 2",
        kind: "transfer",
        destinationAccountId: "card",
      },
    ]);
    expect(accountBalance(next, "card")).toBe(25000);
  });

  test("books money in marked as a transfer as coming from the counter-account", () => {
    const transfer: Assignment = { type: "transfer", counterAccountId: "card" };
    const state = withBatch((s) => [row(s, 2, 1000, { assignment: transfer })]);
    expect(added(state, confirmed(state))).toEqual([
      expect.objectContaining({
        kind: "transfer",
        accountId: "card",
        destinationAccountId: state.pendingBatch!.accountId,
        amountCents: 1000,
      }),
    ]);
  });

  test("leaves out excluded duplicates and unparsable rows, but books an included duplicate", () => {
    const state = withBatch((s) => [
      row(s, 2, -100, { duplicate: true, included: false }),
      {
        rowNumber: 3,
        status: "unparsable",
        cells: ["32.08.2026", "", "", "-2,80"],
        failure: { code: "date-unreadable" },
      },
      row(s, 4, -200, { duplicate: true, included: true }),
      row(s, 5, -300),
    ]);
    const changes = confirmBatch(state, testContext());
    expect(changes.transactions?.put?.map((t) => [t.seq, t.amountCents])).toEqual([
      [8, 200],
      [9, 300],
    ]);
  });

  test("books a zero amount as an expense of 0.00 (FR-023)", () => {
    const state = withBatch((s) => [row(s, 2, 0)]);
    expect(added(state, confirmed(state))).toEqual([
      expect.objectContaining({ kind: "expense", amountCents: 0 }),
    ]);
  });

  test("removes the batch and leaves the settings alone (FR-006)", () => {
    const state = withBatch((s) => [row(s, 2, -100)]);
    const changes = confirmBatch(state, testContext());
    expect(changes.pendingBatch).toEqual({ delete: ["batch"] });
    expect(changes.settings).toBeUndefined();
  });

  test("changes nothing when no batch is pending, so a second confirmation is harmless", () => {
    expect(confirmBatch(seedState(idCounter()), testContext())).toEqual({});
  });
});

describe("discardBatch (FR-027)", () => {
  test("removes the batch and books nothing (scenario 10)", () => {
    const state = withBatch((s) => [row(s, 2, -100), row(s, 3, 500)]);
    const next = applyValid(state, discardBatch(state));
    expect(next.pendingBatch).toBeNull();
    expect(next.transactions).toBe(state.transactions);
  });

  test("changes nothing when no batch is pending", () => {
    expect(discardBatch(seedState(idCounter()))).toEqual({});
  });
});
