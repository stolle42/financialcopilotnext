import type { Category, CategoryRole, Side } from "./types";

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
