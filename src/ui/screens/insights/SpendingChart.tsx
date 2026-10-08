import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { SpendingLine, SpendingPoint } from "@/domain/insights";
import { CategoryChip } from "@/ui/components/CategoryChip";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/ui/components/ui/chart";
import { formatAmount, formatDate, formatMonth } from "@/ui/format";
import { EmptySection } from "./EmptySection";

const config = { spending: { label: "Spending", color: "var(--primary)" } } satisfies ChartConfig;

// A tooltip previews a point's categories in at most this many lines (contracts/ui.md, insights).
const PREVIEW_LINES = 5;

/**
 * A point's total, then its spending by category, largest first. With more categories than lines,
 * the last line sums those left over, so it always stands for at least two of them.
 */
function PointPreview({ point }: { point: SpendingPoint }) {
  const { categories } = point;
  const shown =
    categories.length > PREVIEW_LINES ? categories.slice(0, PREVIEW_LINES - 1) : categories;
  const rest = categories.slice(shown.length);
  const restCents = rest.reduce((sum, entry) => sum + entry.amountCents, 0);

  return (
    <div className="grid w-full min-w-48 gap-1.5">
      <div className="flex items-center justify-between gap-4 leading-none">
        <span className="text-muted-foreground">Spending</span>
        <span className="font-mono font-medium text-foreground tabular-nums">
          {formatAmount(point.totalCents)}
        </span>
      </div>
      {shown.length > 0 && (
        <ul className="grid gap-1 border-t pt-1.5">
          {shown.map((entry) => (
            <li key={entry.category.id} className="flex items-center justify-between gap-4">
              <span className="flex min-w-0 items-center gap-1.5">
                <CategoryChip category={entry.category} />
                {/* As in the legend: money the user could not account for (FR-052). */}
                {entry.unknown && <span className="text-muted-foreground">unknown</span>}
              </span>
              <span className="font-mono tabular-nums">{formatAmount(entry.amountCents)}</span>
            </li>
          ))}
          {rest.length > 0 && (
            <li className="flex items-center justify-between gap-4 text-muted-foreground">
              <span>{rest.length} more categories</span>
              <span className="font-mono tabular-nums">{formatAmount(restCents)}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * The expense totals per day, or per month for a long period, as a line whose tooltips preview
 * each point's categories (FR-051, R-14).
 */
export function SpendingChart({ spending }: { spending: SpendingLine }) {
  if (spending.points.every((point) => point.totalCents === 0)) {
    return <EmptySection>No spending in this period.</EmptySection>;
  }

  const labelOf = (bucket: string) =>
    spending.granularity === "day" ? formatDate(bucket) : formatMonth(bucket);

  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <LineChart data={spending.points}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={labelOf} tickMargin={8} minTickGap={32} />
        <YAxis tickFormatter={formatAmount} width={88} tickMargin={4} />
        {/* The tooltip is read-only: nothing here responds to a click (FR-053). */}
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideIndicator
              labelFormatter={(bucket) => labelOf(String(bucket))}
              formatter={(_value, _name, item) => (
                <PointPreview point={item.payload as SpendingPoint} />
              )}
            />
          }
        />
        <Line
          dataKey="totalCents"
          name="Spending"
          stroke="var(--color-spending)"
          strokeWidth={2}
          // A lone point has no line to show it.
          dot={spending.points.length === 1}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
