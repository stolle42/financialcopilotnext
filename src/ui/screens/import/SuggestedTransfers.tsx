import type { SuggestedTransfer } from "@/domain/import/groups";
import type { AssignmentChoice } from "@/domain/import/review";
import { proposedSide } from "@/domain/import/direction";
import type { ParsedRow } from "@/domain/types";
import { useStore } from "@/store/store";
import { formatAmount, formatDate } from "@/ui/format";
import { rowItemId } from "@/domain/import/items";
import { cn } from "@/ui/lib/utils";
import { AssignmentControl } from "./AssignmentControl";
import { RowStatusIcon, itemStatusClass } from "./ItemStatus";
import type { ReviewFocus } from "./useReviewFocus";
import { RowSummary } from "./RowSummary";

/** Where a suggested transfer's pair is, or that it has changed since the batch was made. */
function PairsWith({ item }: { item: SuggestedTransfer }) {
  const accounts = useStore((state) => state.accounts);
  const { paired, fits } = item;
  if (!fits || !paired) {
    return (
      <p className="text-xs text-muted-foreground">
        The transaction this row paired with has changed, so it will be saved as an ordinary
        transfer.
      </p>
    );
  }
  const account = accounts.find((a) => a.id === paired.accountId)?.name ?? "";
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-medium">Pairs with:</span> {account} · {formatDate(paired.date)} ·{" "}
      {paired.description} · {formatAmount(paired.amountCents)}
    </p>
  );
}

/**
 * The rows that hold a suggested transfer, by date, outside every vendor group (FR-143). The
 * sentence explains them in place (FR-154).
 */
export function SuggestedTransfers({
  items,
  batchAccountId,
  focus,
  onChooseRow,
}: {
  items: SuggestedTransfer[];
  batchAccountId: string;
  focus: ReviewFocus;
  onChooseRow: (row: ParsedRow, choice: AssignmentChoice) => void;
}) {
  return (
    <section aria-label="Suggested transfers" className="surface flex flex-col gap-3 p-4">
      <h2 className="text-lg font-semibold">Suggested transfers</h2>
      <p className="text-sm text-muted-foreground">
        The app found the other side of each of these in another account. Confirming makes the two
        one transfer; turning Transfer off keeps them apart.
      </p>
      <ul className="flex flex-col divide-y">
        {items.map((item) => {
          const id = rowItemId(item.row);
          const status = focus.statusOf(id);
          return (
            <li
              key={item.row.rowNumber}
              {...focus.itemProps(id)}
              className={cn(
                "relative flex flex-col gap-1 py-2 pl-4",
                itemStatusClass[status],
                status === "current" && "pl-3",
              )}
            >
              <RowStatusIcon status={status} />
              <div className="grid grid-cols-[6rem_1fr_7rem_auto] items-center gap-3 text-sm">
                <RowSummary row={item.row} />
                <AssignmentControl
                  label={`row ${item.row.rowNumber}`}
                  side={proposedSide(item.row.amountCents)}
                  assignment={item.row.assignment}
                  batchAccountId={batchAccountId}
                  onChoose={(choice) => onChooseRow(item.row, choice)}
                  field={{
                    ref: focus.fieldRef(id),
                    onTab: (direction, event) => focus.moveFrom(id, direction, event),
                  }}
                />
              </div>
              <PairsWith item={item} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
