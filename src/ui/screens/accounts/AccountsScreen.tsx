import { cn } from "cn";
import { useMemo, useState } from "react";
import { accountBalance, sortAccounts } from "@/domain/accounts";
import type { Account } from "@/domain/types";
import { useStore } from "@/store/store";
import { Button } from "@/ui/components/ui/button";
import { formatAmount } from "@/ui/format";
import { AccountDialog } from "./AccountDialog";
import { accountTypeLabel } from "./accountTypes";
import { ReconcileDialog } from "./ReconcileDialog";

/** Every account with its computed balance (FR-002), and the dialogs to add or edit one. */
export function AccountsScreen() {
  const state = useStore((s) => s);
  const rows = useMemo(
    () =>
      sortAccounts(state.accounts).map((account) => ({
        account,
        balance: accountBalance(state, account.id),
      })),
    [state],
  );
  // `account: null` is the New account dialog.
  const [dialog, setDialog] = useState<{ account: Account | null } | null>(null);
  const [reconciling, setReconciling] = useState<Account | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Accounts</h1>
        <Button onClick={() => setDialog({ account: null })}>New account</Button>
      </div>
      <div className="surface px-6 py-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Type</th>
              <th className="py-2 text-right font-medium">Balance</th>
              <th className="py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ account, balance }) => (
              <tr key={account.id} className="border-b last:border-b-0">
                <td className="py-2 font-medium">{account.name}</td>
                <td className="py-2 text-muted-foreground">{accountTypeLabel(account.type)}</td>
                <td
                  className={cn("py-2 text-right tabular-nums", balance < 0 && "text-destructive")}
                >
                  {formatAmount(balance)}
                </td>
                <td className="py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setReconciling(account)}>
                    Reconcile
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDialog({ account })}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dialog && <AccountDialog account={dialog.account} onClose={() => setDialog(null)} />}
      {reconciling && (
        <ReconcileDialog account={reconciling} onClose={() => setReconciling(null)} />
      )}
    </div>
  );
}
