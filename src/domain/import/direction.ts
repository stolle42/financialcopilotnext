import { parseAmount } from "../amounts";
import type { AmountColumns, DecimalSeparator, Refusal, RowFailureCode, Side } from "../types";

export type AmountFailureCode = Exclude<RowFailureCode, "date-missing" | "date-unreadable">;

type AmountFailure = Refusal<AmountFailureCode>;

/** The side a parsed row is proposed on: money out and zero are expenses (FR-023, R-12). */
export function proposedSide(amountCents: number): Side {
  return amountCents <= 0 ? "expense" : "income";
}

const cellAt = (cells: readonly string[], index: number) => (cells[index] ?? "").trim();

/** One debit or credit cell, read in the order of contracts/csv-import.md, direction. */
type DirectionCell =
  | { kind: "empty" }
  | { kind: "amount"; cents: number }
  | { kind: "failure"; failure: AmountFailure };

function readDirectionCell(cell: string, decimalSeparator: DecimalSeparator): DirectionCell {
  if (cell === "") return { kind: "empty" };
  const cents = parseAmount(cell, decimalSeparator);
  if (cents === null) {
    return {
      kind: "failure",
      failure: { code: "amount-unreadable", details: { cell, decimalSeparator } },
    };
  }
  if (cents === 0) return { kind: "empty" };
  if (cents < 0) {
    return { kind: "failure", failure: { code: "negative-debit-credit", details: { cell } } };
  }
  return { kind: "amount", cents };
}

// When both cells fail, the failure listed first in the contract's table is reported.
const failureOrder: readonly AmountFailureCode[] = ["amount-unreadable", "negative-debit-credit"];

function readDebitCredit(
  debitCell: string,
  creditCell: string,
  decimalSeparator: DecimalSeparator,
): number | AmountFailure {
  const debit = readDirectionCell(debitCell, decimalSeparator);
  const credit = readDirectionCell(creditCell, decimalSeparator);
  for (const code of failureOrder) {
    for (const read of [debit, credit]) {
      if (read.kind === "failure" && read.failure.code === code) return read.failure;
    }
  }
  if (debit.kind === "amount" && credit.kind === "amount") {
    return { code: "debit-and-credit", details: { debit: debitCell, credit: creditCell } };
  }
  if (debit.kind === "amount") return -debit.cents;
  if (credit.kind === "amount") return credit.cents;
  return { code: "no-debit-or-credit" };
}

/**
 * A record's amount as signed cents, negative for money out, or the reason it cannot be read
 * (contracts/csv-import.md, direction). `amount` names the columns by position.
 */
export function readAmount(
  cells: readonly string[],
  amount: AmountColumns<number>,
  decimalSeparator: DecimalSeparator,
): number | AmountFailure {
  if (amount.mode === "debit-credit") {
    return readDebitCredit(
      cellAt(cells, amount.debitColumn),
      cellAt(cells, amount.creditColumn),
      decimalSeparator,
    );
  }
  const cell = cellAt(cells, amount.column);
  if (cell === "") return { code: "amount-missing" };
  const cents = parseAmount(cell, decimalSeparator);
  if (cents === null) return { code: "amount-unreadable", details: { cell, decimalSeparator } };
  // Inverting zero would give -0, which is still zero, so it is left alone.
  return amount.invertSign && cents !== 0 ? -cents : cents;
}
