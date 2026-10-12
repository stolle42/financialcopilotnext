import { describe, expect, test } from "vitest";
import { protectedCategory } from "../categories";
import { seedState } from "../seed";
import { applyValid, changesOf, idCounter } from "../testing";
import type { Assignment, ParsedRow, Side, State } from "../types";
import { assignGroup, assignRow, includeDuplicate } from "./review";

// FR-023, FR-025, FR-026; contracts/ui.md, review; contracts/csv-import.md, vendor groups.

const categoryNamed = (state: State, side: Side, name: string) =>
  state.categories.find((c) => c.side === side && c.name === name)!.id;
const uncategorised = (state: State, side: Side): Assignment => ({
  type: "category",
  categoryId: protectedCategory(state.categories, side, "uncategorised").id,
});

/** Cash, a credit card account, and a pending batch on Cash with a Shop group of two. */
function withBatch(): State {
  const seeded = seedState(idCounter());
  const cash = seeded.accounts[0]!.id;
  const row = (rowNumber: number, amountCents: number, fields: Partial<ParsedRow> = {}) => ({
    rowNumber,
    status: "parsed" as const,
    date: "2026-08-01",
    amountCents,
    description: "",
    counterparty: "Shop",
    duplicate: false,
    included: true,
    assignment: uncategorised(seeded, amountCents > 0 ? "income" : "expense"),
    ...fields,
  });
  return applyValid(seeded, {
    accounts: {
      put: [{ id: "card", name: "Credit card", type: "credit-card", openingBalanceCents: 0 }],
    },
    pendingBatch: {
      put: [
        {
          id: "batch",
          accountId: cash,
          fileName: "mybank-2026-08.csv",
          createdAt: "2026-09-03T10:00:00.000Z",
          rows: [
            row(2, -4520),
            row(3, -1299),
            row(4, 1299),
            row(5, -3000, { duplicate: true, included: false }),
            row(6, -10000, { counterparty: null }),
            {
              rowNumber: 7,
              status: "unparsable",
              cells: ["32.08.2026", "Kiosk", "Newspaper", "-2,80"],
              failure: { code: "date-unreadable" },
            },
          ],
        },
      ],
    },
  });
}

const rowOf = (state: State, rowNumber: number) =>
  state.pendingBatch!.rows.find((row) => row.rowNumber === rowNumber) as ParsedRow;

const shopExpenses = { key: "shop", side: "expense" as const };

/** `state` with the rows numbered `rowNumbers` holding `categoryId` as Claude's suggestion. */
function withSuggestion(state: State, rowNumbers: number[], categoryId: string): State {
  const batch = state.pendingBatch!;
  const suggested: Assignment = { type: "category", categoryId, suggested: true };
  const rows = batch.rows.map((row) =>
    row.status === "parsed" && rowNumbers.includes(row.rowNumber)
      ? { ...row, assignment: suggested }
      : row,
  );
  return applyValid(state, { pendingBatch: { put: [{ ...batch, rows }] } });
}

describe("assignGroup (FR-026)", () => {
  test("assigns a category to every row currently in the group, and to no other row (scenario 4)", () => {
    const state = withBatch();
    const groceries: Assignment = {
      type: "category",
      categoryId: categoryNamed(state, "expense", "Groceries"),
    };
    const next = applyValid(state, changesOf(assignGroup(state, shopExpenses, groceries)));
    expect([2, 3].map((n) => rowOf(next, n).assignment)).toEqual([groceries, groceries]);
    // The refund is on the other side, and the excluded duplicate is not under review.
    expect([4, 5, 6].map((n) => rowOf(next, n).assignment)).toEqual(
      [4, 5, 6].map((n) => rowOf(state, n).assignment),
    );
  });

  test("includes a duplicate that was included into the group", () => {
    const state = withBatch();
    const included = applyValid(state, changesOf(includeDuplicate(state, 5, true)));
    const travel: Assignment = {
      type: "category",
      categoryId: categoryNamed(state, "expense", "Travel"),
    };
    const next = applyValid(included, changesOf(assignGroup(included, shopExpenses, travel)));
    expect(rowOf(next, 5).assignment).toEqual(travel);
  });

  test("makes every row of the group a transfer", () => {
    const state = withBatch();
    const transfer: Assignment = { type: "transfer", counterAccountId: "card" };
    const next = applyValid(state, changesOf(assignGroup(state, shopExpenses, transfer)));
    expect([2, 3].map((n) => rowOf(next, n).assignment)).toEqual([transfer, transfer]);
  });

  test("refuses a category from the other side", () => {
    const state = withBatch();
    const salary: Assignment = {
      type: "category",
      categoryId: categoryNamed(state, "income", "Salary"),
    };
    expect(assignGroup(state, shopExpenses, salary)).toEqual({ code: "assignment-not-allowed" });
  });
});

