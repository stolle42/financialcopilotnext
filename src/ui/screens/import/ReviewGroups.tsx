import type { ReviewView } from "@/domain/import/groups";
import type { Refusal } from "@/domain/types";
import { formatAmount } from "@/ui/format";
import type { MessageCode } from "@/ui/messages";
import { RowSummary } from "./RowSummary";

const sideLabel = { expense: "expenses", income: "income" } as const;

/** The rows under review: vendor groups, largest first, then the plain rows (contracts/ui.md). */
export function ReviewGroups({
  view,
}: {
  view: ReviewView;
  onRefusal: (refusal: Refusal<MessageCode> | null) => void;
}) {
  return (
    <section aria-label="Rows to review" className="flex flex-col gap-2">
      {view.groups.map((group) => (
        <div
          key={`${group.side} ${group.key}`}
          className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm"
        >
          <span className="font-medium">
            {group.counterparty}{" "}
            <span className="font-normal text-muted-foreground">
              · {sideLabel[group.side]} · {group.count} rows
            </span>
          </span>
          <span className="tabular-nums">{formatAmount(group.totalCents)}</span>
        </div>
      ))}
      {view.plainRows.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border">
          {view.plainRows.map((row) => (
            <li
              key={row.rowNumber}
              className="grid grid-cols-[6rem_1fr_7rem] items-center gap-3 px-4 py-3 text-sm"
            >
              <RowSummary row={row} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
