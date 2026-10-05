import { useId, useRef, useState, type FormEvent } from "react";
import { accountBalance } from "@/domain/accounts";
import type { Account } from "@/domain/types";
import { reconcile } from "@/store/accounts";
import { useStoreApi } from "@/store/store";
import { AmountField, amountText, parseAmountText } from "@/ui/components/AmountField";
import { Button } from "@/ui/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/ui/components/ui/field";
import { toast } from "@/ui/components/ui/toast";
import { messageFor, notifications, type MessageCode } from "@/ui/messages";

/** Asks what `account` really holds, then books the difference to Unaccounted (FR-005). */
export function ReconcileDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const store = useStoreApi();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  // It starts from the computed balance, so the dialog shows what the app believes.
  const [balance, setBalance] = useState(() =>
    amountText(accountBalance(store.getState(), account.id)),
  );
  const [fieldError, setFieldError] = useState<MessageCode | null>(null);
  const [formError, setFormError] = useState<MessageCode | null>(null);

  function change(text: string) {
    setBalance(text);
    setFieldError(null);
    setFormError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const statedCents = parseAmountText(balance, true);
    if (statedCents === null) {
      setFieldError("balance-invalid");
      return;
    }
    const refusal = await reconcile(store, account.id, statedCents);
    if (refusal) {
      setFormError(refusal.code);
      return;
    }
    // The entry just booked has the highest seq, so the notification names what was booked.
    const { transactions, categories } = store.getState();
    const booked = transactions.reduce((last, t) => (t.seq > last.seq ? t : last));
    if (booked.kind !== "transfer") {
      const category = categories.find((c) => c.id === booked.categoryId);
      toast.add({
        title: notifications.reconciled(booked.kind, booked.amountCents, category?.name ?? ""),
        type: "success",
      });
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent initialFocus={input}>
        <DialogHeader>
          <DialogTitle>Reconcile {account.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <FieldGroup>
            <Field data-invalid={fieldError ? true : undefined}>
              <FieldLabel htmlFor={id}>Actual balance</FieldLabel>
              <AmountField
                ref={input}
                id={id}
                value={balance}
                onValueChange={change}
                aria-invalid={fieldError ? true : undefined}
              />
              <FieldError>{fieldError && messageFor({ code: fieldError })}</FieldError>
            </Field>
          </FieldGroup>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {messageFor({ code: formError })}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit">Reconcile</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
