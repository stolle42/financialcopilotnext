import { daysFromTo } from "../dates";
import type { Category, ParsedRow, State, Transaction } from "../types";

// Suggested transfers (FR-142, FR-144, R-41): a row of a batch pairs with the other side of a
// transfer that is already in the ledger, an expense or income of equal amount on another account.

/** The most days a row and its other side may be apart (FR-142). */
export const PAIR_WINDOW_DAYS = 4;

/** What pairing reads of a pending row. */
export type PairableRow =
  | {
      status: "parsed";
      rowNumber: number;
      date: string;
      amountCents: number;
      duplicate?: boolean;
    }
  | { status: "unparsable"; rowNumber: number };

export interface Pair {
  transactionId: string;
  /** The account of the paired transaction, which becomes the row's counter-account. */
  accountId: string;
}

interface Candidate {
  rowNumber: number;
  transaction: Transaction & { kind: "expense" | "income" };
  days: number;
}

/** Whether the transaction is an entry a transfer's other side can be (FR-142). */
function canBeOtherSide(
  transaction: Transaction,
  accountId: string,
  unaccounted: ReadonlySet<string>,
): transaction is Transaction & { kind: "expense" | "income" } {
  return (
    transaction.kind !== "transfer" &&
    transaction.accountId !== accountId &&
    transaction.amountCents > 0 &&
    !unaccounted.has(transaction.categoryId)
  );
}

/**
 * The pairs of rows and ledger transactions, by row number. Every candidate pair is sorted by days
 * apart, then row number, then the transaction's date and `seq`, and a pair is taken while neither
 * of its sides is taken (R-41). Rows flagged as duplicates and unparsable rows take no part.
 */
export function pairTransfers(
  rows: readonly PairableRow[],
  accountId: string,
  transactions: readonly Transaction[],
  categories: readonly Category[],
): Map<number, Pair> {
  const unaccounted = new Set(
    categories.filter((c) => c.role === "unaccounted").map((category) => category.id),
  );
  const byAmount = new Map<number, (Transaction & { kind: "expense" | "income" })[]>();
  for (const transaction of transactions) {
    if (!canBeOtherSide(transaction, accountId, unaccounted)) continue;
    const list = byAmount.get(transaction.amountCents);
    if (list) list.push(transaction);
    else byAmount.set(transaction.amountCents, [transaction]);
  }

  const candidates: Candidate[] = [];
  for (const row of rows) {
    if (row.status !== "parsed" || row.duplicate || row.amountCents === 0) continue;
    // Money in pairs with an expense, money out with an income.
    const otherKind = row.amountCents > 0 ? "expense" : "income";
    for (const transaction of byAmount.get(Math.abs(row.amountCents)) ?? []) {
      if (transaction.kind !== otherKind) continue;
      const days = Math.abs(daysFromTo(row.date, transaction.date));
      if (days <= PAIR_WINDOW_DAYS)
        candidates.push({ rowNumber: row.rowNumber, transaction, days });
    }
  }
  candidates.sort(
    (a, b) =>
      a.days - b.days ||
      a.rowNumber - b.rowNumber ||
      (a.transaction.date < b.transaction.date
        ? -1
        : a.transaction.date > b.transaction.date
          ? 1
          : 0) ||
      a.transaction.seq - b.transaction.seq,
  );

  const pairs = new Map<number, Pair>();
  const taken = new Set<string>();
  for (const { rowNumber, transaction } of candidates) {
    if (pairs.has(rowNumber) || taken.has(transaction.id)) continue;
    pairs.set(rowNumber, { transactionId: transaction.id, accountId: transaction.accountId });
    taken.add(transaction.id);
  }
  return pairs;
}

/**
 * Whether the row's suggested transfer still stands: the paired transaction exists, is an expense
 * or income on the row's counter-account, and has the row's amount (FR-144). False for a row that
 * holds no suggested transfer.
 */
export function pairFits(row: ParsedRow, state: Pick<State, "transactions">): boolean {
  const { assignment } = row;
  if (assignment.type !== "transfer" || assignment.pairedTransactionId === undefined) return false;
  const paired = state.transactions.find((t) => t.id === assignment.pairedTransactionId);
  return (
    paired !== undefined &&
    paired.kind !== "transfer" &&
    paired.accountId === assignment.counterAccountId &&
    paired.amountCents === Math.abs(row.amountCents)
  );
}
