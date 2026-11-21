import { useState } from "react";
import type { ParsedRow, Refusal } from "@/domain/types";
import { bringBack } from "@/store/import";
import { setSetAsideAmount } from "@/store/settings";
import { useStoreApi } from "@/store/store";
import { AmountField, amountText } from "@/ui/components/AmountField";
import { Button } from "@/ui/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/ui/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/ui/components/ui/sheet";
import { formatAmount } from "@/ui/format";
import { messageFor, type MessageCode } from "@/ui/messages";
import { RowSummary } from "./RowSummary";

/** The amounts the buttons stand for, in cents (FR-161). */
const PRESETS = [100, 500, 1000] as const;

/**
 * The amount under which review skips rows, saved as it is typed, with what it does in plain
 * words, the buttons for common amounts and the line that says what it does to this batch
 * (FR-152, FR-154, FR-161). The field keeps its own text, so text that is no amount stays visible
 * beside its error.
 */
export function SetAside({
  under,
  skipped,
  totalCents,
  reviewing,
}: {
  /** The stored amount, in cents, or `undefined` when no rows are skipped. */
  under: number | undefined;
  /** How many rows the amount skips, what they come to, and how many rows stay under review. */
  skipped: number;
  totalCents: number;
  reviewing: number;
}) {
  const store = useStoreApi();
  const [text, setText] = useState(() => (under === undefined ? "" : amountText(under)));
  const [error, setError] = useState<MessageCode | null>(null);

  async function change(next: string) {
    setText(next);
    const refusal = await setSetAsideAmount(store, next);
    setError(refusal ? refusal.code : null);
  }

  /** The line under the field: what the amount does to this batch (FR-161). */
  function line(): string {
    if (under === undefined) return "No rows are skipped.";
    if (skipped === 0) return `No rows are under ${formatAmount(under)}.`;
    const of = reviewing + skipped;
    return skipped === 1
      ? `1 of ${of} rows is under ${formatAmount(under)}. It comes to ${formatAmount(totalCents)}, and it is imported as Uncategorised.`
      : `${skipped} of ${of} rows are under ${formatAmount(under)}. Together they come to ${formatAmount(totalCents)}, and they are imported as Uncategorised.`;
  }

  return (
    <section aria-label="Skip small rows" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <Field data-invalid={error ? true : undefined} className="w-44">
          <FieldLabel htmlFor="set-aside-under">Skip rows under</FieldLabel>
          <AmountField
            id="set-aside-under"
            placeholder="No rows skipped"
            value={text}
            onValueChange={(next) => void change(next)}
            aria-invalid={error ? true : undefined}
          />
          <FieldError>{error && messageFor({ code: error })}</FieldError>
        </Field>
        <p className="max-w-md pt-6 text-sm text-muted-foreground">
          Rows under this amount are not reviewed. They are still imported, as Uncategorised, so
          your balances stay right.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((cents) => (
          <Button
            key={cents}
            variant={under === cents ? "default" : "outline"}
            size="sm"
            aria-pressed={under === cents}
            onClick={() => void change(amountText(cents))}
          >
            Under {cents / 100}
          </Button>
        ))}
        <Button
          variant={under === undefined ? "default" : "outline"}
          size="sm"
          aria-pressed={under === undefined}
          onClick={() => void change("")}
        >
          Skip none
        </Button>
      </div>
      <p className="text-sm">{line()}</p>
    </section>
  );
}

/** The skipped rows by date, each with Review this row, which keeps the row in review (FR-153). */
export function SetAsideDrawer({
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
  async function back(row: ParsedRow) {
    const refusal = await bringBack(store, row.rowNumber);
    onRefusal(refusal);
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Skipped rows</SheetTitle>
          <SheetDescription>
            These rows are not reviewed. They are still imported, as Uncategorised. Choose Review
            this row to give one a category.
          </SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col divide-y overflow-y-auto px-4">
          {rows.map((row) => (
            <li
              key={row.rowNumber}
              className="grid grid-cols-[6rem_1fr_6rem_auto] items-center gap-3 py-3 text-sm"
            >
              <RowSummary row={row} />
              <Button variant="outline" size="sm" onClick={() => void back(row)}>
                Review this row
              </Button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
