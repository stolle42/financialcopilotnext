import type { SuggestedTransfer } from "@/domain/import/groups";
import type { AssignmentChoice } from "@/domain/import/review";
import { proposedSide } from "@/domain/import/direction";
import type { ParsedRow } from "@/domain/types";
import { useStore } from "@/store/store";
import { formatAmount, formatDate } from "@/ui/format";
import { AssignmentControl } from "./AssignmentControl";
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
  onChooseRow,
}: {
  items: SuggestedTransfer[];
  batchAccountId: string;
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
        {items.map((item) => (
          <li key={item.row.rowNumber} className="flex flex-col gap-1 py-2">
            <div className="grid grid-cols-[6rem_1fr_7rem_auto] items-center gap-3 text-sm">
              <RowSummary row={item.row} />
              <AssignmentControl
                label={`row ${item.row.rowNumber}`}
                side={proposedSide(item.row.amountCents)}
                assignment={item.row.assignment}
                suggested
                batchAccountId={batchAccountId}
                onChoose={(choice) => onChooseRow(item.row, choice)}
              />
            </div>
            <PairsWith item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
