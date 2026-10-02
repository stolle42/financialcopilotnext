import { useId, useState, type FormEvent } from "react";
import type { AccountInput } from "@/domain/accounts";
import type { Account, AccountType } from "@/domain/types";
import { addAccount, editAccount } from "@/store/accounts";
import { useStoreApi } from "@/store/store";
import { AmountField, amountText, parseAmountText } from "@/ui/components/AmountField";
import { ConfirmDialog } from "@/ui/components/ConfirmDialog";
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
import { Input } from "@/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/ui/select";
import { messageFor, type MessageCode } from "@/ui/messages";
import { accountTypes } from "./accountTypes";

interface Errors {
  name?: MessageCode;
  openingBalance?: MessageCode;
  form?: MessageCode;
}

/** Creates an account, or edits `account`: name, type and opening balance (contracts/ui.md). */
export function AccountDialog({
  account,
  onClose,
}: {
  account: Account | null;
  onClose: () => void;
}) {
  const store = useStoreApi();
  const ids = { name: useId(), type: useId(), openingBalance: useId() };
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "checking");
  const [openingBalance, setOpeningBalance] = useState(
    amountText(account?.openingBalanceCents ?? 0),
  );
  const [errors, setErrors] = useState<Errors>({});
  // A changed opening balance waits here for the severe warning to be confirmed (FR-001).
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<AccountInput | null>(null);

  async function save(input: AccountInput) {
    const refusal = account
      ? await editAccount(store, account.id, input)
      : await addAccount(store, input);
    if (!refusal) onClose();
    else if (refusal.code === "save-failed") setErrors({ form: refusal.code });
    else setErrors({ name: refusal.code });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const openingBalanceCents = parseAmountText(openingBalance, true);
    if (openingBalanceCents === null) {
      setErrors({ openingBalance: "balance-invalid" });
      return;
    }
    const input = { name, type, openingBalanceCents };
    if (account && openingBalanceCents !== account.openingBalanceCents) {
      setAwaitingConfirmation(input);
      return;
    }
    void save(input);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? "Edit account" : "New account"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <FieldGroup>
            <Field data-invalid={errors.name ? true : undefined}>
              <FieldLabel htmlFor={ids.name}>Name</FieldLabel>
              <Input
                id={ids.name}
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={errors.name ? true : undefined}
                autoComplete="off"
              />
              <FieldError>{errors.name && messageFor({ code: errors.name })}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor={ids.type}>Type</FieldLabel>
              <Select
                items={accountTypes}
                value={type}
                onValueChange={(value) => value && setType(value)}
              >
                <SelectTrigger id={ids.type} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accountTypes.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field data-invalid={errors.openingBalance ? true : undefined}>
              <FieldLabel htmlFor={ids.openingBalance}>Opening balance</FieldLabel>
              <AmountField
                id={ids.openingBalance}
                value={openingBalance}
                onValueChange={setOpeningBalance}
                aria-invalid={errors.openingBalance ? true : undefined}
              />
              <FieldError>
                {errors.openingBalance && messageFor({ code: errors.openingBalance })}
              </FieldError>
            </Field>
          </FieldGroup>
          {errors.form && (
            <p role="alert" className="text-sm text-destructive">
              {messageFor({ code: errors.form })}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit">{account ? "Save" : "Create account"}</Button>
          </DialogFooter>
        </form>
        <ConfirmDialog
          open={awaitingConfirmation !== null}
          title="Change the opening balance?"
          description="Every balance this account has ever shown will change. No transaction is created."
          confirmLabel="Change opening balance"
          danger
          onConfirm={() => {
            const input = awaitingConfirmation;
            setAwaitingConfirmation(null);
            if (input) void save(input);
          }}
          onCancel={() => setAwaitingConfirmation(null)}
        />
      </DialogContent>
    </Dialog>
  );
}
