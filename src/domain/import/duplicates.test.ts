import { describe, expect, test } from "vitest";
import type { Transaction } from "../types";
import { flagDuplicates, type MatchableRow } from "./duplicates";

// contracts/csv-import.md, duplicate matching; FR-024, R-10.

const checking = "checking";
const card = "card";

function row(rowNumber: number, date: string, amountCents: number): MatchableRow {
  return { status: "parsed", rowNumber, date, amountCents };
}

function expense(id: string, date: string, amountCents: number, accountId = checking): Transaction {
  return {
    id,
    seq: Number(id.replace(/\D/g, "")) || 1,
    date,
    amountCents,
    accountId,
    description: "Weekly shop",
    kind: "expense",
    categoryId: "groceries",
  };
}

const income = (id: string, date: string, amountCents: number): Transaction => ({
  ...expense(id, date, amountCents),
  kind: "income",
  categoryId: "salary",
});

const transfer = (id: string, date: string, amountCents: number): Transaction => ({
  id,
  seq: 9,
  date,
  amountCents,
  accountId: checking,
  description: "Card payment",
  kind: "transfer",
  destinationAccountId: card,
});

describe("flagDuplicates", () => {
  test("flags every row of a file that is already in the ledger", () => {
    const ledger = [expense("t1", "2026-08-01", 4520), income("t2", "2026-08-01", 245000)];
    const rows = [row(2, "2026-08-01", -4520), row(3, "2026-08-01", 245000)];
    expect(flagDuplicates(rows, checking, ledger)).toEqual(new Set([2, 3]));
  });

  test("flags only the overlapping part of a date range", () => {
    const ledger = [expense("t1", "2026-08-28", 1299)];
    const rows = [row(2, "2026-08-28", -1299), row(3, "2026-09-02", -1299)];
    expect(flagDuplicates(rows, checking, ledger)).toEqual(new Set([2]));
  });

  test("flags the other leg of a transfer on the destination account", () => {
    const ledger = [transfer("t1", "2026-08-15", 25000)];
    expect(flagDuplicates([row(2, "2026-08-15", 25000)], card, ledger)).toEqual(new Set([2]));
  });

  test("flags a row matching a transfer on its source account", () => {
    const ledger = [transfer("t1", "2026-08-15", 25000)];
    expect(flagDuplicates([row(2, "2026-08-15", -25000)], checking, ledger)).toEqual(new Set([2]));
  });

  test("flags the second of two identical rows in one file, not the first", () => {
    const rows = [row(2, "2026-08-12", -200), row(3, "2026-08-12", -200)];
    expect(flagDuplicates(rows, checking, [])).toEqual(new Set([3]));
  });

  test("leaves a purchase and its same-day refund unflagged, since the money moves both ways", () => {
    const rows = [row(2, "2026-08-05", -1299), row(3, "2026-08-05", 1299)];
    expect(flagDuplicates(rows, checking, [])).toEqual(new Set());
    const ledger = [expense("t1", "2026-08-05", 1299)];
    expect(flagDuplicates([row(2, "2026-08-05", 1299)], checking, ledger)).toEqual(new Set());
  });

  test("flags a match whatever its description says", () => {
    const rows = [{ ...row(2, "2026-08-01", -4520), description: "SHOP REF 123" }];
    expect(flagDuplicates(rows, checking, [expense("t1", "2026-08-01", 4520)])).toEqual(
      new Set([2]),
    );
  });

  test("needs the same account and the exact date", () => {
    const ledger = [expense("t1", "2026-08-01", 4520, card), expense("t2", "2026-08-02", 4520)];
    expect(flagDuplicates([row(2, "2026-08-01", -4520)], checking, ledger)).toEqual(new Set());
  });

  test("matches zero amounts with each other", () => {
    const rows = [row(2, "2026-08-01", 0)];
    expect(flagDuplicates(rows, checking, [expense("t1", "2026-08-01", 0)])).toEqual(new Set([2]));
  });

  test("ignores unparsable rows, as matches and as rows to flag", () => {
    const rows: MatchableRow[] = [
      { status: "unparsable", rowNumber: 2 },
      row(3, "2026-08-12", -200),
      { status: "unparsable", rowNumber: 4 },
      row(5, "2026-08-13", -200),
    ];
    expect(flagDuplicates(rows, checking, [])).toEqual(new Set());
  });
});

