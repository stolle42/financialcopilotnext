import type { Changes } from "../changes";
import { protectedCategory } from "../categories";
import type { Assignment, Category, ParsedRow, PendingBatch, Refusal, Side, State } from "../types";
import { proposedSide } from "./direction";
import { reviewView, type VendorGroup } from "./groups";

/**
 * Choices review never offers, so these guard the rules rather than inform the user: a category
 * of the other side or "Unaccounted", a transfer to the batch account, and including a row that
 * is not flagged (FR-025, FR-030).
 */
export type ReviewRefusalCode = "assignment-not-allowed" | "row-not-duplicate";

/** A category or a transfer, or "uncategorised", which turning the Transfer switch off restores. */
export type AssignmentChoice = Assignment | "uncategorised";

/** The side's "Uncategorised": where every imported row starts (FR-029). */
export function uncategorisedAssignment(categories: readonly Category[], side: Side): Assignment {
  return {
    type: "category",
    categoryId: protectedCategory(categories, side, "uncategorised").id,
  };
}

function pendingBatchOf(state: State): PendingBatch {
  if (!state.pendingBatch) throw new Error("No pending batch");
  return state.pendingBatch;
}

/** The assignment `choice` gives a row of `side`, or `null` when the rules do not allow it. */
function resolve(
  state: State,
  batch: PendingBatch,
  side: Side,
  choice: AssignmentChoice,
): Assignment | null {
  if (choice === "uncategorised") return uncategorisedAssignment(state.categories, side);
  if (choice.type === "category") {
    const category = state.categories.find((c) => c.id === choice.categoryId);
    // A new assignment, so a user's choice never carries Claude's mark (FR-093).
    return category?.side === side && category.role !== "unaccounted"
      ? { type: "category", categoryId: category.id }
      : null;
  }
  const account = state.accounts.find((a) => a.id === choice.counterAccountId);
  return account && account.id !== batch.accountId
    ? { type: "transfer", counterAccountId: account.id }
    : null;
}

/** The batch with `update` applied to the parsed rows numbered in `rowNumbers`. */
function updateRows(
  batch: PendingBatch,
  rowNumbers: ReadonlySet<number>,
  update: (row: ParsedRow) => ParsedRow,
): Changes {
  const rows = batch.rows.map((row) =>
    row.status === "parsed" && rowNumbers.has(row.rowNumber) ? update(row) : row,
  );
  return { pendingBatch: { put: [{ ...batch, rows }] } };
}

function parsedRow(batch: PendingBatch, rowNumber: number): ParsedRow {
  const row = batch.rows.find((r) => r.rowNumber === rowNumber);
  if (row?.status !== "parsed") throw new Error(`No parsed row ${rowNumber}`);
  return row;
}

/** Gives one row its own category or transfer (FR-023, FR-026). */
export function assignRow(
  state: State,
  rowNumber: number,
  choice: AssignmentChoice,
): Changes | Refusal<"assignment-not-allowed"> {
  const batch = pendingBatchOf(state);
  const row = parsedRow(batch, rowNumber);
  const assignment = resolve(state, batch, proposedSide(row.amountCents), choice);
  if (!assignment) return { code: "assignment-not-allowed" };
  return updateRows(batch, new Set([rowNumber]), (r) => ({ ...r, assignment }));
}

/** Gives every row currently in the vendor group the same assignment (FR-026). */
export function assignGroup(
  state: State,
  group: Pick<VendorGroup, "key" | "side">,
  choice: AssignmentChoice,
): Changes | Refusal<"assignment-not-allowed"> {
  const batch = pendingBatchOf(state);
  const found = reviewView(batch).groups.find((g) => g.key === group.key && g.side === group.side);
  if (!found) throw new Error(`No ${group.side} group ${group.key}`);
  const assignment = resolve(state, batch, found.side, choice);
  if (!assignment) return { code: "assignment-not-allowed" };
  const rowNumbers = new Set(found.rows.map((row) => row.rowNumber));
  return updateRows(batch, rowNumbers, (r) => ({ ...r, assignment }));
}

/** Includes a flagged row among the rows under review, or excludes it again (FR-025). */
export function includeDuplicate(
  state: State,
  rowNumber: number,
  included: boolean,
): Changes | Refusal<"row-not-duplicate"> {
  const batch = pendingBatchOf(state);
  if (!parsedRow(batch, rowNumber).duplicate) return { code: "row-not-duplicate" };
  return updateRows(batch, new Set([rowNumber]), (r) => ({ ...r, included }));
}
