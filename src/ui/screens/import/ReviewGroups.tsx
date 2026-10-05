import { useState } from "react";
import { proposedSide } from "@/domain/import/direction";
import type { ReviewView, VendorGroup } from "@/domain/import/groups";
import type { AssignmentChoice } from "@/domain/import/review";
import type { Assignment, ParsedRow, Refusal } from "@/domain/types";
import { assignGroup, assignRow } from "@/store/import";
import { useStoreApi } from "@/store/store";
import { Button } from "@/ui/components/ui/button";
import { formatAmount } from "@/ui/format";
import type { MessageCode } from "@/ui/messages";
import { AssignmentControl } from "./AssignmentControl";
import { RowSummary } from "./RowSummary";

const sideLabel = { expense: "expenses", income: "income" } as const;

const assignmentKey = (assignment: Assignment) =>
  assignment.type === "category"
    ? `category ${assignment.categoryId}`
    : `transfer ${assignment.counterAccountId}`;

/** The assignment every row of the group shares, or `null` when the rows differ. */
function sharedAssignment(rows: readonly ParsedRow[]): Assignment | null {
  const first = rows[0]?.assignment;
  if (!first) return null;
  const key = assignmentKey(first);
  return rows.every((row) => assignmentKey(row.assignment) === key) ? first : null;
}

const rowGrid = "grid grid-cols-[6rem_1fr_7rem_auto] items-center gap-3 px-4 py-2 text-sm";

function ReviewRow({
  row,
  batchAccountId,
  onChoose,
}: {
  row: ParsedRow;
  batchAccountId: string;
  onChoose: (row: ParsedRow, choice: AssignmentChoice) => void;
}) {
  return (
    <li className={`${rowGrid} [contain-intrinsic-size:auto_3.5rem] [content-visibility:auto]`}>
      <RowSummary row={row} />
      <AssignmentControl
        label={`row ${row.rowNumber}`}
        side={proposedSide(row.amountCents)}
        assignment={row.assignment}
        batchAccountId={batchAccountId}
        onChoose={(choice) => onChoose(row, choice)}
      />
    </li>
  );
}

/** A collapsed vendor group with one assignment for all its rows; unfolded, one per row (FR-026). */
function GroupCard({
  group,
  batchAccountId,
  onChooseGroup,
  onChooseRow,
}: {
  group: VendorGroup;
  batchAccountId: string;
  onChooseGroup: (group: VendorGroup, choice: AssignmentChoice) => void;
  onChooseRow: (row: ParsedRow, choice: AssignmentChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const name = `${group.counterparty}, ${sideLabel[group.side]}`;
  return (
    <div role="group" aria-label={name} className="rounded-lg border">
      <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
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
            assignment={sharedAssignment(group.rows)}
            batchAccountId={batchAccountId}
            onChoose={(choice) => onChooseGroup(group, choice)}
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
              onChoose={onChooseRow}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The rows under review: vendor groups, largest first and collapsed, then the plain rows by date
 * (contracts/ui.md, review). Every choice is saved at once (FR-022).
 */
export function ReviewGroups({
  view,
  batchAccountId,
  onRefusal,
}: {
  view: ReviewView;
  batchAccountId: string;
  onRefusal: (refusal: Refusal<MessageCode> | null) => void;
}) {
  const store = useStoreApi();

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

  return (
    <section aria-label="Rows to review" className="flex flex-col gap-3">
      {view.groups.map((group) => (
        <GroupCard
          key={`${group.side} ${group.key}`}
          group={group}
          batchAccountId={batchAccountId}
          onChooseGroup={chooseGroup}
          onChooseRow={chooseRow}
        />
      ))}
      {view.plainRows.length > 0 && (
        <ul aria-label="Plain rows" className="flex flex-col divide-y rounded-lg border">
          {view.plainRows.map((row) => (
            <ReviewRow
              key={row.rowNumber}
              row={row}
              batchAccountId={batchAccountId}
              onChoose={chooseRow}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
