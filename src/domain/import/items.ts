import type { ParsedRow } from "../types";
import type { ReviewView, SuggestedTransfer, VendorGroup } from "./groups";

// The items of review (FR-150, FR-151, R-44): what Tab goes through, in the order review shows
// them, and which of them the user has seen.

/** A suggested transfer, a vendor group, or a row: a plain one or one of an unfolded group. */
export type ReviewItem =
  | { id: string; kind: "transfer"; row: ParsedRow }
  | { id: string; kind: "group"; group: VendorGroup }
  | { id: string; kind: "row"; row: ParsedRow; inGroup: boolean };

/** The id of a group's item, which the screen keeps unfolded groups and refs by. */
export const groupItemId = (group: Pick<VendorGroup, "key" | "side">) =>
  `group ${group.side} ${group.key}`;

/** The id of a row's item. */
export const rowItemId = (row: Pick<ParsedRow, "rowNumber">) => `row ${row.rowNumber}`;

/**
 * The items in the order of Tab: the suggested transfers, the vendor groups largest first, each
 * followed by its rows while it is unfolded, then the plain rows by date. Rows set aside are none
 * of them, as `reviewView` leaves them out.
 */
export function reviewItems(view: ReviewView, unfolded: ReadonlySet<string>): ReviewItem[] {
  const items: ReviewItem[] = view.suggestedTransfers.map(({ row }: SuggestedTransfer) => ({
    id: rowItemId(row),
    kind: "transfer",
    row,
  }));
  for (const group of view.groups) {
    const id = groupItemId(group);
    items.push({ id, kind: "group", group });
    if (!unfolded.has(id)) continue;
    for (const row of group.rows) {
      items.push({ id: rowItemId(row), kind: "row", row, inGroup: true });
    }
  }
  for (const row of view.plainRows) {
    items.push({ id: rowItemId(row), kind: "row", row, inGroup: false });
  }
  return items;
}

/**
 * Whether the user has been on the item and left it: a transfer or row by its own `seen`, a group
 * only when all its rows hold `groupSeen`, so a group passed while folded shows its rows not seen
 * once unfolded (FR-151).
 */
export function itemSeen(item: ReviewItem): boolean {
  if (item.kind === "group") return item.group.rows.every((row) => row.groupSeen === true);
  return item.row.seen === true;
}

/** Whether the item is one of the top level, and not a row inside an unfolded group. */
const topLevel = (item: ReviewItem) => item.kind !== "row" || !item.inGroup;

/** How many top-level items are not seen yet; the rows inside a group are not counted. */
export const notSeenCount = (items: readonly ReviewItem[]): number =>
  items.filter((item) => topLevel(item) && !itemSeen(item)).length;

/**
 * The item review starts at: the first one not seen, or the first one when all are seen, or
 * `undefined` when there are none (FR-150).
 */
export function firstNotSeen(items: readonly ReviewItem[]): ReviewItem | undefined {
  return items.find((item) => topLevel(item) && !itemSeen(item)) ?? items[0];
}
