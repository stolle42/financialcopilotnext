import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { sortAccounts } from "@/domain/accounts";
import {
  changeAccount,
  changeKind,
  draftOf,
  newDraft,
  type Draft,
  type DraftInvalid,
} from "@/domain/transactions";
import type { Transaction } from "@/domain/types";
import { todayLocal } from "@/store/clock";
import { useStore, useStoreApi } from "@/store/store";
import { removeTransaction, saveTransaction } from "@/store/transactions";
import { AmountField, amountText, parseAmountText } from "@/ui/components/AmountField";
import { CategorySelect } from "@/ui/components/CategorySelect";
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
import { ToggleGroup, ToggleGroupItem } from "@/ui/components/ui/toggle-group";
import { messageFor, type MessageCode } from "@/ui/messages";

const kinds: { value: Transaction["kind"]; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

const isKind = (value: unknown): value is Transaction["kind"] =>
  kinds.some((kind) => kind.value === value);

/**
 * The transaction form (contracts/ui.md): a modal for a new transaction, or for editing
 * `transaction`. Focus starts in Amount and Enter saves (SC-002).
 */
export function TransactionForm({
  transaction,
  onClose,
}: {
  transaction: Transaction | null;
  onClose: () => void;
}) {
  const store = useStoreApi();
  const categories = useStore((state) => state.categories);
  const accounts = useStore((state) => state.accounts);
  const sortedAccounts = useMemo(() => sortAccounts(accounts), [accounts]);
  const ids = {
    amount: useId(),
    category: useId(),
    account: useId(),
    date: useId(),
    description: useId(),
  };
  const amountInput = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<Draft>(() =>
    transaction ? draftOf(transaction) : newDraft(store.getState(), todayLocal()),
  );
  const [amount, setAmount] = useState(() => amountText(draft.amountCents ?? 0));
  const [errors, setErrors] = useState<DraftInvalid["details"]>({});
  const [formError, setFormError] = useState<MessageCode | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name;
  const destinations = sortedAccounts.filter((account) => account.id !== draft.accountId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await saveTransaction(store, {
      ...draft,
      amountCents: parseAmountText(amount, false),
    });
    if (!result) onClose();
    else if (result.code === "draft-invalid") setErrors(result.details);
    else if (result.code === "save-failed") setFormError(result.code);
    // The form never offers such a category, so reaching this is a bug, not a user mistake.
    else throw new Error(`Refused unexpectedly: ${result.code}`);
  }

  async function deleteEdited() {
    setConfirmingDelete(false);
    if (!transaction) return;
    const refusal = await removeTransaction(store, transaction.id);
    if (refusal) setFormError(refusal.code);
    else onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent initialFocus={amountInput}>
        <DialogHeader>
          <DialogTitle>{transaction ? "Edit transaction" : "Add transaction"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <FieldGroup>
            <ToggleGroup
              aria-label="Kind"
              variant="outline"
              value={[draft.kind]}
              onValueChange={(values) => {
                const kind = values[0];
                if (isKind(kind)) setDraft(changeKind(draft, kind, categories));
              }}
            >
              {kinds.map((kind) => (
                <ToggleGroupItem key={kind.value} value={kind.value}>
                  {kind.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <Field data-invalid={errors.amount ? true : undefined}>
              <FieldLabel htmlFor={ids.amount}>Amount</FieldLabel>
              <AmountField
                ref={amountInput}
                id={ids.amount}
                value={amount}
                onValueChange={setAmount}
                aria-invalid={errors.amount ? true : undefined}
              />
              <FieldError>{errors.amount && messageFor({ code: errors.amount })}</FieldError>
            </Field>

            {draft.kind === "transfer" ? (
              <Field data-invalid={errors.destination ? true : undefined}>
                {accounts.length < 2 ? (
                  <p role="alert" className="text-sm">
                    {messageFor({ code: "transfer-needs-second-account" })}{" "}
                    <a href="#/accounts" onClick={onClose} className="font-medium underline">
                      Go to Accounts
                    </a>
                  </p>
                ) : (
                  <>
                    <FieldLabel htmlFor={ids.category}>Destination</FieldLabel>
                    <Select
                      value={draft.destinationAccountId}
                      onValueChange={(id) => setDraft({ ...draft, destinationAccountId: id })}
                    >
                      <SelectTrigger id={ids.category} className="w-full">
                        <SelectValue>
                          {(id: string | null) =>
                            accountName(id) ?? (
                              <span className="text-muted-foreground">Choose an account</span>
                            )
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {destinations.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError>
                      {errors.destination && messageFor({ code: errors.destination })}
                    </FieldError>
                  </>
                )}
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor={ids.category}>Category</FieldLabel>
                <CategorySelect
                  id={ids.category}
                  side={draft.kind}
                  value={draft.categoryId}
                  onValueChange={(categoryId) => setDraft({ ...draft, categoryId })}
                />
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor={ids.account}>Account</FieldLabel>
              <Select
                value={draft.accountId}
                onValueChange={(id) => id && setDraft(changeAccount(draft, id))}
              >
                <SelectTrigger id={ids.account} className="w-full">
                  <SelectValue>{(id: string) => accountName(id)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {sortedAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field data-invalid={errors.date ? true : undefined}>
              <FieldLabel htmlFor={ids.date}>Date</FieldLabel>
              <Input
                id={ids.date}
                type="date"
                value={draft.date}
                onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                aria-invalid={errors.date ? true : undefined}
              />
              <FieldError>{errors.date && messageFor({ code: errors.date })}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor={ids.description}>Description</FieldLabel>
              <Input
                id={ids.description}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                autoComplete="off"
              />
            </Field>
          </FieldGroup>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {messageFor({ code: formError })}
            </p>
          )}
          <DialogFooter>
            {transaction && (
              <Button
                type="button"
                variant="destructive"
                className="sm:mr-auto"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </Button>
            )}
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
        <ConfirmDialog
          open={confirmingDelete}
          title="Delete this transaction?"
          description="It is removed from the ledger, and the balance of every account it touched changes."
          confirmLabel="Delete transaction"
          onConfirm={() => void deleteEdited()}
          onCancel={() => setConfirmingDelete(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
