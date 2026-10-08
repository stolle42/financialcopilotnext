import { datesInPeriod, daysInPeriod, monthOf, monthsInPeriod, type Period } from "./dates";
import type { Category, Side, State } from "./types";

// Aggregates for Insights: pure passes over the transactions of a period. Transfers move money
// between accounts and are in no figure (FR-012). R-14, FR-051, FR-052.

/** Periods of up to this many days get a point per day, longer ones a point per month (R-14). */
const MAX_DAILY_DAYS = 92;

export interface SpendingPoint {
  /** A `YYYY-MM-DD` date for a daily point, a `YYYY-MM` month for a monthly one. */
  bucket: string;
  totalCents: number;
  /** The point's expenses by category, in the order of a breakdown (FR-051). */
  categories: BreakdownEntry[];
}

export interface SpendingLine {
  granularity: "day" | "month";
  points: SpendingPoint[];
}

export interface BreakdownEntry {
  category: Category;
  amountCents: number;
  /** The entry's part of the side's total, from 0 to 1. */
  share: number;
  /** True for "Unaccounted", money the user has not been able to account for (FR-052). */
  unknown: boolean;
}

/** One side's categories with money in the period, largest first. */
export interface Breakdown {
  totalCents: number;
  entries: BreakdownEntry[];
}

export interface Insights {
  spending: SpendingLine;
  expenses: Breakdown;
  income: Breakdown;
}

function breakdownOf(sums: Map<Category, number>): Breakdown {
  const entries = [...sums]
    .filter(([, amountCents]) => amountCents > 0)
    .sort(
      ([a, x], [b, y]) => y - x || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  const totalCents = entries.reduce((sum, [, amountCents]) => sum + amountCents, 0);
  return {
    totalCents,
    entries: entries.map(([category, amountCents]) => ({
      category,
      amountCents,
      share: amountCents / totalCents,
      // Found by role, because the user can rename the category (data-model.md).
      unknown: category.role === "unaccounted",
    })),
  };
}

/** The spending line and both category breakdowns over the transactions dated within `period`. */
export function insights(state: State, period: Period): Insights {
  const categories = new Map(state.categories.map((c) => [c.id, c]));
  const daily = daysInPeriod(period) <= MAX_DAILY_DAYS;
  const buckets = daily ? datesInPeriod(period) : monthsInPeriod(period);
  const spent = new Map(buckets.map((bucket) => [bucket, new Map<Category, number>()]));
  const sums: Record<Side, Map<Category, number>> = { expense: new Map(), income: new Map() };

  for (const transaction of state.transactions) {
    if (transaction.kind === "transfer") continue;
    if (transaction.date < period.start || transaction.date > period.end) continue;
    const category = categories.get(transaction.categoryId);
    if (!category) throw new Error(`Transaction ${transaction.id} has no category`);

    const side = sums[transaction.kind];
    side.set(category, (side.get(category) ?? 0) + transaction.amountCents);
    if (transaction.kind === "expense") {
      const point = spent.get(daily ? transaction.date : monthOf(transaction.date))!;
      point.set(category, (point.get(category) ?? 0) + transaction.amountCents);
    }
  }

  return {
    spending: {
      granularity: daily ? "day" : "month",
      points: buckets.map((bucket) => {
        const { totalCents, entries } = breakdownOf(spent.get(bucket)!);
        return { bucket, totalCents, categories: entries };
      }),
    },
    expenses: breakdownOf(sums.expense),
    income: breakdownOf(sums.income),
  };
}
