import { signedEffect } from "../accounts";
import type { Transaction } from "../types";

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
 */
export function flagDuplicates(
  rows: readonly MatchableRow[],
  accountId: string,
  transactions: readonly Transaction[],
): ReadonlySet<number> {
  const seen = new Set(
    transactions
      .filter((t) => touches(t, accountId))
      .map((t) => matchKey(t.date, signedEffect(t, accountId))),
  );
  const flagged = new Set<number>();
  for (const row of rows) {
    if (row.status !== "parsed") continue;
    const key = matchKey(row.date, row.amountCents);
    if (seen.has(key)) flagged.add(row.rowNumber);
    seen.add(key);
  }
  return flagged;
}
