import type { Changes, Context } from "./changes";
import { isNameTaken, nameKey } from "./names";
import type {
  Category,
  CategoryRole,
  PendingBatch,
  PendingRow,
  Refusal,
  Side,
  State,
  Transaction,
} from "./types";

export type CategoryRefusalCode =
  "category-name-empty" | "category-name-taken" | "category-color-invalid" | "category-protected";

export interface CategoryInput {
  side: Side;
  name: string;
  /** A `#rrggbb` colour. */
  color: string;
}

/** What deleting a category does besides removing it, for the confirmation to state (FR-034). */
export interface DeletionImpact {
  transactionCount: number;
  budgetRemoved: boolean;
}

/** A protected category, found by role because the user can rename it (data-model.md). */
export function protectedCategory(
  categories: readonly Category[],
  side: Side,
  role: CategoryRole,
): Category {
  const found = categories.find((c) => c.side === side && c.role === role);
  if (!found) throw new Error(`No ${side} category with role ${role}`);
  return found;
}

// Ordinary categories first, then "Uncategorised", then "Unaccounted".
const roleRank = (category: Category) =>
  category.role === null ? 0 : category.role === "uncategorised" ? 1 : 2;

/** One side's categories in the list order of contracts/ui.md, shared patterns. */
export function sortCategories(categories: readonly Category[], side: Side): Category[] {
  return categories
    .filter((c) => c.side === side)
    .sort(
      (a, b) =>
        roleRank(a) - roleRank(b) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
}

/** What manual entry and review may offer: never "Unaccounted", which only reconciliation assigns (FR-030). */
export function pickerCategories(categories: readonly Category[], side: Side): Category[] {
  return sortCategories(categories, side).filter((c) => c.role !== "unaccounted");
}

const COLOUR = /^#[0-9a-f]{6}$/i;

function findCategory(state: State, id: string): Category {
  const found = state.categories.find((c) => c.id === id);
  if (!found) throw new Error(`No category ${id}`);
  return found;
}

/** Names are unique within a side, but the other side may repeat one (FR-032). */
function checkName(
  state: State,
  side: Side,
  name: string,
  exceptId?: string,
): Refusal<CategoryRefusalCode> | null {
  if (nameKey(name) === "") return { code: "category-name-empty" };
  const sameSide = state.categories.filter((c) => c.side === side);
  if (isNameTaken(sameSide, name, exceptId)) {
    return { code: "category-name-taken", details: { side } };
  }
  return null;
}

const invalidColour = (color: string): Refusal<CategoryRefusalCode> | null =>
  COLOUR.test(color) ? null : { code: "category-color-invalid" };

export function createCategory(
  state: State,
  input: CategoryInput,
  context: Context,
): Changes | Refusal<CategoryRefusalCode> {
  const refusal = checkName(state, input.side, input.name) ?? invalidColour(input.color);
  if (refusal) return refusal;
  const category: Category = {
    id: context.newId(),
    side: input.side,
    name: input.name.trim(),
    color: input.color,
    role: null,
  };
  return { categories: { put: [category] } };
}

/** Renaming keeps the id, so every transaction and budget shows the new name (FR-032). */
export function renameCategory(
  state: State,
  id: string,
  name: string,
): Changes | Refusal<CategoryRefusalCode> {
  const category = findCategory(state, id);
  const refusal = checkName(state, category.side, name, id);
  if (refusal) return refusal;
  return { categories: { put: [{ ...category, name: name.trim() }] } };
}

export function recolourCategory(
  state: State,
  id: string,
  color: string,
): Changes | Refusal<CategoryRefusalCode> {
  const category = findCategory(state, id);
  const refusal = invalidColour(color);
  if (refusal) return refusal;
  return { categories: { put: [{ ...category, color }] } };
}

const usesCategory = (transaction: Transaction, id: string) =>
  transaction.kind !== "transfer" && transaction.categoryId === id;

export function deletionImpact(state: State, id: string): DeletionImpact {
  return {
    transactionCount: state.transactions.filter((t) => usesCategory(t, id)).length,
    budgetRemoved: state.budgets.some((b) => b.categoryId === id),
  };
}

/** The batch with the rows assigned to `id` moved to `to`, or null when no row is assigned to it. */
function reassignRows(batch: PendingBatch | null, id: string, to: string): PendingBatch | null {
  const assigned = (row: PendingRow) =>
    row.status === "parsed" &&
    row.assignment.type === "category" &&
    row.assignment.categoryId === id;
  if (!batch?.rows.some(assigned)) return null;
  return {
    ...batch,
    rows: batch.rows.map((row) =>
      row.status === "parsed" && assigned(row)
        ? { ...row, assignment: { type: "category", categoryId: to } }
        : row,
    ),
  };
}

/**
 * Removes a category. Its transactions and the pending rows assigned to it move to the side's
 * "Uncategorised", and its budget goes (FR-034, data-model.md state transitions). The protected
 * categories are found by role, so they stay protected whatever they are called (FR-033).
 */
export function deleteCategory(state: State, id: string): Changes | Refusal<CategoryRefusalCode> {
  const category = findCategory(state, id);
  if (category.role) return { code: "category-protected", details: { role: category.role } };

  const uncategorised = protectedCategory(state.categories, category.side, "uncategorised");
  const moved = state.transactions
    .filter((t) => usesCategory(t, id))
    .map((t) => ({ ...t, categoryId: uncategorised.id }) as Transaction);
  const batch = reassignRows(state.pendingBatch, id, uncategorised.id);
  const changes: Changes = { categories: { delete: [id] } };
  if (moved.length > 0) changes.transactions = { put: moved };
  if (state.budgets.some((b) => b.categoryId === id)) changes.budgets = { delete: [id] };
  if (batch) changes.pendingBatch = { put: [batch] };
  return changes;
}
