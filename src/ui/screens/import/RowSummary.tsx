import type { ParsedRow } from "@/domain/types";
import { formatAmount, formatDate } from "@/ui/format";

/** A pending row's date, description, counterparty and signed amount. */
export function RowSummary({ row }: { row: ParsedRow }) {
  return (
    <>
      <span className="text-muted-foreground">{formatDate(row.date)}</span>
      <span className="min-w-0 truncate">
        {row.description || <span className="text-muted-foreground">No description</span>}
        {row.counterparty && <span className="text-muted-foreground"> · {row.counterparty}</span>}
      </span>
      <span className="text-right tabular-nums">{formatAmount(row.amountCents)}</span>
    </>
  );
}
