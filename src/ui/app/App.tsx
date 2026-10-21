import { CSPProvider } from "@base-ui/react/csp-provider";
import { cn } from "cn";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { Transaction } from "@/domain/types";
import { runningVersion } from "@/pwa/updates";
import { Button } from "@/ui/components/ui/button";
import { Toaster } from "@/ui/components/ui/toast";
import { AccountsScreen } from "@/ui/screens/accounts/AccountsScreen";
import { BackupScreen } from "@/ui/screens/backup/BackupScreen";
import { FinanceChat } from "@/ui/screens/chat/FinanceChat";
import { InsightsScreen } from "@/ui/screens/insights/InsightsScreen";
import { BudgetsScreen } from "@/ui/screens/budgets/BudgetsScreen";
import { CategoriesScreen } from "@/ui/screens/categories/CategoriesScreen";
import { ImportScreen } from "@/ui/screens/import/ImportScreen";
import { emptyImport, ImportStateContext, type ImportState } from "@/ui/screens/import/importState";
import { ProfileEditor } from "@/ui/screens/import/ProfileEditor";
import { ReviewScreen } from "@/ui/screens/import/ReviewScreen";
import { SettingsScreen } from "@/ui/screens/settings/SettingsScreen";
import { OpenTransactionFormContext } from "@/ui/screens/transactions/formContext";
import { TransactionForm } from "@/ui/screens/transactions/TransactionForm";
import { TransactionsScreen } from "@/ui/screens/transactions/TransactionsScreen";
import { type Route, transactionsPath, useRoute } from "./router";
import { StoragePersistedContext } from "./storagePersisted";

/** The sidebar, one flat list in the order of contracts/ui.md; each screen's task adds its entry. */
const sidebarEntries: { route: Route["name"]; label: string; href: string }[] = [
  { route: "transactions", label: "Transactions", href: "#/" },
  { route: "categories", label: "Categories", href: "#/categories" },
  { route: "accounts", label: "Accounts", href: "#/accounts" },
  { route: "budgets", label: "Budgets", href: "#/budgets" },
  { route: "backup", label: "Backup", href: "#/backup" },
  { route: "insights", label: "Insights", href: "#/insights" },
  { route: "settings", label: "Settings", href: "#/settings" },
];

/**
 * The sidebar entry a screen counts as: the import screens open from Transactions, whose list an
 * import feeds (contracts/ui.md, shell and navigation).
 */
function sidebarEntryOf(route: Route): Route["name"] {
  switch (route.name) {
    case "import":
    case "review":
    case "profile-new":
    case "profile":
      return "transactions";
    default:
      return route.name;
  }
}

function screenFor(route: Route): ReactNode {
  switch (route.name) {
    case "transactions":
      // A new address starts the list again with its own filters (FR-110).
      return (
        <TransactionsScreen key={transactionsPath(route.filters ?? {})} filters={route.filters} />
      );
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
    case "categories":
      return <CategoriesScreen />;
    case "accounts":
      return <AccountsScreen />;
    case "backup":
      return <BackupScreen />;
    case "settings":
      return <SettingsScreen />;
    default:
      return null;
  }
}

/** The desktop shell: header, sidebar and the screen of the current route (contracts/ui.md). */
export function App({ storagePersisted }: { storagePersisted: Promise<boolean> }) {
  const route = useRoute();
  const currentEntry = sidebarEntryOf(route);
  // The one transaction form: `transaction: null` adds a new one.
  const [form, setForm] = useState<{ transaction: Transaction | null } | null>(null);
  // The same function on every render, so the memoised transaction rows need not render again.
  const openForm = useCallback((transaction: Transaction | null) => setForm({ transaction }), []);
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
                <header className="flex h-16 shrink-0 items-center justify-between px-6">
                  <div className="flex items-baseline gap-2">
                    <span className="font-heading text-xl font-semibold">Financial Copilot</span>
                    <span className="text-xs text-muted-foreground">Version {runningVersion}</span>
                  </div>
                  {/* The primary action, reachable from every screen (FR-066). */}
                  <Button onClick={() => openForm(null)}>Add transaction</Button>
                </header>
                <div className="flex flex-1">
                  <nav
                    aria-label="Screens"
                    className="surface mt-6 ml-6 flex w-56 shrink-0 flex-col gap-1 self-start p-2"
                  >
                    {sidebarEntries.map((entry) => (
                      <a
                        key={entry.route}
                        href={entry.href}
                        aria-current={currentEntry === entry.route ? "page" : undefined}
                        className={cn(
                          "rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                          currentEntry === entry.route &&
                            "bg-sidebar-accent text-sidebar-accent-foreground",
                        )}
                      >
                        {entry.label}
                      </a>
                    ))}
                  </nav>
                  {/* Ends in space taller than the chat's button, which hides no content (FR-100). */}
                  <main className="flex-1 p-6 pb-24">{screenFor(route)}</main>
                </div>
                <FinanceChat />
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
