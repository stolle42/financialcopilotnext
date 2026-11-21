import { nameKey } from "../names";
import type { Category, Side, Transaction } from "../types";
import { proposedSide } from "./direction";

// Usual choices (FR-146, R-42): a row starts where more than half of the ledger's transactions of
// its vendor, moving money the same way, were put: in one category, or in a transfer to one
// account.

/** What a vendor's transactions usually were: a category, or a transfer to one counter-account. */
export type UsualChoice =
  { type: "category"; categoryId: string } | { type: "transfer"; counterAccountId: string };

/** What a usual choice reads of a pending row. */
export type UsualRow =
  | { status: "parsed"; rowNumber: number; amountCents: number; counterparty: string | null }
  | { status: "unparsable"; rowNumber: number };

/** How often each choice was made for one vendor and direction. */
interface Tally {
  total: number;
  choices: Map<string, { count: number; choice: UsualChoice }>;
}

const tallyKey = (side: Side, vendor: string) => `${side}|${nameKey(vendor)}`;

/**
 * The usual choice of each row that has one, by row number. The ledger is read once into counts per
 * vendor and direction; a row's choice is the one with more than half of its vendor's count, unless
 * it is a side's "Uncategorised" or "Unaccounted", which say nothing. Categories count whatever the
 * account; a transfer counts only on the side that holds the vendor, for the batch's account.
 */
export function usualChoices(
  rows: readonly UsualRow[],
  accountId: string,
  transactions: readonly Transaction[],
  categories: readonly Category[],
): Map<number, UsualChoice> {
  const tallies = new Map<string, Tally>();
  const add = (side: Side, vendor: string | undefined, choiceKey: string, choice: UsualChoice) => {
    if (vendor === undefined || nameKey(vendor) === "") return;
    const key = tallyKey(side, vendor);
    const tally = tallies.get(key) ?? { total: 0, choices: new Map() };
    const entry = tally.choices.get(choiceKey) ?? { count: 0, choice };
    entry.count += 1;
    tally.total += 1;
    tally.choices.set(choiceKey, entry);
    tallies.set(key, tally);
  };

  for (const transaction of transactions) {
    if (transaction.kind === "transfer") {
      if (transaction.accountId === accountId) {
        const choice: UsualChoice = {
          type: "transfer",
          counterAccountId: transaction.destinationAccountId,
        };
        add("expense", transaction.vendor, `transfer:${choice.counterAccountId}`, choice);
      }
      if (transaction.destinationAccountId === accountId) {
        const choice: UsualChoice = { type: "transfer", counterAccountId: transaction.accountId };
        add("income", transaction.destinationVendor, `transfer:${choice.counterAccountId}`, choice);
      }
    } else {
      const choice = { type: "category", categoryId: transaction.categoryId } as const;
      add(transaction.kind, transaction.vendor, `category:${choice.categoryId}`, choice);
    }
  }

  const unsaid = new Set(categories.filter((c) => c.role !== null).map((category) => category.id));
  const result = new Map<number, UsualChoice>();
  for (const row of rows) {
    if (row.status !== "parsed" || row.counterparty === null) continue;
    if (nameKey(row.counterparty) === "") continue;
    const tally = tallies.get(tallyKey(proposedSide(row.amountCents), row.counterparty));
    if (!tally) continue;
    for (const { count, choice } of tally.choices.values()) {
      if (count * 2 <= tally.total) continue;
      if (choice.type === "category" && unsaid.has(choice.categoryId)) break;
      result.set(row.rowNumber, choice);
      break;
    }
  }
  return result;
}
