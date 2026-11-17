import { describe, expect, test } from "vitest";
import { protectedCategory } from "../categories";
import { seedState } from "../seed";
import { applyValid, idCounter } from "../testing";
import type { Category, CategorisedTransaction, ParsedRow, State, Transaction } from "../types";
import { pairFits, pairTransfers } from "./transfers";

// FR-142, FR-144, R-41, contracts/csv-import.md, suggested transfers. A row of a batch pairs with
// the other side of a transfer already in the ledger: an expense or income of equal amount on
// another account, up to 4 days apart. `pairTransfers` also takes the categories, to leave out
// reconciliation entries ("Unaccounted"), which are not the other side of anything.

const card = "card";
const checking = "checking";
const savings = "savings";

const categories: readonly Category[] = seedState(idCounter()).categories;
const groceries = categories.find((c) => c.side === "expense" && c.name === "Groceries")!;
const salary = categories.find((c) => c.side === "income" && c.name === "Salary")!;
const unaccountedExpense = protectedCategory(categories, "expense", "unaccounted");
const unaccountedIncome = protectedCategory(categories, "income", "unaccounted");

interface PairingRow {
  status: "parsed";
  rowNumber: number;
  date: string;
  amountCents: number;
  duplicate?: boolean;
}

function row(rowNumber: number, date: string, amountCents: number, duplicate = false): PairingRow {
  return { status: "parsed", rowNumber, date, amountCents, duplicate };
}

let seq = 0;
function expense(
  id: string,
  date: string,
  amountCents: number,
  accountId = checking,
  categoryId = groceries.id,
): CategorisedTransaction {
  return {
    id,
    seq: (seq += 1),
    date,
    amountCents,
    accountId,
    description: "Payment",
    kind: "expense",
    categoryId,
  };
}

const income = (
  id: string,
  date: string,
  amountCents: number,
  accountId = checking,
): CategorisedTransaction => ({
  ...expense(id, date, amountCents, accountId, salary.id),
  kind: "income",
});

/** The pairs as `row number → transaction id`, which is what these tests compare. */
function paired(
  rows: readonly PairingRow[],
  ledger: readonly Transaction[],
  accountId = card,
): Record<number, string> {
  const result = pairTransfers(rows, accountId, ledger, categories);
  return Object.fromEntries(
    [...result].map(([rowNumber, pair]) => [rowNumber, pair.transactionId]),
  );
}

describe("pairTransfers: what pairs", () => {
  test.each([0, 2, 4])(
    "a row with money in pairs with an expense of equal amount on another account %i days before or after it",
    (days) => {
      const day = (offset: number) => `2026-03-${String(10 + offset).padStart(2, "0")}`;
      expect(paired([row(2, day(0), 50000)], [expense("before", day(-days), 50000)])).toEqual({
        2: "before",
      });
      expect(paired([row(2, day(0), 50000)], [expense("after", day(days), 50000)])).toEqual({
        2: "after",
      });
    },
  );

  test.each([0, 2, 4])(
    "a row with money out pairs with an income of equal amount on another account %i days away",
    (days) => {
      const date = `2026-03-${String(10 + days).padStart(2, "0")}`;
      expect(paired([row(2, "2026-03-10", -50000)], [income("pay", date, 50000)])).toEqual({
        2: "pay",
      });
    },
  );

  test("5 days apart pairs nothing, whichever way", () => {
    expect(paired([row(2, "2026-03-10", 50000)], [expense("late", "2026-03-15", 50000)])).toEqual(
      {},
    );
    expect(paired([row(2, "2026-03-10", 50000)], [expense("early", "2026-03-05", 50000)])).toEqual(
      {},
    );
  });

  test("the result names, per row number, the paired transaction's id and its account", () => {
    const result = pairTransfers(
      [row(2, "2026-03-10", 50000)],
      card,
      [expense("t1", "2026-03-09", 50000, savings)],
      categories,
    );
    expect(result.get(2)).toEqual({ transactionId: "t1", accountId: savings });
    expect(result.size).toBe(1);
  });

  test("pairs rows of every direction in one batch, each with its own other side", () => {
    const rows = [row(2, "2026-03-10", 50000), row(3, "2026-03-11", -1999)];
    const ledger = [expense("out", "2026-03-10", 50000), income("in", "2026-03-11", 1999)];
    expect(paired(rows, ledger)).toEqual({ 2: "out", 3: "in" });
  });
});

