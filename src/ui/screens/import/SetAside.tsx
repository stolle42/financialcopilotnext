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

/**
 * The amount under which review sets rows aside, saved as it is typed, with what it does in plain
 * words and the line that opens the rows set aside (FR-152, FR-153, FR-154). The field keeps its
 * own text, so text that is no amount stays visible beside its error.
 */
export function SetAside({
  under,
  count,
  onOpen,
}: {
  /** The stored amount, in cents, or `undefined` when no rows are set aside. */
  under: number | undefined;
  count: number;
  onOpen: () => void;
}) {
  const store = useStoreApi();
  const [text, setText] = useState(() => (under === undefined ? "" : amountText(under)));
  const [error, setError] = useState<MessageCode | null>(null);

  async function change(next: string) {
    setText(next);
    const refusal = await setSetAsideAmount(store, next);
    setError(refusal ? refusal.code : null);
  }

  return (
    <section aria-label="Set aside" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <Field data-invalid={error ? true : undefined} className="w-44">
          <FieldLabel htmlFor="set-aside-under">Set aside rows under</FieldLabel>
          <AmountField
            id="set-aside-under"
            placeholder="No rows set aside"
            value={text}
            onValueChange={(next) => void change(next)}
            aria-invalid={error ? true : undefined}
          />
          <FieldError>{error && messageFor({ code: error })}</FieldError>
        </Field>
        <p className="max-w-md pt-6 text-sm text-muted-foreground">
          Rows under this amount are left out of review and saved in Uncategorised.
        </p>
      </div>
      {under !== undefined && count > 0 && (
        <Button variant="link" className="self-start px-0" onClick={onOpen}>
          {count} {count === 1 ? "row" : "rows"} under {formatAmount(under)} set aside
        </Button>
      )}
    </section>
  );
}

/** The rows set aside by date, each with Bring back, which keeps the row in review (FR-153). */
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
          <SheetTitle>Rows set aside</SheetTitle>
          <SheetDescription>
            These rows are left out of review and saved in Uncategorised. Bring a row back to give
            it a category.
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
                Bring back
              </Button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
