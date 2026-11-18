import { useMemo, useState } from "react";
import { confirmationCounts } from "@/domain/import/confirm";
import { reviewView } from "@/domain/import/groups";
import type { ParsedRow, PendingBatch, Refusal, UnparsableRow } from "@/domain/types";
import { confirmBatch, discardBatch, includeDuplicate } from "@/store/import";
import { useStore, useStoreApi } from "@/store/store";
import { navigate } from "@/ui/app/router";
import { ScreenIntro } from "@/ui/components/ScreenIntro";
import { ConfirmDialog } from "@/ui/components/ConfirmDialog";
import { RefusalMessage } from "@/ui/components/RefusalMessage";
import { Button } from "@/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/ui/components/ui/sheet";
import { Switch } from "@/ui/components/ui/switch";
import { toast } from "@/ui/components/ui/toast";
import { confirmationSummary, messageFor, notifications, type MessageCode } from "@/ui/messages";
import { ReviewGroups } from "./ReviewGroups";
import { useReviewFocus } from "./useReviewFocus";
import { RowSummary } from "./RowSummary";
import { SuggestCategories } from "./SuggestCategories";

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
              <span className="text-xs break-all text-muted-foreground">
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

/** Discard, or confirm the rows under review into the ledger, each after a confirmation (FR-027). */
function ReviewFooter({
  batch,
  count,
  accountName,
  aiAnswering,
  onRefusal,
}: {
  batch: PendingBatch;
  count: number;
  accountName: string;
  /** The AI is answering, so confirming waits (FR-027). */
  aiAnswering: boolean;
  onRefusal: (refusal: Refusal<MessageCode> | null) => void;
}) {
  const store = useStoreApi();
  const [asking, setAsking] = useState<"confirm" | "discard" | null>(null);
  // What the modal states is counted from the state when it opens (FR-157).
  const [counts, setCounts] = useState(() => confirmationCounts(store.getState()));
  const added = plural(count, "transaction");

  async function confirm() {
    setAsking(null);
    const before = store.getState().transactions.length;
    const refusal = await confirmBatch(store);
    onRefusal(refusal);
    if (refusal) return;
    const entered = store.getState().transactions.length - before;
    toast.add({
      title: notifications.importConfirmed(entered, accountName, counts.becomingTransfers),
      type: "success",
    });
    navigate("/");
  }

  async function discard() {
    setAsking(null);
    const refusal = await discardBatch(store);
    onRefusal(refusal);
    if (refusal) return;
    toast.add({ title: notifications.importDiscarded(batch.fileName), type: "success" });
    navigate("/import");
  }

  return (
    // Confirm comes first in the DOM, so Tab from the last item reaches it (FR-150); the row is
    // reversed, so Discard stays on the left.
    <section
      aria-label="Finish review"
      className="flex flex-row-reverse items-center justify-between border-t pt-4"
    >
      <Button
        disabled={aiAnswering}
        onClick={() => {
          setCounts(confirmationCounts(store.getState()));
          setAsking("confirm");
        }}
      >
        Confirm {added}
      </Button>
      <Button variant="outline" onClick={() => setAsking("discard")}>
        Discard
      </Button>
      <ConfirmDialog
        open={asking === "confirm"}
        title={`Add ${added} to ${accountName}?`}
        description={`${confirmationSummary(counts)} A confirmed import cannot be undone as a whole.`}
        confirmLabel={`Add ${added}`}
        onConfirm={() => void confirm()}
        onCancel={() => setAsking(null)}
      />
      <ConfirmDialog
        open={asking === "discard"}
        title="Discard this import?"
        description="None of its rows enter the ledger, and the choices made in review are lost."
        confirmLabel="Discard import"
        onConfirm={() => void discard()}
        onCancel={() => setAsking(null)}
      />
    </section>
  );
}

function BatchReview({ batch }: { batch: PendingBatch }) {
  const account = useStore((state) => state.accounts.find((a) => a.id === batch.accountId));
  const transactions = useStore((state) => state.transactions);
  const view = useMemo(() => reviewView(batch, transactions), [batch, transactions]);
  const [drawer, setDrawer] = useState<"duplicates" | "unparsable" | null>(null);
  const [refusal, setRefusal] = useState<Refusal<MessageCode> | null>(null);
  const [askingAi, setAskingAi] = useState(false);
  const focus = useReviewFocus(view);
  const { counts } = view;

  return (
    <div className="flex flex-col gap-6">
      <ReviewHeading />
      <section
        aria-label="Batch"
        className="surface flex flex-wrap items-center justify-between gap-4 p-6"
      >
        <div className="flex flex-col gap-1">
          <span className="font-medium">{batch.fileName}</span>
          <span className="text-sm text-muted-foreground">Into {account?.name}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{plural(counts.review, "row")} to review</span>
          <span>{focus.notSeen === 0 ? "All seen" : `${focus.notSeen} not seen yet`}</span>
          {counts.suggestedTransfers > 0 && (
            <span>{plural(counts.suggestedTransfers, "suggested transfer")}</span>
          )}
          <Button variant="outline" size="sm" onClick={() => setDrawer("duplicates")}>
            {plural(counts.duplicates, "duplicate")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDrawer("unparsable")}>
            {counts.unparsable} unparsable
          </Button>
        </div>
      </section>
      <SuggestCategories view={view} onRefusal={setRefusal} onAskingChange={setAskingAi} />
      {refusal && (
        <p role="alert" className="text-sm text-destructive">
          <RefusalMessage refusal={refusal} />
        </p>
      )}
      <ReviewGroups
        view={view}
        batchAccountId={batch.accountId}
        focus={focus}
        onRefusal={setRefusal}
      />
      <ReviewFooter
        batch={batch}
        count={counts.review}
        accountName={account?.name ?? ""}
        aiAnswering={askingAi}
        onRefusal={setRefusal}
      />
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

/** The heading and what review is for, shown with and without an import waiting (FR-137). */
function ReviewHeading() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Review import</h1>
      <ScreenIntro>
        Give each vendor group a category, then confirm. Nothing enters the ledger before you select
        Confirm.
      </ScreenIntro>
    </>
  );
}

/** Review of the pending batch at `#/import/review` (contracts/ui.md, review). */
export function ReviewScreen() {
  const batch = useStore((state) => state.pendingBatch);
  if (!batch) {
    return (
      <div className="flex flex-col gap-6">
        <ReviewHeading />
        <div className="surface flex flex-col items-start gap-3 p-6">
          <p>No import is waiting for review. Import a bank file to start one.</p>
          <Button onClick={() => navigate("/import")}>Go to Import</Button>
        </div>
      </div>
    );
  }
  return <BatchReview batch={batch} />;
}