describe("assignRow", () => {
  test("gives one row of a group its own category without changing the others (scenario 5)", () => {
    const state = withBatch();
    const eatingOut: Assignment = {
      type: "category",
      categoryId: categoryNamed(state, "expense", "Eating out"),
    };
    const next = applyValid(state, changesOf(assignRow(state, 3, eatingOut)));
    expect(rowOf(next, 3).assignment).toEqual(eatingOut);
    expect(rowOf(next, 2).assignment).toEqual(rowOf(state, 2).assignment);
  });

  test("marks a payment to the user's own credit card as a transfer (scenario 7, FR-023)", () => {
    const state = withBatch();
    const transfer: Assignment = { type: "transfer", counterAccountId: "card" };
    const next = applyValid(state, changesOf(assignRow(state, 6, transfer)));
    expect(rowOf(next, 6).assignment).toEqual(transfer);
  });

  test("restores the side's Uncategorised when the transfer is turned off", () => {
    const state = withBatch();
    const transfer: Assignment = { type: "transfer", counterAccountId: "card" };
    const asTransfer = applyValid(state, changesOf(assignRow(state, 4, transfer)));
    const next = applyValid(asTransfer, changesOf(assignRow(asTransfer, 4, "uncategorised")));
    expect(rowOf(next, 4).assignment).toEqual(uncategorised(state, "income"));
  });

  test("refuses Unaccounted, which only reconciliation assigns (FR-030)", () => {
    const state = withBatch();
    const unaccounted: Assignment = {
      type: "category",
      categoryId: protectedCategory(state.categories, "expense", "unaccounted").id,
    };
    expect(assignRow(state, 2, unaccounted)).toEqual({ code: "assignment-not-allowed" });
  });

  test("refuses a category of the other side, and one that does not exist", () => {
    const state = withBatch();
    const gifts: Assignment = {
      type: "category",
      categoryId: categoryNamed(state, "income", "Gifts"),
    };
    expect(assignRow(state, 2, gifts)).toEqual({ code: "assignment-not-allowed" });
    expect(assignRow(state, 4, gifts)).not.toHaveProperty("code");
    expect(assignRow(state, 2, { type: "category", categoryId: "gone" })).toEqual({
      code: "assignment-not-allowed",
    });
  });

  test("refuses a transfer to the batch account itself or to an account that does not exist", () => {
    const state = withBatch();
    const batchAccount = state.pendingBatch!.accountId;
    expect(assignRow(state, 2, { type: "transfer", counterAccountId: batchAccount })).toEqual({
      code: "assignment-not-allowed",
    });
    expect(assignRow(state, 2, { type: "transfer", counterAccountId: "gone" })).toEqual({
      code: "assignment-not-allowed",
    });
  });

  test("throws for a row that is not a parsed row of the batch", () => {
    const state = withBatch();
    expect(() => assignRow(state, 7, "uncategorised")).toThrow();
    expect(() => assignRow(state, 99, "uncategorised")).toThrow();
  });
});

