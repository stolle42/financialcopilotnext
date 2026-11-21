import { describe, expect, test } from "vitest";
import { protectedCategory } from "../categories";
import { seedState } from "../seed";
import { applyValid, changesOf, idCounter } from "../testing";
import type { Assignment, ParsedRow, Side, State } from "../types";
import { proposedSide } from "./direction";
import {
  assignGroup,
  assignRow,
  bringBack,
  includeDuplicate,
  markGroupSeen,
  markSeen,
} from "./review";

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

/** `state` with the rows numbered `rowNumbers` holding `categoryId` as the AI's suggestion. */
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

// FR-143, data-model.md, state transitions: a row holding a suggested transfer sits outside its
// vendor group, ends the suggestion when the user turns Transfer off or picks another counter-
// account, and gets its usual category back when it has one. The fields of the suggestion are not
// typed yet, so the rows are written through a cast.
describe("review of a suggested transfer (FR-143)", () => {
  /** `withBatch()` with rows 3 and 4 holding a suggested transfer to Credit card. */
  function withSuggested(usualCategoryId?: string): State {
    const state = withBatch();
    const batch = state.pendingBatch!;
    // The usual category is of one side, so only the rows of that side remember it (invariant 8).
    const usualSide = state.categories.find((c) => c.id === usualCategoryId)?.side;
    const suggestion = (row: ParsedRow) =>
      ({
        type: "transfer",
        counterAccountId: "card",
        pairedTransactionId: `pair-${row.rowNumber}`,
        ...(usualCategoryId && usualSide === proposedSide(row.amountCents)
          ? { usualCategoryId }
          : {}),
      }) as unknown as Assignment;
    const rows = batch.rows.map((row) =>
      row.status === "parsed" && (row.rowNumber === 3 || row.rowNumber === 4)
        ? { ...row, assignment: suggestion(row) }
        : row,
    );
    return applyValid(state, { pendingBatch: { put: [{ ...batch, rows }] } });
  }

  test("turning Transfer off gives the row its usual category, without marks", () => {
    const groceries = categoryNamed(withBatch(), "expense", "Groceries");
    const state = withSuggested(groceries);

    const next = applyValid(state, changesOf(assignRow(state, 3, "uncategorised")));

    expect(rowOf(next, 3).assignment).toEqual({ type: "category", categoryId: groceries });
  });

  test("turning Transfer off gives the side's Uncategorised when there is no usual category", () => {
    const state = withSuggested();

    const next = applyValid(state, changesOf(assignRow(state, 3, "uncategorised")));

    expect(rowOf(next, 3).assignment).toEqual(uncategorised(state, "expense"));
  });

  test("turning Transfer off on a row of money in uses an income category of its side", () => {
    const salary = categoryNamed(withBatch(), "income", "Salary");
    const state = withSuggested(salary);

    const next = applyValid(state, changesOf(assignRow(state, 4, "uncategorised")));

    expect(rowOf(next, 4).assignment).toEqual({ type: "category", categoryId: salary });
  });

  test("choosing another counter-account leaves an ordinary transfer, without the pair", () => {
    const state = applyValid(withSuggested(), {
      accounts: {
        put: [{ id: "savings", name: "Savings", type: "savings", openingBalanceCents: 0 }],
      },
    });

    const next = applyValid(
      state,
      changesOf(assignRow(state, 3, { type: "transfer", counterAccountId: "savings" })),
    );

    expect(rowOf(next, 3).assignment).toEqual({ type: "transfer", counterAccountId: "savings" });
  });

  test("assigning the row a category directly ends the suggestion", () => {
    const state = withSuggested();
    const groceries = categoryNamed(state, "expense", "Groceries");

    const next = applyValid(
      state,
      changesOf(assignRow(state, 3, { type: "category", categoryId: groceries })),
    );

    expect(rowOf(next, 3).assignment).toEqual({ type: "category", categoryId: groceries });
  });

  test("assigning a category to the vendor group leaves the suggested transfers alone", () => {
    // Row 2 and row 3 are Shop expenses; row 3 holds a suggested transfer, so only row 2 is
    // left in the group, which shows it as a plain row, and assignGroup has no group to reach.
    const state = withSuggested();
    const batch = state.pendingBatch!;
    const rows = batch.rows.map((row) =>
      row.status === "parsed" && row.rowNumber === 5
        ? { ...row, included: true, duplicate: false }
        : row,
    );
    const grouped = applyValid(state, { pendingBatch: { put: [{ ...batch, rows }] } });
    const groceries = categoryNamed(grouped, "expense", "Groceries");

    const next = applyValid(
      grouped,
      changesOf(assignGroup(grouped, shopExpenses, { type: "category", categoryId: groceries })),
    );

    expect(rowOf(next, 3).assignment).toEqual(rowOf(grouped, 3).assignment);
    expect(rowOf(next, 2).assignment).toEqual({ type: "category", categoryId: groceries });
    expect(rowOf(next, 5).assignment).toEqual({ type: "category", categoryId: groceries });
  });
});