// FR-156, contracts/csv-import.md, duplicate matching: a transfer is booked on the day each bank
// shows it, so a row matches a transfer of the ledger up to 4 days apart, on the side that is the
// row's account and with the direction the row shows. Everything else matches on the exact date.
describe("flagDuplicates: transfers within 4 days (FR-156)", () => {
  const savings = "savings";

  const move = (id: string, date: string, amountCents = 25000): Transaction => ({
    id,
    seq: 3,
    date,
    amountCents,
    accountId: checking,
    description: "To savings",
    kind: "transfer",
    destinationAccountId: savings,
  });

  test("a row on Savings with money in matches the transfer from Checking 2 days earlier, on its destination side", () => {
    const ledger = [move("t1", "2026-04-30")];
    expect(flagDuplicates([row(2, "2026-05-02", 25000)], savings, ledger)).toEqual(new Set([2]));
  });

  test.each([0, 1, 2, 3, 4])(
    "a row on Checking with money out matches the transfer %i days away, before or after",
    (days) => {
      const ledger = [move("t1", "2026-05-10")];
      const day = (offset: number) => `2026-05-${String(10 + offset).padStart(2, "0")}`;
      expect(flagDuplicates([row(2, day(-days), -25000)], checking, ledger)).toEqual(new Set([2]));
      expect(flagDuplicates([row(2, day(days), -25000)], checking, ledger)).toEqual(new Set([2]));
    },
  );

  test("5 days apart matches nothing, on either side", () => {
    const ledger = [move("t1", "2026-05-10")];
    expect(flagDuplicates([row(2, "2026-05-15", -25000)], checking, ledger)).toEqual(new Set());
    expect(flagDuplicates([row(2, "2026-05-05", 25000)], savings, ledger)).toEqual(new Set());
  });

  test("the direction must agree on the row's account", () => {
    const ledger = [move("t1", "2026-05-10")];
    // Savings received the money, so a row on Savings with money out is another payment.
    expect(flagDuplicates([row(2, "2026-05-10", -25000)], savings, ledger)).toEqual(new Set());
    // Checking paid it out, so a row on Checking with money in is another payment too.
    expect(flagDuplicates([row(2, "2026-05-10", 25000)], checking, ledger)).toEqual(new Set());
  });

  test("the amount must still be equal", () => {
    const ledger = [move("t1", "2026-05-10")];
    expect(flagDuplicates([row(2, "2026-05-10", -25001)], checking, ledger)).toEqual(new Set());
  });

  test("expenses and incomes still match on the exact date only", () => {
    const ledger = [expense("t1", "2026-08-10", 4520), income("t2", "2026-08-10", 245000)];
    expect(flagDuplicates([row(2, "2026-08-11", -4520)], checking, ledger)).toEqual(new Set());
    expect(flagDuplicates([row(2, "2026-08-09", 245000)], checking, ledger)).toEqual(new Set());
    expect(flagDuplicates([row(2, "2026-08-10", -4520)], checking, ledger)).toEqual(new Set([2]));
  });

  test("earlier rows of the same batch still match on the exact date only", () => {
    const rows = [
      row(2, "2026-08-12", -200),
      row(3, "2026-08-13", -200),
      row(4, "2026-08-12", -200),
    ];
    expect(flagDuplicates(rows, checking, [])).toEqual(new Set([4]));
  });

  test("a transfer on another account's pair of sides takes no part", () => {
    const elsewhere: Transaction = { ...move("t1", "2026-05-10"), accountId: card };
    expect(flagDuplicates([row(2, "2026-05-10", -25000)], checking, [elsewhere])).toEqual(
      new Set(),
    );
  });
});
