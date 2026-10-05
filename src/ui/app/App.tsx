import { CSPProvider } from "@base-ui/react/csp-provider";
import { cn } from "cn";
import { createContext, useMemo, useState, type ReactNode } from "react";
import type { Transaction } from "@/domain/types";
import { Button } from "@/ui/components/ui/button";
import { Toaster } from "@/ui/components/ui/toast";
import { AccountsScreen } from "@/ui/screens/accounts/AccountsScreen";
import { InsightsScreen } from "@/ui/screens/insights/InsightsScreen";
import { BudgetsScreen } from "@/ui/screens/budgets/BudgetsScreen";
import { ImportScreen } from "@/ui/screens/import/ImportScreen";
import { emptyImport, ImportStateContext, type ImportState } from "@/ui/screens/import/importState";
import { ProfileEditor } from "@/ui/screens/import/ProfileEditor";
import { ReviewScreen } from "@/ui/screens/import/ReviewScreen";
import { OpenTransactionFormContext } from "@/ui/screens/transactions/formContext";
import { TransactionForm } from "@/ui/screens/transactions/TransactionForm";
import { TransactionsScreen } from "@/ui/screens/transactions/TransactionsScreen";
import { useRoute, type Route } from "./router";

/** The sidebar, one flat list in the order of contracts/ui.md; each screen's task adds its entry. */
const sidebarEntries: { route: Route["name"]; label: string; href: string }[] = [
  { route: "transactions", label: "Transactions", href: "#/" },
  { route: "insights", label: "Insights", href: "#/insights" },
  { route: "import", label: "Import", href: "#/import" },
  { route: "budgets", label: "Budgets", href: "#/budgets" },
  { route: "accounts", label: "Accounts", href: "#/accounts" },
];

function screenFor(route: Route): ReactNode {
  switch (route.name) {
    case "transactions":
      return <TransactionsScreen />;
    case "insights":
      return <InsightsScreen />;
    case "import":
      return <ImportScreen />;
    case "review":
      return <ReviewScreen />;
    case "profile-new":
      return <ProfileEditor key="new" profileId={null} />;
    case "profile":
      return <ProfileEditor key={route.id} profileId={route.id} />;
    case "budgets":
      return <BudgetsScreen />;
    case "accounts":
      return <AccountsScreen />;
    default:
      return null;
  }
}

/**
 * Whether the browser agreed to keep the app's data, as start-up asked it (R-07). Pending until
 * the browser answers; the Backup screen shows it (FR-075).
 */
export const StoragePersistedContext = createContext<Promise<boolean>>(Promise.resolve(false));

/** The desktop shell: header, sidebar and the screen of the current route (contracts/ui.md). */
export function App({ storagePersisted }: { storagePersisted: Promise<boolean> }) {
  const route = useRoute();
  // The one transaction form: `transaction: null` adds a new one.
  const [form, setForm] = useState<{ transaction: Transaction | null } | null>(null);
  const openForm = (transaction: Transaction | null) => setForm({ transaction });
  // The import's choices outlive a visit to the profile editor (contracts/ui.md, import).
  const [importState, setImportState] = useState<ImportState>(emptyImport);
  const importContext = useMemo(() => ({ importState, setImportState }), [importState]);

  return (
    // Base UI must not inject <style> elements, which the Content-Security-Policy blocks (R-19).
    <CSPProvider disableStyleElements>
      <StoragePersistedContext.Provider value={storagePersisted}>
        <OpenTransactionFormContext.Provider value={openForm}>
          <ImportStateContext.Provider value={importContext}>
            <Toaster>
              <div className="flex min-h-screen flex-col">
                <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
                  <span className="text-lg font-semibold">Financial Copilot</span>
                  {/* The primary action, reachable from every screen (FR-066). */}
                  <Button onClick={() => openForm(null)}>Add transaction</Button>
                </header>
                <div className="flex flex-1">
                  <nav
                    aria-label="Screens"
                    className="flex w-56 shrink-0 flex-col gap-1 border-r bg-sidebar p-4 text-sidebar-foreground"
                  >
                    {sidebarEntries.map((entry) => (
                      <a
                        key={entry.route}
                        href={entry.href}
                        aria-current={route.name === entry.route ? "page" : undefined}
                        className={cn(
                          "rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent",
                          route.name === entry.route && "bg-sidebar-accent",
                        )}
                      >
                        {entry.label}
                      </a>
                    ))}
                  </nav>
                  <main className="flex-1 p-6">{screenFor(route)}</main>
                </div>
              </div>
              {form && (
                <TransactionForm
                  key={form.transaction?.id ?? "new"}
                  transaction={form.transaction}
                  onClose={() => setForm(null)}
                />
              )}
            </Toaster>
          </ImportStateContext.Provider>
        </OpenTransactionFormContext.Provider>
      </StoragePersistedContext.Provider>
    </CSPProvider>
  );
}
