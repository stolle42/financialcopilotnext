import { nameKey } from "../names";
import type { ParsedRow, PendingBatch, Side, Transaction, UnparsableRow } from "../types";
import { proposedSide } from "./direction";
import { pairFits } from "./transfers";

/** The rows under review that share a vendor and a side (FR-026). */
export interface VendorGroup {
  /** The vendor key, the counterparty's name key; with `side`, it identifies the group. */
  key: string;
  side: Side;
  /** The first row's counterparty, as the file wrote it. */
  counterparty: string;
  count: number;
  totalCents: number;
  /** In file order. */
  rows: ParsedRow[];
}

/** A row that holds a suggested transfer, with the ledger transaction it is paired with (FR-143). */
export interface SuggestedTransfer {
  row: ParsedRow;
  /** Whether the paired transaction still is an expense or income of the row's amount there. */
  fits: boolean;
  /** `null` when the paired transaction no longer exists. */
  paired: Transaction | null;
}

/** What review shows of a pending batch (contracts/ui.md, review). */
export interface ReviewView {
  counts: { review: number; suggestedTransfers: number; duplicates: number; unparsable: number };
  /** Every flagged row, included or not (FR-025). */
  duplicates: ParsedRow[];
  unparsable: UnparsableRow[];
  /** By date, then row number; they are rows under review, but outside every group (FR-143). */
  suggestedTransfers: SuggestedTransfer[];
  /** Largest first, so the most rows leave "Uncategorised" in the fewest steps (SC-001). */
  groups: VendorGroup[];
  /** Rows under review without a vendor or in a group of one, by date. */
  plainRows: ParsedRow[];
}

const byDate = (a: ParsedRow, b: ParsedRow) =>
  a.date === b.date ? a.rowNumber - b.rowNumber : a.date < b.date ? -1 : 1;

const bySize = (a: VendorGroup, b: VendorGroup) =>
  b.count - a.count ||
  Math.abs(b.totalCents) - Math.abs(a.totalCents) ||
  a.counterparty.localeCompare(b.counterparty, undefined, { sensitivity: "base" });

/** Whether the row holds a suggested transfer: a transfer assignment that names its pair. */
export function isSuggestedTransfer(row: ParsedRow): boolean {
  return row.assignment.type === "transfer" && row.assignment.pairedTransactionId !== undefined;
}

/**
 * The counts, the drawers' rows, and the rows under review grouped by vendor and side (FR-026,
 * contracts/csv-import.md, vendor groups). An included duplicate is a row under review like any
 * other, so it joins its group (R-12). The rows that hold a suggested transfer stay out of every
 * group and are listed apart with their pair from `transactions`, the ledger (FR-143).
 */
export function reviewView(
  batch: PendingBatch,
  transactions: readonly Transaction[] = [],
): ReviewView {
  const parsed = batch.rows.filter((row): row is ParsedRow => row.status === "parsed");
  const unparsable = batch.rows.filter((row): row is UnparsableRow => row.status === "unparsable");
  const underReview = parsed.filter((row) => row.included);
  const suggestedTransfers = underReview
    .filter(isSuggestedTransfer)
    .sort(byDate)
    .map((row): SuggestedTransfer => {
      const id =
        row.assignment.type === "transfer" ? row.assignment.pairedTransactionId : undefined;
      return {
        row,
        fits: pairFits(row, { transactions }),
        paired: transactions.find((t) => t.id === id) ?? null,
      };
    });

  // Rows by vendor key and side, each with the vendor's first counterparty text.
  const byVendor = new Map<string, { counterparty: string; rows: ParsedRow[] }>();
  const plainRows: ParsedRow[] = [];
  for (const row of underReview) {
    if (isSuggestedTransfer(row)) continue;
    if (row.counterparty === null) {
      plainRows.push(row);
      continue;
    }
    const groupKey = `${proposedSide(row.amountCents)} ${nameKey(row.counterparty)}`;
    const vendor = byVendor.get(groupKey);
    if (vendor) vendor.rows.push(row);
    else byVendor.set(groupKey, { counterparty: row.counterparty, rows: [row] });
  }

  const groups: VendorGroup[] = [];
  for (const { counterparty, rows } of byVendor.values()) {
    if (rows.length === 1) {
      plainRows.push(...rows);
      continue;
    }
    groups.push({
      key: nameKey(counterparty),
      side: proposedSide(rows[0]!.amountCents),
      counterparty,
      count: rows.length,
      totalCents: rows.reduce((total, row) => total + row.amountCents, 0),
      rows,
    });
  }

  const duplicates = parsed.filter((row) => row.duplicate);
  return {
    counts: {
      review: underReview.length,
      suggestedTransfers: suggestedTransfers.length,
      duplicates: duplicates.length,
      unparsable: unparsable.length,
    },
    duplicates,
    unparsable,
    suggestedTransfers,
    groups: groups.sort(bySize),
    plainRows: plainRows.sort(byDate),
  };
}
