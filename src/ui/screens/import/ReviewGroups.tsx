import { proposedSide } from "@/domain/import/direction";
import {
  markOf,
  sharedAssignment,
  type ReviewView,
  type VendorGroup,
} from "@/domain/import/groups";
import type { AssignmentChoice } from "@/domain/import/review";
import type { ParsedRow, Refusal } from "@/domain/types";
import { assignGroup, assignRow } from "@/store/import";
import { useStoreApi } from "@/store/store";
import { Button } from "@/ui/components/ui/button";
import { formatAmount } from "@/ui/format";
import { usualMarkSentence, type MessageCode } from "@/ui/messages";
import { groupItemId, rowItemId } from "@/domain/import/items";
import { cn } from "@/ui/lib/utils";
import { AssignmentControl, usualSentenceId, type NewCategoryInput } from "./AssignmentControl";
import { ItemStatusIcon, RowStatusIcon, itemStatusClass } from "./ItemStatus";
import { RowSummary } from "./RowSummary";
import { SuggestedTransfers } from "./SuggestedTransfers";
import type { ReviewFocus } from "./useReviewFocus";

const sideLabel = { expense: "expenses", income: "income" } as const;

const rowGrid = "grid grid-cols-[6rem_1fr_7rem_auto] items-center gap-3 px-4 py-2 text-sm";

function ReviewRow({
  row,
  batchAccountId,
  focus,
  onChoose,
  onCreate,
}: {
  row: ParsedRow;
  batchAccountId: string;
  focus: ReviewFocus;
  onChoose: (row: ParsedRow, choice: AssignmentChoice) => void;
  onCreate: (row: ParsedRow, input: NewCategoryInput) => Promise<Refusal<MessageCode> | null>;
}) {
  const id = rowItemId(row);
  const status = focus.statusOf(id);
  return (
    <li
      {...focus.itemProps(id)}
      className={cn(
        rowGrid,
        "relative [contain-intrinsic-size:auto_3.5rem] [content-visibility:auto]",
        itemStatusClass[status],
        status === "current" && "pl-3",
      )}
    >
      <RowStatusIcon status={status} />
      <RowSummary row={row} />
      <AssignmentControl
        label={`row ${row.rowNumber}`}
        side={proposedSide(row.amountCents)}
        assignment={row.assignment}
        batchAccountId={batchAccountId}
        onChoose={(choice) => onChoose(row, choice)}
        onCreateCategory={(input) => onCreate(row, input)}
        field={{
          ref: focus.fieldRef(id),
          onTab: (direction, event) => focus.moveFrom(id, direction, event),
        }}
      />
    </li>
  );
}

