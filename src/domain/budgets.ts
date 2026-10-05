import type { Changes } from "./changes";
import { sortCategories } from "./categories";
import { monthOf, type Period } from "./dates";
import { compareNames } from "./names";
import type { Category, Refusal, State } from "./types";

// Monthly limits on expense categories and the progress against them (FR-040 – FR-042, R-14).

/** A limit that is missing, zero, negative or not whole cents, which the user can correct. */
export type BudgetRefusalCode = "budget-limit-invalid";

/**
 * A category that cannot carry a budget. The Budgets screen never offers one, so this guards the
 * rule rather than informing the user: it has no message.
 */
export type BudgetCategoryNotAllowed = Refusal<"budget-category-not-allowed">;

/** One budgeted category's spending in a month against its limit. */
export interface BudgetProgress {
  category: Category;
  spentCents: number;
  limitCents: number;
  /** True once spending exceeds the limit; spending exactly the limit is still within it. */
  overLimit: boolean;
}

/** The categories that can carry a budget, by name: ordinary expense categories only (FR-040). */
export function budgetableCategories(categories: readonly Category[]): Category[] {
  return sortCategories(categories, "expense").filter((c) => c.role === null);
}

/** Sets or changes the category's one monthly limit; it applies to every month (FR-041). */
export function setLimit(
  state: State,
  categoryId: string,
  limitCents: number | null,
): Changes | Refusal<BudgetRefusalCode> | BudgetCategoryNotAllowed {
  if (!budgetableCategories(state.categories).some((c) => c.id === categoryId)) {
    return { code: "budget-category-not-allowed" };
  }
  if (limitCents === null || !Number.isSafeInteger(limitCents) || limitCents <= 0) {
    return { code: "budget-limit-invalid" };
  }
  return { budgets: { put: [{ categoryId, limitCents }] } };
}

/** Removes the category's limit; a category without one stays as it is. */
export function removeLimit(state: State, categoryId: string): Changes {
  return state.budgets.some((b) => b.categoryId === categoryId)
    ? { budgets: { delete: [categoryId] } }
    : {};
}

/** The budget month of an Insights period: the calendar month that contains its end date (R-14). */
export function budgetMonth(period: Period): string {
  return monthOf(period.end);
}

/**
 * Every budgeted category, by name, with what its expenses in the `YYYY-MM` month come to against
 * its limit. Each month starts at zero, and transfers are in no figure (FR-012, FR-041).
 */
export function budgetProgress(state: State, month: string): BudgetProgress[] {
  const spent = new Map<string, number>();
  for (const transaction of state.transactions) {
    if (transaction.kind !== "expense" || monthOf(transaction.date) !== month) continue;
    spent.set(
      transaction.categoryId,
      (spent.get(transaction.categoryId) ?? 0) + transaction.amountCents,
    );
  }
  const categories = new Map(state.categories.map((c) => [c.id, c]));
  return state.budgets
    .map(({ categoryId, limitCents }): BudgetProgress => {
      const category = categories.get(categoryId);
      if (!category) throw new Error(`Budget ${categoryId} has no category`);
      const spentCents = spent.get(categoryId) ?? 0;
      return { category, spentCents, limitCents, overLimit: spentCents > limitCents };
    })
    .sort((a, b) => compareNames(a.category.name, b.category.name));
}
