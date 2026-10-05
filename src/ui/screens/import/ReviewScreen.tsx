import { useMemo, useState } from "react";
import { reviewView } from "@/domain/import/groups";
import type { ParsedRow, PendingBatch, Refusal, UnparsableRow } from "@/domain/types";
import { includeDuplicate } from "@/store/import";
import { useStore, useStoreApi } from "@/store/store";
import { navigate } from "@/ui/app/router";
import { Button } from "@/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/ui/components/ui/sheet";
import { Switch } from "@/ui/components/ui/switch";
import { messageFor, type MessageCode } from "@/ui/messages";
import { ReviewGroups } from "./ReviewGroups";
import { RowSummary } from "./RowSummary";

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** The flagged rows, each with an Include switch (FR-025). */
function DuplicatesDrawer({
  rows,
  open,
  onOpenChange,
  onRefusal,
}: {
  rows: ParsedRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefusal: (refusal: Refusal<MessageCode> | null) => void;
}) {
  const store = useStoreApi();
  async function include(row: ParsedRow, included: boolean) {
    const refusal = await includeDuplicate(store, row.rowNumber, included);
    // Only flagged rows are listed here, so the rule's own refusal cannot come back.
    if (refusal && refusal.code !== "save-failed") throw new Error(`Refused: ${refusal.code}`);
    onRefusal(refusal);
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Duplicates</SheetTitle>
          <SheetDescription>
            These rows match a transaction already in the ledger, or an earlier row of this file, on
            date and amount. They stay out unless you include them.
          </SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col divide-y overflow-y-auto px-4">
          {rows.map((row) => (
            <li
              key={row.rowNumber}
              className="grid grid-cols-[6rem_1fr_6rem_auto] items-center gap-3 py-3 text-sm"
            >
              <RowSummary row={row} />
              <Switch
                aria-label={`Include row ${row.rowNumber}`}
                checked={row.included}
                onCheckedChange={(checked) => void include(row, checked)}
              />
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

/** The rows the profile could not read, with their cells and reason (FR-028). */
function UnparsableDrawer({
  rows,
  open,
  onOpenChange,
}: {
  rows: UnparsableRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Unparsable rows</SheetTitle>
          <SheetDescription>
            These rows cannot be imported. Fix them in the bank file, or record them by hand.
          </SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col divide-y overflow-y-auto px-4">
          {rows.map((row) => (
            <li key={row.rowNumber} className="flex flex-col gap-1 py-3 text-sm">
              <span className="font-medium">Row {row.rowNumber}</span>
              <span className="font-mono text-xs break-all text-muted-foreground">
                {row.cells.join(" · ")}
              </span>
              <span className="text-destructive">{messageFor(row.failure)}</span>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

function BatchReview({ batch }: { batch: PendingBatch }) {
  const account = useStore((state) => state.accounts.find((a) => a.id === batch.accountId));
  const view = useMemo(() => reviewView(batch), [batch]);
  const [drawer, setDrawer] = useState<"duplicates" | "unparsable" | null>(null);
  const [refusal, setRefusal] = useState<Refusal<MessageCode> | null>(null);
  const { counts } = view;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Review import</h1>
      <section
        aria-label="Batch"
        className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
      >
        <div className="flex flex-col gap-1">
          <span className="font-medium">{batch.fileName}</span>
          <span className="text-sm text-muted-foreground">Into {account?.name}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{plural(counts.review, "row")} to review</span>
          <Button variant="outline" size="sm" onClick={() => setDrawer("duplicates")}>
            {plural(counts.duplicates, "duplicate")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDrawer("unparsable")}>
            {counts.unparsable} unparsable
          </Button>
        </div>
      </section>
      {refusal && (
        <p role="alert" className="text-sm text-destructive">
          {messageFor(refusal)}
        </p>
      )}
      <ReviewGroups view={view} batchAccountId={batch.accountId} onRefusal={setRefusal} />
      <DuplicatesDrawer
        rows={view.duplicates}
        open={drawer === "duplicates"}
        onOpenChange={(open) => setDrawer(open ? "duplicates" : null)}
        onRefusal={setRefusal}
      />
      <UnparsableDrawer
        rows={view.unparsable}
        open={drawer === "unparsable"}
        onOpenChange={(open) => setDrawer(open ? "unparsable" : null)}
      />
    </div>
  );
}

/** Review of the pending batch at `#/import/review` (contracts/ui.md, review). */
export function ReviewScreen() {
  const batch = useStore((state) => state.pendingBatch);
  if (!batch) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
        <p>No import is waiting for review. Import a bank file to start one.</p>
        <Button onClick={() => navigate("/import")}>Go to Import</Button>
      </div>
    );
  }
  return <BatchReview batch={batch} />;
}