// FR-147; contracts/ui.md, review: a mark "From earlier" goes as soon as the user chooses for the
// row, even the very same choice. The mark `usual` is a field of v1.8 the types do not carry yet,
// so the assignments are written through casts.
describe("the usual mark (FR-147)", () => {
  /** `state` with the rows numbered `rowNumbers` holding `assignment` as their usual choice. */
  function withUsual(state: State, rowNumbers: number[], assignment: Assignment): State {
    const batch = state.pendingBatch!;
    const usual = { ...assignment, usual: true } as unknown as Assignment;
    const rows = batch.rows.map((row) =>
      row.status === "parsed" && rowNumbers.includes(row.rowNumber)
        ? { ...row, assignment: usual }
        : row,
    );
    return applyValid(state, { pendingBatch: { put: [{ ...batch, rows }] } });
  }

  const groceriesOf = (state: State): Assignment => ({
    type: "category",
    categoryId: categoryNamed(state, "expense", "Groceries"),
  });
  const toCard: Assignment = { type: "transfer", counterAccountId: "card" };

  test("choosing the usual category itself for a row removes the mark", () => {
    const base = withBatch();
    const state = withUsual(base, [2], groceriesOf(base));

    const next = applyValid(state, changesOf(assignRow(state, 2, groceriesOf(base))));

    expect(rowOf(next, 2).assignment).toStrictEqual(groceriesOf(base));
  });

  test("choosing another category for a row removes the mark", () => {
    const base = withBatch();
    const state = withUsual(base, [2], groceriesOf(base));
    const travel: Assignment = {
      type: "category",
      categoryId: categoryNamed(base, "expense", "Travel"),
    };

    const next = applyValid(state, changesOf(assignRow(state, 2, travel)));

    expect(rowOf(next, 2).assignment).toStrictEqual(travel);
  });

  test("a choice that carries the mark is stored without it", () => {
    const base = withBatch();
    const choice = { ...groceriesOf(base), usual: true } as unknown as Assignment;

    const next = applyValid(base, changesOf(assignRow(base, 2, choice)));

    expect(rowOf(next, 2).assignment).toStrictEqual(groceriesOf(base));
  });

  test("choosing for the group removes the marks of its rows, the usual category included", () => {
    const base = withBatch();
    const state = withUsual(base, [2, 3], groceriesOf(base));

    const next = applyValid(state, changesOf(assignGroup(state, shopExpenses, groceriesOf(base))));

    for (const rowNumber of [2, 3]) {
      expect(rowOf(next, rowNumber).assignment).toStrictEqual(groceriesOf(base));
    }
  });

  test("keeps the mark of a row the choice does not reach", () => {
    const base = withBatch();
    const state = withUsual(base, [2, 3], groceriesOf(base));
    const travel: Assignment = {
      type: "category",
      categoryId: categoryNamed(base, "expense", "Travel"),
    };

    const next = applyValid(state, changesOf(assignRow(state, 3, travel)));

    expect(rowOf(next, 2).assignment).toStrictEqual({ ...groceriesOf(base), usual: true });
  });

  test("turning Transfer on for a row with a usual category removes the mark", () => {
    const base = withBatch();
    const state = withUsual(base, [2], groceriesOf(base));

    const next = applyValid(state, changesOf(assignRow(state, 2, toCard)));

    expect(rowOf(next, 2).assignment).toStrictEqual(toCard);
  });

  test("turning Transfer off for a usual transfer removes the mark, back to Uncategorised", () => {
    const base = withBatch();
    const state = withUsual(base, [2], toCard);

    const next = applyValid(state, changesOf(assignRow(state, 2, "uncategorised")));

    expect(rowOf(next, 2).assignment).toStrictEqual(uncategorised(base, "expense"));
  });

  test("choosing another counter-account for a usual transfer removes the mark", () => {
    const base = withBatch();
    const withSavings = applyValid(base, {
      accounts: {
        put: [{ id: "savings", name: "Savings", type: "savings", openingBalanceCents: 0 }],
      },
    });
    const state = withUsual(withSavings, [2], toCard);
    const other: Assignment = { type: "transfer", counterAccountId: "savings" };

    const next = applyValid(state, changesOf(assignRow(state, 2, other)));

    expect(rowOf(next, 2).assignment).toStrictEqual(other);
  });

  test("choosing the same counter-account for a usual transfer also removes the mark", () => {
    const base = withBatch();
    const state = withUsual(base, [2], toCard);

    const next = applyValid(state, changesOf(assignRow(state, 2, toCard)));

    expect(rowOf(next, 2).assignment).toStrictEqual(toCard);
  });
});

