import { useId, useMemo, useState } from "react";
import { budgetMonth, budgetProgress } from "@/domain/budgets";
import { periodPreset } from "@/domain/dates";
import { insights } from "@/domain/insights";
import { todayLocal } from "@/store/clock";
import { useStore } from "@/store/store";
import { BudgetSection } from "./BudgetSection";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { PeriodPicker } from "./PeriodPicker";
import { SpendingChart } from "./SpendingChart";

/** Spending over time for a chosen period, defaulting to this month (FR-050, FR-051). */
export function InsightsScreen() {
  const state = useStore((current) => current);
  const [period, setPeriod] = useState(() => periodPreset("this-month", todayLocal()));
  const result = useMemo(() => insights(state, period), [state, period]);
  const month = budgetMonth(period);
  const progress = useMemo(() => budgetProgress(state, month), [state, month]);
  const spendingHeading = useId();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Insights</h1>
      <PeriodPicker period={period} onChange={setPeriod} />
      <section
        aria-labelledby={spendingHeading}
        className="flex flex-col gap-4 rounded-lg border p-6"
      >
        <h2 id={spendingHeading} className="text-lg font-medium">
          Spending over time
        </h2>
        <SpendingChart spending={result.spending} />
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryBreakdown
          title="Expenses by category"
          empty="No expenses in this period."
          breakdown={result.expenses}
        />
        <CategoryBreakdown
          title="Income by category"
          empty="No income in this period."
          breakdown={result.income}
        />
      </div>
      <BudgetSection month={month} progress={progress} />
    </div>
  );
}
