import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { SpendingLine } from "@/domain/insights";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/ui/components/ui/chart";
import { formatAmount, formatDate, formatMonth } from "@/ui/format";
import { EmptySection } from "./EmptySection";

const config = { spending: { label: "Spending", color: "var(--primary)" } } satisfies ChartConfig;

/** The expense totals per day, or per month for a long period, as a line (FR-051, R-14). */
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
              valueFormatter={(cents) => formatAmount(Number(cents))}
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
