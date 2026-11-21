import { signedEffect } from "../accounts";
import { daysFromTo } from "../dates";
import type { Transaction } from "../types";
import { PAIR_WINDOW_DAYS } from "./transfers";

/** What duplicate matching reads of a pending row; descriptions and counterparties play no part. */
export type MatchableRow =
  | { status: "parsed"; rowNumber: number; date: string; amountCents: number }
  | { status: "unparsable"; rowNumber: number };

// The batch account is the same for every entry, so date and signed effect complete the key.
// `${-0}` is "0", so zero amounts match whatever their sign.
const matchKey = (date: string, effect: number) => `${date} ${effect}`;

function touches(transaction: Transaction, accountId: string): boolean {
  return (
    transaction.accountId === accountId ||
    (transaction.kind === "transfer" && transaction.destinationAccountId === accountId)
  );
}

/**
 * The row numbers of parsed rows that match a ledger transaction, or an earlier row of the batch,
 * on account, date and signed effect (FR-024). `rows` are in file order. A hash keeps 5,000 rows
 * linear (contracts/csv-import.md, duplicate matching).
 *
 * A transfer is booked on the day each bank shows it, so a ledger transfer matches a row up to 4
 * days apart, on the side that is the batch account and with the direction the row shows (FR-156).
 * Everything else matches on the exact date.
 */
export function flagDuplicates(
  rows: readonly MatchableRow[],
  accountId: string,
  transactions: readonly Transaction[],
): ReadonlySet<number> {
  const seen = new Set<string>();
  // The dates of the ledger's transfers on the batch account, by signed effect.
  const transferDates = new Map<number, string[]>();
  for (const transaction of transactions) {
    if (!touches(transaction, accountId)) continue;
    const effect = signedEffect(transaction, accountId);
    if (transaction.kind !== "transfer") {
      seen.add(matchKey(transaction.date, effect));
      continue;
    }
    const dates = transferDates.get(effect);
    if (dates) dates.push(transaction.date);
    else transferDates.set(effect, [transaction.date]);
  }
  const flagged = new Set<number>();
  for (const row of rows) {
    if (row.status !== "parsed") continue;
    const key = matchKey(row.date, row.amountCents);
    const nearTransfer = transferDates
      .get(row.amountCents)
      ?.some((date) => Math.abs(daysFromTo(date, row.date)) <= PAIR_WINDOW_DAYS);
    if (seen.has(key) || nearTransfer) flagged.add(row.rowNumber);
    seen.add(key);
  }
  return flagged;
}
