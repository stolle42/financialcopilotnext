import { useId, useMemo, useState } from "react";
import { sortAccounts } from "@/domain/accounts";
import type { AssignmentChoice } from "@/domain/import/review";
import type { Assignment, Side } from "@/domain/types";
import { useStore } from "@/store/store";
import { CategorySelect } from "@/ui/components/CategorySelect";
import { Label } from "@/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/ui/select";
import { Switch } from "@/ui/components/ui/switch";

interface AssignmentControlProps {
  /** Names the row or group the control belongs to, for its accessible name. */
  label: string;
  side: Side;
  /** `null` when the rows of a group differ. */
  assignment: Assignment | null;
  batchAccountId: string;
  onChoose: (choice: AssignmentChoice) => void;
}

/**
 * A review row's category, of its side and without "Unaccounted" (FR-029, FR-030), or a transfer
 * to another account (FR-023). Turning the transfer off restores the side's "Uncategorised".
 */
export function AssignmentControl({
  label,
  side,
  assignment,
  batchAccountId,
  onChoose,
}: AssignmentControlProps) {
  const accounts = useStore((state) => state.accounts);
  const counterAccounts = useMemo(
    () => sortAccounts(accounts).filter((account) => account.id !== batchAccountId),
    [accounts, batchAccountId],
  );
  // On while the user picks the counter-account; nothing is saved until one is picked.
  const [choosingAccount, setChoosingAccount] = useState(false);
  const isTransfer = assignment?.type === "transfer" || choosingAccount;
  const ids = { category: useId(), account: useId(), transfer: useId() };

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
            <CategorySelect
              id={ids.category}
              side={side}
              value={assignment?.type === "category" ? assignment.categoryId : null}
              placeholder="Mixed"
              onValueChange={(categoryId) => onChoose({ type: "category", categoryId })}
            />
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id={ids.transfer}
          checked={isTransfer}
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
