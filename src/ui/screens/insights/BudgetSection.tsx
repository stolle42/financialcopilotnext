import { cn } from "cn";
import { TriangleAlertIcon } from "lucide-react";
import { useId } from "react";
import type { BudgetProgress } from "@/domain/budgets";
import { CategoryChip } from "@/ui/components/CategoryChip";
import { buttonVariants } from "@/ui/components/ui/button";
import { Progress } from "@/ui/components/ui/progress";
import { formatAmount, formatMonth } from "@/ui/format";

/**
 * One bar per budgeted category for the month of the period's end, labelled with that month. An
 * over-limit bar says so in a label and an icon as well as its colour, so it reads without any
 * number (FR-042, SC-011, contracts/ui.md, insights).
 */
export function BudgetSection({ month, progress }: { month: string; progress: BudgetProgress[] }) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="surface flex flex-col gap-4 p-6">
      <h2
        id={headingId}
        className="flex items-baseline justify-between gap-4 text-xl font-semibold"
      >
        Budgets
        <span className="font-sans text-sm font-normal text-muted-foreground">
          {formatMonth(month)}
        </span>
      </h2>
      {progress.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground">
            No budgets set yet. Set a monthly limit on a category to follow it here.
          </p>
          <a href="#/budgets" className={buttonVariants({ variant: "outline" })}>
            Set a budget
          </a>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {progress.map(({ category, spentCents, limitCents, overLimit }) => {
            const amounts = `${formatAmount(spentCents)} of ${formatAmount(limitCents)}`;
            return (
              <li
                key={category.id}
                data-state={overLimit ? "over-limit" : "within-limit"}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-4 text-sm">
                  <CategoryChip category={category} />
                  <span className="flex items-center gap-3 tabular-nums">
                    {overLimit && (
                      <span className="inline-flex items-center gap-1 font-medium text-destructive">
                        <TriangleAlertIcon aria-hidden="true" className="size-4" />
                        Over limit
                      </span>
                    )}
                    {amounts}
                  </span>
                </div>
                <Progress
                  aria-label={`${category.name} spending`}
                  aria-valuetext={amounts}
                  // The bar stops at the limit, however far spending went past it.
                  value={Math.min(spentCents, limitCents)}
                  max={limitCents}
                  className={cn(overLimit && "[&_[data-slot=progress-indicator]]:bg-destructive")}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