describe("the suggested mark (FR-093)", () => {
  test("stores a chosen category without the mark, even when the choice carries one", () => {
    const state = withBatch();
    const groceries = categoryNamed(state, "expense", "Groceries");
    const choice: Assignment = { type: "category", categoryId: groceries, suggested: true };

    const next = applyValid(state, changesOf(assignRow(state, 2, choice)));

    expect(rowOf(next, 2).assignment).toStrictEqual({ type: "category", categoryId: groceries });
  });

  test("removes the mark when the user chooses the suggested category itself", () => {
    const groceries = categoryNamed(withBatch(), "expense", "Groceries");
    const state = withSuggestion(withBatch(), [2], groceries);

    const next = applyValid(
      state,
      changesOf(assignRow(state, 2, { type: "category", categoryId: groceries })),
    );

    expect(rowOf(next, 2).assignment).toStrictEqual({ type: "category", categoryId: groceries });
  });

  test("removes the mark when the user chooses another category, a transfer or Uncategorised", () => {
    const groceries = categoryNamed(withBatch(), "expense", "Groceries");
    const state = withSuggestion(withBatch(), [2, 3, 6], groceries);
    const travel: Assignment = {
      type: "category",
      categoryId: categoryNamed(state, "expense", "Travel"),
    };
    const transfer: Assignment = { type: "transfer", counterAccountId: "card" };

    let next = applyValid(state, changesOf(assignRow(state, 2, travel)));
    next = applyValid(next, changesOf(assignRow(next, 3, transfer)));
    next = applyValid(next, changesOf(assignRow(next, 6, "uncategorised")));

    expect(rowOf(next, 2).assignment).toStrictEqual(travel);
    expect(rowOf(next, 3).assignment).toStrictEqual(transfer);
    expect(rowOf(next, 6).assignment).toStrictEqual(uncategorised(state, "expense"));
  });

  test("removes the marks of a group's rows when the user chooses for the group", () => {
    const groceries = categoryNamed(withBatch(), "expense", "Groceries");
    const state = withSuggestion(withBatch(), [2, 3], groceries);
    const choice: Assignment = { type: "category", categoryId: groceries, suggested: true };

    const next = applyValid(state, changesOf(assignGroup(state, shopExpenses, choice)));

    for (const rowNumber of [2, 3]) {
      expect(rowOf(next, rowNumber).assignment).toStrictEqual({
        type: "category",
        categoryId: groceries,
      });
    }
  });

  test("keeps the mark of a row the choice does not reach", () => {
    const groceries = categoryNamed(withBatch(), "expense", "Groceries");
    const state = withSuggestion(withBatch(), [2, 3], groceries);
    const travel: Assignment = {
      type: "category",
      categoryId: categoryNamed(state, "expense", "Travel"),
    };

    const next = applyValid(state, changesOf(assignRow(state, 3, travel)));

    expect(rowOf(next, 2).assignment).toStrictEqual({
      type: "category",
      categoryId: groceries,
      suggested: true,
    });
  });
});

describe("includeDuplicate (FR-025)", () => {
  test("includes a flagged row, and excludes it again", () => {
    const state = withBatch();
    const included = applyValid(state, changesOf(includeDuplicate(state, 5, true)));
    expect(rowOf(included, 5)).toMatchObject({ duplicate: true, included: true });
    const excluded = applyValid(included, changesOf(includeDuplicate(included, 5, false)));
    expect(rowOf(excluded, 5)).toMatchObject({ duplicate: true, included: false });
  });

  test("keeps the row's own assignment", () => {
    const state = withBatch();
    const included = applyValid(state, changesOf(includeDuplicate(state, 5, true)));
    expect(rowOf(included, 5).assignment).toEqual(rowOf(state, 5).assignment);
  });

  test("refuses a row that is not flagged", () => {
    const state = withBatch();
    expect(includeDuplicate(state, 2, false)).toEqual({ code: "row-not-duplicate" });
  });
});
