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