describe("pairTransfers: what never pairs", () => {
  const rows = [row(2, "2026-03-10", 50000)];

  test("a transaction on the batch's account", () => {
    expect(paired(rows, [expense("same", "2026-03-10", 50000, card)])).toEqual({});
  });

  test("a transfer", () => {
    const transfer: Transaction = {
      id: "transfer",
      seq: 1,
      date: "2026-03-10",
      amountCents: 50000,
      accountId: checking,
      description: "To savings",
      kind: "transfer",
      destinationAccountId: savings,
    };
    expect(paired(rows, [transfer])).toEqual({});
  });

  test("an expense or an income in Unaccounted", () => {
    expect(
      paired(rows, [expense("lost", "2026-03-10", 50000, checking, unaccountedExpense.id)]),
    ).toEqual({});
    expect(
      paired(
        [row(2, "2026-03-10", -50000)],
        [{ ...income("found", "2026-03-10", 50000), categoryId: unaccountedIncome.id }],
      ),
    ).toEqual({});
  });

  test("a different amount", () => {
    expect(paired(rows, [expense("other", "2026-03-10", 50001)])).toEqual({});
  });

  test("an amount of zero", () => {
    expect(paired([row(2, "2026-03-10", 0)], [expense("nothing", "2026-03-10", 0)])).toEqual({});
  });

  test("the same direction: money in with an income, money out with an expense", () => {
    expect(paired(rows, [income("in", "2026-03-10", 50000)])).toEqual({});
    expect(paired([row(2, "2026-03-10", -50000)], [expense("out", "2026-03-10", 50000)])).toEqual(
      {},
    );
  });

  test("a row flagged as a duplicate takes no part", () => {
    const flagged = [row(2, "2026-03-10", 50000, true)];
    expect(paired(flagged, [expense("t1", "2026-03-10", 50000)])).toEqual({});
    // Nor does it hold the transaction back from the next row.
    expect(
      paired([flagged[0]!, row(3, "2026-03-10", 50000)], [expense("t1", "2026-03-10", 50000)]),
    ).toEqual({ 3: "t1" });
  });

  test("an unparsable row", () => {
    expect(
      pairTransfers(
        [{ status: "unparsable", rowNumber: 2 }],
        card,
        [expense("t1", "2026-03-10", 50000)],
        categories,
      ).size,
    ).toBe(0);
  });
});