/** A collapsed vendor group with one assignment for all its rows; unfolded, one per row (FR-026). */
function GroupCard({
  group,
  batchAccountId,
  focus,
  onChooseGroup,
  onChooseRow,
  onCreateGroup,
  onCreateRow,
}: {
  group: VendorGroup;
  batchAccountId: string;
  focus: ReviewFocus;
  onChooseGroup: (group: VendorGroup, choice: AssignmentChoice) => void;
  onChooseRow: (row: ParsedRow, choice: AssignmentChoice) => void;
  onCreateGroup: (
    group: VendorGroup,
    input: NewCategoryInput,
  ) => Promise<Refusal<MessageCode> | null>;
  onCreateRow: (row: ParsedRow, input: NewCategoryInput) => Promise<Refusal<MessageCode> | null>;
}) {
  const id = groupItemId(group);
  const open = focus.isUnfolded(id);
  const status = focus.statusOf(id);
  const name = `${group.counterparty}, ${sideLabel[group.side]}`;
  const shared = sharedAssignment(group.rows);
  return (
    <div
      role="group"
      aria-label={name}
      {...focus.itemProps(id)}
      className={cn("surface", itemStatusClass[status])}
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <ItemStatusIcon status={status} />
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            onClick={() => focus.toggleUnfolded(id)}
          >
            {open ? "Hide rows" : "Show rows"}
          </Button>
          <span className="font-medium">{group.counterparty}</span>
          <span className="text-muted-foreground">
            {sideLabel[group.side]} · {group.count} rows
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="tabular-nums">{formatAmount(group.totalCents)}</span>
          <AssignmentControl
            label={name}
            side={group.side}
            assignment={shared}
            // Marked only when every row holds the same category as a suggestion.
            batchAccountId={batchAccountId}
            onChoose={(choice) => onChooseGroup(group, choice)}
            onCreateCategory={(input) => onCreateGroup(group, input)}
            field={{
              ref: focus.fieldRef(id),
              onTab: (direction, event) => focus.moveFrom(id, direction, event),
            }}
          />
        </div>
      </div>
      {open && (
        <ul className="flex flex-col divide-y border-t">
          {group.rows.map((row) => (
            <ReviewRow
              key={row.rowNumber}
              row={row}
              batchAccountId={batchAccountId}
              focus={focus}
              onChoose={onChooseRow}
              onCreate={onCreateRow}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The rows under review: the suggested transfers, vendor groups, largest first and collapsed, then
 * the plain rows by date
 * (contracts/ui.md, review). Every choice is saved at once (FR-022).
 */
export function ReviewGroups({
  view,
  batchAccountId,
  focus,
  onRefusal,
}: {
  view: ReviewView;
  batchAccountId: string;
  focus: ReviewFocus;
  onRefusal: (refusal: Refusal<MessageCode> | null) => void;
}) {
  const store = useStoreApi();
  // The sentence of the mark "From earlier" shows once, above every item that may hold it (FR-154).
  const holdsUsual = [...view.groups.flatMap((g) => g.rows), ...view.plainRows].some(
    (row) => markOf(row.assignment) === "usual",
  );

  async function saved(result: ReturnType<typeof assignRow>) {
    const refusal = await result;
    // The controls offer only what the rules allow, so the rule's own refusal cannot come back.
    if (refusal && refusal.code !== "save-failed") throw new Error(`Refused: ${refusal.code}`);
    onRefusal(refusal);
  }
  const chooseRow = (row: ParsedRow, choice: AssignmentChoice) =>
    void saved(assignRow(store, row.rowNumber, choice));
  const chooseGroup = (group: VendorGroup, choice: AssignmentChoice) =>
    void saved(assignGroup(store, group, choice));
  // A new category is created with the assignment; a refused name goes back to the dialog, which
  // offers nothing else the rules refuse.
  async function created(result: ReturnType<typeof assignRow>) {
    const refusal = await result;
    if (refusal?.code === "assignment-not-allowed") throw new Error(`Refused: ${refusal.code}`);
    return refusal as Refusal<MessageCode> | null;
  }
  const createForRow = (row: ParsedRow, input: NewCategoryInput) =>
    created(assignRow(store, row.rowNumber, { type: "new-category", ...input }));
  const createForGroup = (group: VendorGroup, input: NewCategoryInput) =>
    created(assignGroup(store, group, { type: "new-category", ...input }));

  return (
    <>
      {/* Above the region, whose every child is a card (FR-114). */}
      {focus.items.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Typing finds a category, and Tab moves to the next row. Shift+Tab goes back.
        </p>
      )}
      {view.groups.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Transfer is for money moved between two of your own accounts. It counts as neither
          spending nor income.
        </p>
      )}
      <section aria-label="Rows to review" className="flex flex-col gap-3" {...focus.regionProps}>
        {holdsUsual && (
          <p id={usualSentenceId} className="surface px-4 py-3 text-sm text-muted-foreground">
            {usualMarkSentence}
          </p>
        )}
        {view.suggestedTransfers.length > 0 && (
          <SuggestedTransfers
            items={view.suggestedTransfers}
            batchAccountId={batchAccountId}
            focus={focus}
            onChooseRow={chooseRow}
            onCreateRow={createForRow}
          />
        )}
        {view.groups.map((group) => (
          <GroupCard
            key={`${group.side} ${group.key}`}
            group={group}
            batchAccountId={batchAccountId}
            focus={focus}
            onChooseGroup={chooseGroup}
            onChooseRow={chooseRow}
            onCreateGroup={createForGroup}
            onCreateRow={createForRow}
          />
        ))}
        {view.plainRows.length > 0 && (
          <ul aria-label="Plain rows" className="surface flex flex-col divide-y">
            {view.plainRows.map((row) => (
              <ReviewRow
                key={row.rowNumber}
                row={row}
                batchAccountId={batchAccountId}
                focus={focus}
                onChoose={chooseRow}
                onCreate={createForRow}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
