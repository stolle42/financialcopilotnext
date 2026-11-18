import type { Changes, Context } from "../changes";
import { createCategory, protectedCategory, type CategoryRefusalCode } from "../categories";
import type { Assignment, Category, ParsedRow, PendingBatch, Refusal, Side, State } from "../types";
import { proposedSide } from "./direction";
import { reviewView, type VendorGroup } from "./groups";

/**
 * Choices review never offers, so these guard the rules rather than inform the user: a category
 * of the other side or "Unaccounted", a transfer to the batch account, and including a row that
 * is not flagged (FR-025, FR-030).
 */
export type ReviewRefusalCode = "assignment-not-allowed" | "row-not-duplicate";

/** A category to create on the side of the row or group, with the colour it gets (FR-149). */
export interface NewCategoryChoice {
  type: "new-category";
  name: string;
  color: string;
}

/**
 * A category or a transfer, "uncategorised", which turning the Transfer switch off restores, or a
 * new category, which is created and given in one change.
 */
export type AssignmentChoice = Assignment | "uncategorised" | NewCategoryChoice;

/**
 * What a choice does to the state before it is resolved: a new category is created on `side` and
 * becomes a choice of that category, refused as Categories refuses it (FR-032, FR-149).
 */
function withNewCategory(
  state: State,
  side: Side,
  choice: AssignmentChoice,
  context: Context | undefined,
):
  | { state: State; choice: Exclude<AssignmentChoice, NewCategoryChoice>; changes: Changes }
  | Refusal<CategoryRefusalCode> {
  if (typeof choice === "string" || choice.type !== "new-category") {
    return { state, choice, changes: {} };
  }
  if (!context) throw new Error("A new category needs the context's ids");
  const created = createCategory(state, { side, name: choice.name, color: choice.color }, context);
  if ("code" in created) return created;
  const category = created.categories!.put![0]!;
  return {
    state: { ...state, categories: [...state.categories, category] },
    choice: { type: "category", categoryId: category.id },
    changes: created,
  };
}

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

/**
 * The assignment `choice` gives `row`, or `null` when the rules do not allow it. Turning Transfer
 * off ("uncategorised") on a transfer that remembers a usual category gives that category, and
 * otherwise the side's "Uncategorised" (FR-143). Every choice is a new assignment, so it carries
 * neither the AI's mark (FR-093) nor a suggested transfer's pair.
 */
function resolve(
  state: State,
  batch: PendingBatch,
  row: ParsedRow,
  side: Side,
  choice: Exclude<AssignmentChoice, NewCategoryChoice>,
): Assignment | null {
  if (choice === "uncategorised") {
    const { assignment } = row;
    if (assignment.type === "transfer" && assignment.usualCategoryId !== undefined) {
      return { type: "category", categoryId: assignment.usualCategoryId };
    }
    return uncategorisedAssignment(state.categories, side);
  }
  if (choice.type === "category") {
    const category = state.categories.find((c) => c.id === choice.categoryId);
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
  context?: Context,
): Changes | Refusal<"assignment-not-allowed" | CategoryRefusalCode> {
  const batch = pendingBatchOf(state);
  const row = parsedRow(batch, rowNumber);
  const side = proposedSide(row.amountCents);
  const given = withNewCategory(state, side, choice, context);
  if ("code" in given) return given;
  const assignment = resolve(given.state, batch, row, side, given.choice);
  if (!assignment) return { code: "assignment-not-allowed" };
  return {
    ...given.changes,
    ...updateRows(batch, new Set([rowNumber]), (r) => ({
      ...r,
      assignment,
      keptInReview: true,
    })),
  };
}

/** Gives every row currently in the vendor group the same assignment (FR-026). */
export function assignGroup(
  state: State,
  group: Pick<VendorGroup, "key" | "side">,
  choice: AssignmentChoice,
  context?: Context,
): Changes | Refusal<"assignment-not-allowed" | CategoryRefusalCode> {
  const batch = pendingBatchOf(state);
  const found = reviewView(batch, [], state.settings.setAsideUnderCents).groups.find(
    (g) => g.key === group.key && g.side === group.side,
  );
  if (!found) throw new Error(`No ${group.side} group ${group.key}`);
  const given = withNewCategory(state, found.side, choice, context);
  if ("code" in given) return given;
  const assignments = new Map<number, Assignment>();
  for (const row of found.rows) {
    const assignment = resolve(given.state, batch, row, found.side, given.choice);
    if (!assignment) return { code: "assignment-not-allowed" };
    assignments.set(row.rowNumber, assignment);
  }
  return {
    ...given.changes,
    ...updateRows(batch, new Set(assignments.keys()), (r) => ({
      ...r,
      assignment: assignments.get(r.rowNumber)!,
      keptInReview: true,
    })),
  };
}

/**
 * Brings a row set aside back under review, holding what it holds (FR-153). Bringing back a row
 * again, or one that never was set aside, changes nothing more.
 */
export function bringBack(state: State, rowNumber: number): Changes {
  const batch = pendingBatchOf(state);
  parsedRow(batch, rowNumber);
  return updateRows(batch, new Set([rowNumber]), (r) => ({ ...r, keptInReview: true }));
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

/**
 * Marks each parsed row numbered in `rowNumbers` with `field`. A row that is not in the batch, is
 * unparsable or already holds the mark is left as it is, so marking again changes nothing.
 */
function markRows(batch: PendingBatch, rowNumbers: readonly number[], field: "seen" | "groupSeen") {
  const wanted = new Set(rowNumbers);
  const rows = batch.rows.map((row) =>
    row.status === "parsed" && wanted.has(row.rowNumber) && !row[field]
      ? { ...row, [field]: true as const }
      : row,
  );
  return { pendingBatch: { put: [{ ...batch, rows }] } } satisfies Changes;
}

/** Marks the rows seen: each was the current item and the focus moved away (FR-151). */
export function markSeen(state: State, rowNumbers: readonly number[]): Changes {
  return markRows(pendingBatchOf(state), rowNumbers, "seen");
}

/** Marks the rows' vendor group seen, keeping each row's own mark (FR-151). */
export function markGroupSeen(state: State, rowNumbers: readonly number[]): Changes {
  return markRows(pendingBatchOf(state), rowNumbers, "groupSeen");
}