describe("pairTransfers: each side pairs once (scenario 6)", () => {
  test("rows of 500.00 on 3 and 5 March against an expense on 4 March: the earlier row pairs", () => {
    const rows = [row(2, "2026-03-03", 50000), row(3, "2026-03-05", 50000)];
    expect(paired(rows, [expense("t1", "2026-03-04", 50000)])).toEqual({ 2: "t1" });
  });

  test("two rows and one transaction: the row on the closer date pairs, not the lower number", () => {
    const rows = [row(2, "2026-03-07", 50000), row(3, "2026-03-05", 50000)];
    expect(paired(rows, [expense("t1", "2026-03-04", 50000)])).toEqual({ 3: "t1" });
  });

  test("two rows and two transactions: the closest pair is made first, the other row takes what is left", () => {
    // Row 2 is 1 day from "near" and 3 from "far"; row 3 is 1 day from "far", 5 from "near".
    const rows = [row(2, "2026-03-10", 50000), row(3, "2026-03-14", 50000)];
    const ledger = [expense("far", "2026-03-13", 50000), expense("near", "2026-03-09", 50000)];
    expect(paired(rows, ledger)).toEqual({ 2: "near", 3: "far" });
  });

  test("one row and two transactions at equal days: the earlier by date, then by seq", () => {
    const rows = [row(2, "2026-03-10", 50000)];
    expect(
      paired(rows, [
        expense("later", "2026-03-11", 50000),
        expense("earlier", "2026-03-09", 50000),
      ]),
    ).toEqual({ 2: "earlier" });

    const first = expense("first", "2026-03-11", 50000);
    const second = expense("second", "2026-03-11", 50000, savings);
    expect(paired(rows, [second, first])).toEqual({ 2: "first" });
  });

  test("the outcome is the same whatever order the ledger and the rows come in", () => {
    const rows = [
      row(2, "2026-03-10", 50000),
      row(3, "2026-03-10", 50000),
      row(4, "2026-03-12", 50000),
    ];
    const ledger = [
      expense("a", "2026-03-09", 50000),
      expense("b", "2026-03-11", 50000),
      expense("c", "2026-03-13", 50000),
    ];
    const expected = paired(rows, ledger);
    expect(paired([...rows].reverse(), [...ledger].reverse())).toEqual(expected);
    expect(Object.keys(expected)).toHaveLength(3);
  });
});

describe("pairFits", () => {
  function state(transactions: Transaction[]): State {
    const base = seedState(idCounter());
    return applyValid(base, {
      accounts: {
        put: [
          { id: checking, name: "Checking", type: "checking", openingBalanceCents: 0 },
          { id: card, name: "Card", type: "credit-card", openingBalanceCents: 0 },
          { id: savings, name: "Savings", type: "savings", openingBalanceCents: 0 },
        ],
      },
      transactions: { put: transactions },
    });
  }

  /** A row holding its suggested transfer, which T171 and T199 start it with. */
  const suggested = (pairedTransactionId = "t1"): ParsedRow =>
    ({
      rowNumber: 2,
      status: "parsed",
      date: "2026-03-10",
      amountCents: 50000,
      description: "Payment received",
      counterparty: "Card payment",
      duplicate: false,
      included: true,
      assignment: { type: "transfer", counterAccountId: checking, pairedTransactionId },
    }) as unknown as ParsedRow;

  test("is true for an unchanged pair", () => {
    expect(pairFits(suggested(), state([expense("t1", "2026-03-09", 50000)]))).toBe(true);
    expect(
      pairFits(
        { ...suggested(), amountCents: -50000 } as ParsedRow,
        state([income("t1", "2026-03-09", 50000)]),
      ),
    ).toBe(true);
  });

  test("is false once the paired transaction is deleted", () => {
    expect(pairFits(suggested(), state([]))).toBe(false);
  });

  test("is false once the paired transaction changed in amount", () => {
    expect(pairFits(suggested(), state([expense("t1", "2026-03-09", 50100)]))).toBe(false);
  });

  test("is false once the paired transaction moved to another account", () => {
    expect(pairFits(suggested(), state([expense("t1", "2026-03-09", 50000, savings)]))).toBe(false);
  });

  test("is false once the paired transaction became a transfer", () => {
    const transfer: Transaction = {
      id: "t1",
      seq: 1,
      date: "2026-03-09",
      amountCents: 50000,
      accountId: checking,
      description: "Payment",
      kind: "transfer",
      destinationAccountId: card,
    };
    expect(pairFits(suggested(), state([transfer]))).toBe(false);
  });

  test("is false for a row that holds no suggested transfer", () => {
    const plain = {
      ...suggested(),
      assignment: { type: "transfer", counterAccountId: checking },
    } as ParsedRow;
    expect(pairFits(plain, state([expense("t1", "2026-03-09", 50000)]))).toBe(false);
  });
});
