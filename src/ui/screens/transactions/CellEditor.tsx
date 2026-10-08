import {
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { sortAccounts } from "@/domain/accounts";
import { changeAccount, draftOf, type Draft } from "@/domain/transactions";
import type { Transaction } from "@/domain/types";
import { useStore } from "@/store/store";
import { AmountField, amountText, parseAmountText } from "@/ui/components/AmountField";
import { CategorySelect } from "@/ui/components/CategorySelect";
import { FieldError } from "@/ui/components/ui/field";
import { Input } from "@/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/ui/select";
import { messageFor, type MessageCode } from "@/ui/messages";

/** The editable columns of the transaction list, in order (contracts/ui.md, column headers). */
export type Column = "date" | "description" | "category" | "account" | "amount";

/** What a column's editor starts with: text for a field, an id for a select. */
function valueOf(transaction: Transaction, column: Column): string {
  if (column === "amount") return amountText(transaction.amountCents);
  if (column === "account") return transaction.accountId;
  if (column === "category") {
    // A transfer has no category; its cell holds the destination instead.
    return transaction.kind === "transfer"
      ? transaction.destinationAccountId
      : transaction.categoryId;
  }
  return transaction[column];
}

function draftWith(transaction: Transaction, column: Column, value: string): Draft {
  const draft = draftOf(transaction);
  if (column === "amount") return { ...draft, amountCents: parseAmountText(value, false) };
  if (column === "account") return changeAccount(draft, value);
  if (column === "date") return { ...draft, date: value };
  if (column === "description") return { ...draft, description: value };
  return draft.kind === "transfer"
    ? { ...draft, destinationAccountId: value }
    : { ...draft, categoryId: value };
}

/**
 * Edits one value of a transaction in its row (contracts/ui.md, editing in place). A field saves
 * on Enter or when left, a select saves when an option is picked, and Escape cancels. A refusal
 * shows under the cell, with the entered value still there.
 */
export function CellEditor({
  transaction,
  column,
  onSave,
  onClose,
}: {
  transaction: Transaction;
  column: Column;
  /** Resolves to `null` once the changed transaction is saved, or to the refusal's code. */
  onSave: (draft: Draft) => Promise<MessageCode | null>;
  /** Stops editing, which puts the cell back in the editor's place. */
  onClose: () => void;
}) {
  const accounts = useStore((state) => state.accounts);
  const sortedAccounts = useMemo(() => sortAccounts(accounts), [accounts]);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const closed = useRef(false);
  const [initial] = useState(() => valueOf(transaction, column));
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<MessageCode | null>(null);

  /** Closes the editor, and puts focus back on the cell unless the user has moved it elsewhere. */
  function finish(refocus: boolean) {
    if (closed.current || !root.current) return;
    closed.current = true;
    // The cell takes the editor's place in the row's grid, which outlives both.
    const grid = root.current.parentElement!;
    const index = Array.prototype.indexOf.call(grid.children, root.current);
    flushSync(onClose);
    if (refocus) (grid.children[index] as HTMLElement | undefined)?.focus();
  }

  async function commit(next: string, refocus: boolean) {
    if (next === initial) return finish(refocus);
    if (saving.current || closed.current) return;
    saving.current = true;
    const code = await onSave(draftWith(transaction, column, next));
    saving.current = false;
    if (code === null) return finish(refocus);
    setError(code);
    input.current?.focus();
  }

  const fieldProps = {
    ref: input,
    autoFocus: true,
    value,
    "aria-invalid": error ? true : undefined,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void commit(value, true);
    },
    // Focus moving on to another control is the user's choice, so it stays there.
    onBlur: (event: FocusEvent) => void commit(value, event.relatedTarget === null),
  };

  // Picking an option saves. Closing the list any other way, as with Escape, cancels.
  const selectProps = {
    defaultOpen: true,
    value,
    onOpenChange: (open: boolean, details: { reason: string }) => {
      if (!open && details.reason !== "item-press") finish(true);
    },
    onValueChange: (next: string | null) => {
      if (next === null) return;
      setValue(next);
      void commit(next, true);
    },
  };

  let editor: ReactNode;
  if (column === "description") {
    editor = (
      <Input
        {...fieldProps}
        aria-label="Description"
        autoComplete="off"
        onChange={(event) => setValue(event.target.value)}
      />
    );
  } else if (column === "date") {
    editor = (
      <Input
        {...fieldProps}
        aria-label="Date"
        type="date"
        onChange={(event) => setValue(event.target.value)}
      />
    );
  } else if (column === "amount") {
    editor = (
      <AmountField
        {...fieldProps}
        aria-label="Amount"
        className="text-right"
        onValueChange={setValue}
      />
    );
  } else if (column === "category" && transaction.kind !== "transfer") {
    editor = <CategorySelect {...selectProps} aria-label="Category" side={transaction.kind} />;
  } else {
    // A transfer's destination never equals its account (FR-011), so each select leaves out the
    // other's account.
    const isDestination = column === "category";
    const excluded =
      transaction.kind !== "transfer"
        ? null
        : isDestination
          ? transaction.accountId
          : transaction.destinationAccountId;
    editor = (
      <Select {...selectProps}>
        <SelectTrigger aria-label={isDestination ? "Destination" : "Account"} className="w-full">
          <SelectValue>
            {(id: string) => accounts.find((account) => account.id === id)?.name}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {sortedAccounts
            .filter((account) => account.id !== excluded)
            .map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div
      ref={root}
      className="flex min-w-0 flex-col gap-1"
      onKeyDown={(event) => {
        if (event.key === "Escape") finish(true);
      }}
    >
      {editor}
      <FieldError>{error && messageFor({ code: error })}</FieldError>
    </div>
  );
}