// FR-151, FR-155; data-model.md, pending row; R-44: seen marks live on the rows. `seen` and
// `groupSeen` are fields the types do not carry yet, so they are read through a cast.
describe("seen marks (FR-151)", () => {
  type Marked = { seen?: boolean; groupSeen?: boolean };
  const marksOf = (state: State, rowNumber: number): Marked => rowOf(state, rowNumber) as Marked;

  test("markSeen sets seen on each row named, and on nothing else", () => {
    const state = withBatch();

    const next = applyValid(state, changesOf(markSeen(state, [2, 6])));

    expect(marksOf(next, 2).seen).toBe(true);
    expect(marksOf(next, 6).seen).toBe(true);
    for (const rowNumber of [3, 4, 5]) expect(marksOf(next, rowNumber).seen).toBeUndefined();
    for (const rowNumber of [2, 3, 4, 5, 6]) {
      expect(marksOf(next, rowNumber).groupSeen).toBeUndefined();
    }
  });

  test("markGroupSeen sets groupSeen on each row named, and leaves their own seen as it was", () => {
    const state = applyValid(withBatch(), changesOf(markSeen(withBatch(), [2])));

    const next = applyValid(state, changesOf(markGroupSeen(state, [2, 3])));

    expect(marksOf(next, 2)).toMatchObject({ seen: true, groupSeen: true });
    expect(marksOf(next, 3).groupSeen).toBe(true);
    expect(marksOf(next, 3).seen).toBeUndefined();
    expect(marksOf(next, 4).groupSeen).toBeUndefined();
  });

  test("changes no assignment, mark of an assignment or other field of a row", () => {
    const state = withSuggestion(withBatch(), [2], categoryNamed(withBatch(), "expense", "Travel"));

    const seen = applyValid(state, changesOf(markSeen(state, [2, 3])));
    const grouped = applyValid(seen, changesOf(markGroupSeen(seen, [2, 3])));

    for (const rowNumber of [2, 3]) {
      const copy: Record<string, unknown> = { ...rowOf(grouped, rowNumber) };
      delete copy.seen;
      delete copy.groupSeen;
      expect(copy).toStrictEqual(rowOf(state, rowNumber));
    }
    expect(rowOf(grouped, 2).assignment).toMatchObject({ suggested: true });
  });

  test("marking again changes nothing, and a row that is not in the batch is ignored", () => {
    const state = applyValid(withBatch(), changesOf(markSeen(withBatch(), [2])));

    const next = applyValid(state, changesOf(markSeen(state, [2, 99])));

    expect(next.pendingBatch).toStrictEqual(state.pendingBatch);
  });

  test("marks an unparsable row nowhere: only parsed rows can be seen", () => {
    const state = withBatch();

    const next = applyValid(state, changesOf(markSeen(state, [7])));

    expect(next.pendingBatch).toStrictEqual(state.pendingBatch);
  });
});

