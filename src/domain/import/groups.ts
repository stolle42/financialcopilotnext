import { nameKey } from "../names";
import type { ParsedRow, PendingBatch, Side, UnparsableRow } from "../types";
import { proposedSide } from "./direction";

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

/** What review shows of a pending batch (contracts/ui.md, review). */
export interface ReviewView {
  counts: { review: number; duplicates: number; unparsable: number };
  /** Every flagged row, included or not (FR-025). */
  duplicates: ParsedRow[];
  unparsable: UnparsableRow[];
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

/**
 * The counts, the drawers' rows, and the rows under review grouped by vendor and side (FR-026,
 * contracts/csv-import.md, vendor groups). An included duplicate is a row under review like any
 * other, so it joins its group (R-12).
 */
export function reviewView(batch: PendingBatch): ReviewView {
  const parsed = batch.rows.filter((row): row is ParsedRow => row.status === "parsed");
  const unparsable = batch.rows.filter((row): row is UnparsableRow => row.status === "unparsable");
  const underReview = parsed.filter((row) => row.included);

  // Rows by vendor key and side, each with the vendor's first counterparty text.
  const byVendor = new Map<string, { counterparty: string; rows: ParsedRow[] }>();
  const plainRows: ParsedRow[] = [];
  for (const row of underReview) {
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
      duplicates: duplicates.length,
      unparsable: unparsable.length,
    },
    duplicates,
    unparsable,
    groups: groups.sort(bySize),
    plainRows: plainRows.sort(byDate),
  };
}
