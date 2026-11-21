import { History, Sparkles } from "lucide-react";
import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { sortAccounts } from "@/domain/accounts";
import { markOf } from "@/domain/import/groups";
import type { AssignmentChoice } from "@/domain/import/review";
import type { Assignment, Refusal, Side } from "@/domain/types";
import type { MessageCode } from "@/ui/messages";
import { useStore } from "@/store/store";
import { CategoryPicker } from "@/ui/components/CategoryPicker";
import { Label } from "@/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/ui/select";
import { Switch } from "@/ui/components/ui/switch";

/** What the New category dialog hands over (FR-149). */
export type NewCategoryInput = { name: string; color: string };

interface AssignmentControlProps {
  /** Names the row or group the control belongs to, for its accessible name. */
  label: string;
  side: Side;
  /** `null` when the rows of a group differ. */
  assignment: Assignment | null;
  batchAccountId: string;
  onChoose: (choice: AssignmentChoice) => void;
  /** Creates a category and gives it in one change; resolves to the refusal, or `null` (FR-149). */
  onCreateCategory: (input: NewCategoryInput) => Promise<Refusal<MessageCode> | null>;
  /**
   * Review's Tab (FR-150): registers the field, the picker or, on a transfer, the Transfer switch,
   * and is told when Tab or Shift+Tab is pressed in it. Without it the control is a plain one.
   */
  field?: {
    ref: (element: HTMLElement | null) => void;
    onTab: (direction: "next" | "previous", event: KeyboardEvent) => void;
  };
}

/** The element holding the sentence of the mark "From earlier", which describes the mark (FR-154). */
export const usualSentenceId = "usual-mark-sentence";

/**
 * A review row's category, of its side and without "Unaccounted" (FR-029, FR-030), or a transfer
 * to another account (FR-023). Turning the transfer off restores the row's usual category, or
 * the side's "Uncategorised" (FR-143).
 */
export function AssignmentControl({
  label,
  side,
  assignment,
  batchAccountId,
  onChoose,
  onCreateCategory,
  field,
}: AssignmentControlProps) {
  const accounts = useStore((state) => state.accounts);
  const counterAccounts = useMemo(
    () => sortAccounts(accounts).filter((account) => account.id !== batchAccountId),
    [accounts, batchAccountId],
  );
  // On while the user picks the counter-account; nothing is saved until one is picked.
  const [choosingAccount, setChoosingAccount] = useState(false);
  const isTransfer = assignment?.type === "transfer" || choosingAccount;
  // The assignment carries its mark: of a group, only when all its rows hold it (FR-147).
  const mark = assignment && !choosingAccount ? markOf(assignment) : null;
  const ids = { category: useId(), account: useId(), transfer: useId() };

  /** Tab in the field picks the category the open list highlights, then moves on (FR-148, R-44). */
  function onFieldKeyDown(event: KeyboardEvent<HTMLElement>, highlighted: string | null = null) {
    if (!field || event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!isTransfer && highlighted) onChoose({ type: "category", categoryId: highlighted });
    field.onTab(event.shiftKey ? "previous" : "next", event);
  }

  return (
    <div role="group" aria-label={`Assignment of ${label}`} className="flex items-center gap-3">
      <div className="w-52">
        {isTransfer ? (
          <>
            <Label htmlFor={ids.account} className="sr-only">
              Transfer account
            </Label>
            <Select
              value={assignment?.type === "transfer" ? assignment.counterAccountId : null}
              onValueChange={(counterAccountId) => {
                if (!counterAccountId) return;
                setChoosingAccount(false);
                onChoose({ type: "transfer", counterAccountId });
              }}
            >
              <SelectTrigger id={ids.account} className="w-full">
                <SelectValue>
                  {(id: string | null) =>
                    accounts.find((a) => a.id === id)?.name ?? (
                      <span className="text-muted-foreground">Choose an account</span>
                    )
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {counterAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : (
          <>
            <Label htmlFor={ids.category} className="sr-only">
              Category
            </Label>
            <CategoryPicker
              id={ids.category}
              side={side}
              value={assignment?.type === "category" ? assignment.categoryId : null}
              placeholder="Mixed"
              inputRef={field?.ref}
              triggerTabIndex={field ? -1 : undefined}
              onKeyDown={onFieldKeyDown}
              onValueChange={(categoryId) => onChoose({ type: "category", categoryId })}
              onCreate={onCreateCategory}
            />
          </>
        )}
      </div>
      {mark === "suggested" && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Sparkles aria-hidden className="size-3.5" />
          Suggested
        </span>
      )}
      {mark === "usual" && (
        <span
          aria-describedby={usualSentenceId}
          className="flex items-center gap-1 text-xs text-muted-foreground"
        >
          <History aria-hidden className="size-3.5" />
          From earlier
        </span>
      )}
      <div className="flex items-center gap-2">
        <Switch
          id={ids.transfer}
          checked={isTransfer}
          // With review's Tab the field is the picker, or the switch on a transfer; the switch of
          // a category is reached with the mouse, so Tab goes from item to item.
          ref={isTransfer ? field?.ref : undefined}
          {...(field && !isTransfer ? { tabIndex: -1 } : {})}
          onKeyDown={(event) => onFieldKeyDown(event)}
          // A transfer needs another account to move money to (FR-011).
          disabled={counterAccounts.length === 0}
          onCheckedChange={(checked) => {
            setChoosingAccount(checked && assignment?.type !== "transfer");
            if (!checked && assignment?.type === "transfer") onChoose("uncategorised");
          }}
        />
        <Label htmlFor={ids.transfer} className="text-sm font-normal">
          Transfer
        </Label>
      </div>
    </div>
  );
}