describe("keptInReview: what keeps a row out of the set-aside rows (FR-152, FR-153)", () => {
  const keptOf = (state: State, rowNumber: number) =>
    (rowOf(state, rowNumber) as { keptInReview?: boolean }).keptInReview;

  test("assigning a row a category sets keptInReview on it, and on no other row", () => {
    const state = withBatch();
    const groceries: Assignment = {
      type: "category",
      categoryId: categoryNamed(state, "expense", "Groceries"),
    };

    const next = applyValid(state, changesOf(assignRow(state, 3, groceries)));

    expect(keptOf(next, 3)).toBe(true);
    for (const rowNumber of [2, 4, 5, 6]) expect(keptOf(next, rowNumber)).toBeUndefined();
  });

  test("assigning a transfer, or Uncategorised again, sets it as well: any choice counts", () => {
    const state = withBatch();

    const asTransfer = applyValid(
      state,
      changesOf(assignRow(state, 6, { type: "transfer", counterAccountId: "card" })),
    );
    const again = applyValid(state, changesOf(assignRow(state, 2, "uncategorised")));

    expect(keptOf(asTransfer, 6)).toBe(true);
    expect(keptOf(again, 2)).toBe(true);
    expect(rowOf(again, 2).assignment).toEqual(rowOf(state, 2).assignment);
  });

  test("assigning a group sets keptInReview on each row it reaches, and on no other", () => {
    const state = withBatch();
    const travel: Assignment = {
      type: "category",
      categoryId: categoryNamed(state, "expense", "Travel"),
    };

    const next = applyValid(state, changesOf(assignGroup(state, shopExpenses, travel)));

    expect([2, 3].map((n) => keptOf(next, n))).toEqual([true, true]);
    for (const rowNumber of [4, 5, 6]) expect(keptOf(next, rowNumber)).toBeUndefined();
  });

  test("bringBack sets keptInReview and keeps the assignment, with its usual mark", () => {
    const state = withBatch();
    const batch = state.pendingBatch!;
    const usual = {
      type: "category",
      categoryId: categoryNamed(state, "expense", "Groceries"),
      usual: true,
    } as unknown as Assignment;
    const usualRows = batch.rows.map((r) => (r.rowNumber === 2 ? { ...r, assignment: usual } : r));
    const held = applyValid(state, { pendingBatch: { put: [{ ...batch, rows: usualRows }] } });

    const next = applyValid(held, changesOf(bringBack(held, 2)));

    expect(keptOf(next, 2)).toBe(true);
    expect(rowOf(next, 2)).toStrictEqual({ ...rowOf(held, 2), keptInReview: true });
    for (const rowNumber of [3, 4, 5, 6]) {
      expect(rowOf(next, rowNumber)).toStrictEqual(rowOf(held, rowNumber));
    }
  });

  test("bringBack is idempotent", () => {
    const state = withBatch();
    const once = applyValid(state, changesOf(bringBack(state, 3)));
    const twice = applyValid(once, changesOf(bringBack(once, 3)));
    expect(twice.pendingBatch).toStrictEqual(once.pendingBatch);
  });
});
