import { useId } from "react";
import { Pie, PieChart } from "recharts";
import type { Breakdown } from "@/domain/insights";
import { CategoryChip } from "@/ui/components/CategoryChip";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/ui/components/ui/chart";
import { formatAmount, formatShare } from "@/ui/format";
import { EmptySection } from "./EmptySection";

// Every slice carries its own colour, so the chart has no series to configure.
const noConfig: ChartConfig = {};

/** The fill of "Unaccounted": diagonal stripes in the category's colour, whatever that colour is. */
function HatchPattern({ id, color }: { id: string; color: string }) {
  return (
    <pattern
      id={id}
      width="8"
      height="8"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <rect width="8" height="8" fill={color} fillOpacity={0.2} />
      <line x1="0" y1="0" x2="0" y2="8" stroke={color} strokeWidth="4" />
    </pattern>
  );
}

/**
 * One side's categories as a donut and a legend of chip, amount and share, titled with the side's
 * total. "Unaccounted" is hatched and marked unknown, at its true share (FR-051, FR-052, R-14).
 */
export function CategoryBreakdown({
  title,
  empty,
  breakdown,
}: {
  title: string;
  empty: string;
  breakdown: Breakdown;
}) {
  const headingId = useId();
  // A pattern is referred to by id from `url(#…)`, which cannot hold the punctuation of a React id.
  const patternId = `hatch-${useId().replace(/\W/g, "")}`;
  const unknown = breakdown.entries.find((entry) => entry.unknown);

  return (
    <section aria-labelledby={headingId} className="surface flex flex-col gap-4 p-6">
      <h2
        id={headingId}
        className="flex items-baseline justify-between gap-4 text-xl font-semibold"
      >
        {title}
        {breakdown.entries.length > 0 && (
          <span className="tabular-nums">{formatAmount(breakdown.totalCents)}</span>
        )}
      </h2>
      {breakdown.entries.length === 0 ? (
        <EmptySection>{empty}</EmptySection>
      ) : (
        <>
          <ChartContainer config={noConfig} className="mx-auto aspect-square h-56">
            <PieChart>
              {unknown && (
                <defs>
                  <HatchPattern id={patternId} color={unknown.category.color} />
                </defs>
              )}
              {/* The tooltip is read-only: nothing here responds to a click (FR-053). */}
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    hideLabel
                    hideIndicator
                    valueFormatter={(cents) => formatAmount(Number(cents))}
                  />
                }
              />
              <Pie
                data={breakdown.entries.map((entry) => ({
                  name: entry.category.name,
                  amountCents: entry.amountCents,
                  fill: entry.unknown ? `url(#${patternId})` : entry.category.color,
                }))}
                dataKey="amountCents"
                nameKey="name"
                innerRadius="60%"
                stroke="var(--card)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </PieChart>
          </ChartContainer>
          {/* A swatch cannot show a pattern, so the legend is our own rather than the chart's. */}
          <ul className="flex flex-col gap-2">
            {breakdown.entries.map((entry) => (
              <li
                key={entry.category.id}
                className="grid grid-cols-[1fr_auto_4rem] items-center gap-4 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <CategoryChip category={entry.category} />
                  {entry.unknown && <span className="text-xs text-muted-foreground">unknown</span>}
                </span>
                <span className="tabular-nums">{formatAmount(entry.amountCents)}</span>
                <span className="text-right text-muted-foreground tabular-nums">
                  {formatShare(entry.share)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
