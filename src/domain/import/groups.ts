import { nameKey } from "../names";
import type {
  Assignment,
  ParsedRow,
  PendingBatch,
  Side,
  Transaction,
  UnparsableRow,
} from "../types";
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
  counts: {
    review: number;
    /** The rows set aside (FR-152); they are not among `review`. */
    setAside: number;
    suggestedTransfers: number;
    duplicates: number;
    unparsable: number;
  };
  /** Every flagged row, included or not (FR-025). */
  duplicates: ParsedRow[];
  unparsable: UnparsableRow[];
  /** By date, then row number; they are rows under review, but outside every group (FR-143). */
  suggestedTransfers: SuggestedTransfer[];
  /** Largest first, so the most rows leave "Uncategorised" in the fewest steps (SC-001). */
  groups: VendorGroup[];
  /** Rows under review without a vendor or in a group of one, by date. */
  plainRows: ParsedRow[];
  /** The rows set aside, by date, then row number; outside groups, plain rows and items (FR-152). */
  setAside: ParsedRow[];
  /** What the rows set aside come to, their amounts added without sign, for the live line (FR-161). */
  setAsideTotalCents: number;
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
 * Whether review sets the row aside: it is included, its amount is under `setAsideUnderCents`,
 * it holds a category, and the user has not assigned it anything or brought it back (FR-152,
 * data-model.md, derived values). With no amount, nothing is set aside.
 */
export function isSetAside(row: ParsedRow, setAsideUnderCents: number | undefined): boolean {
  return (
    setAsideUnderCents !== undefined &&
    row.included &&
    Math.abs(row.amountCents) < setAsideUnderCents &&
    row.assignment.type === "category" &&
    row.keptInReview !== true
  );
}

/**
 * The counts, the drawers' rows, and the rows under review grouped by vendor and side (FR-026,
 * contracts/csv-import.md, vendor groups). An included duplicate is a row under review like any
 * other, so it joins its group (R-12). The rows that hold a suggested transfer stay out of every
 * group and are listed apart with their pair from `transactions`, the ledger (FR-143). The rows
 * under `setAsideUnderCents` are listed apart and are in no group, plain row or count of review
 * (FR-152).
 */
export function reviewView(
  batch: PendingBatch,
  transactions: readonly Transaction[] = [],
  setAsideUnderCents?: number,
): ReviewView {
  const parsed = batch.rows.filter((row): row is ParsedRow => row.status === "parsed");
  const unparsable = batch.rows.filter((row): row is UnparsableRow => row.status === "unparsable");
  const included = parsed.filter((row) => row.included);
  const setAside = included.filter((row) => isSetAside(row, setAsideUnderCents)).sort(byDate);
  const asideRows = new Set(setAside);
  const underReview = included.filter((row) => !asideRows.has(row));
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
      setAside: setAside.length,
      suggestedTransfers: suggestedTransfers.length,
      duplicates: duplicates.length,
      unparsable: unparsable.length,
    },
    duplicates,
    unparsable,
    suggestedTransfers,
    groups: groups.sort(bySize),
    plainRows: plainRows.sort(byDate),
    setAside,
    setAsideTotalCents: setAside.reduce((sum, row) => sum + Math.abs(row.amountCents), 0),
  };
}

/** What a row's assignment holds: a category or a counter-account. */
const target = (assignment: Assignment) =>
  assignment.type === "category"
    ? `category ${assignment.categoryId}`
    : `transfer ${assignment.counterAccountId}`;

/** The mark an assignment carries: a suggestion, of the AI or a suggested transfer, or the usual choice. */
export type Mark = "suggested" | "usual" | null;

/** The mark an assignment carries, if any (FR-093, FR-143, FR-147). */
export const markOf = (assignment: Assignment): Mark => {
  if (assignment.usual) return "usual";
  if (assignment.type === "category") return assignment.suggested ? "suggested" : null;
  return assignment.pairedTransactionId === undefined ? null : "suggested";
};

/**
 * The assignment a group shows, or `null` when its rows differ (FR-026). It carries a mark only
 * when every row holds that same mark (FR-147): a group is "from earlier" only if each of its rows
 * is. Without a mark, it is the plain category or transfer.
 */
export function sharedAssignment(rows: readonly ParsedRow[]): Assignment | null {
  const first = rows[0]?.assignment;
  if (!first) return null;
  const key = target(first);
  if (!rows.every((row) => target(row.assignment) === key)) return null;
  const mark = markOf(first);
  if (mark !== null && rows.every((row) => markOf(row.assignment) === mark)) return first;
  return first.type === "category"
    ? { type: "category", categoryId: first.categoryId }
    : { type: "transfer", counterAccountId: first.counterAccountId };
}
