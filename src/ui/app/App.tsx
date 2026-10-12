import { CSPProvider } from "@base-ui/react/csp-provider";
import { cn } from "cn";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { Transaction } from "@/domain/types";
import { Button } from "@/ui/components/ui/button";
import { Toaster } from "@/ui/components/ui/toast";
import { AccountsScreen } from "@/ui/screens/accounts/AccountsScreen";
import { BackupScreen } from "@/ui/screens/backup/BackupScreen";
import { InsightsScreen } from "@/ui/screens/insights/InsightsScreen";
import { BudgetsScreen } from "@/ui/screens/budgets/BudgetsScreen";
import { CategoriesScreen } from "@/ui/screens/categories/CategoriesScreen";
import { ImportScreen } from "@/ui/screens/import/ImportScreen";
import { emptyImport, ImportStateContext, type ImportState } from "@/ui/screens/import/importState";
import { ProfileEditor } from "@/ui/screens/import/ProfileEditor";
import { ReviewScreen } from "@/ui/screens/import/ReviewScreen";
import { OpenTransactionFormContext } from "@/ui/screens/transactions/formContext";
import { TransactionForm } from "@/ui/screens/transactions/TransactionForm";
import { TransactionsScreen } from "@/ui/screens/transactions/TransactionsScreen";
import { DataSharingSwitch, DataSharingWarning } from "./DataSharing";
import { useRoute, type Route } from "./router";
import { StoragePersistedContext } from "./storagePersisted";
import { version } from "../../../package.json";

// package.json writes MAJOR.MINOR.0, as npm needs three parts; the app shows MAJOR.MINOR
// (constitution IX, FR-088).
const appVersion = version.split(".").slice(0, 2).join(".");

/** The sidebar, one flat list in the order of contracts/ui.md; each screen's task adds its entry. */
const sidebarEntries: { route: Route["name"]; label: string; href: string }[] = [
  { route: "transactions", label: "Transactions", href: "#/" },
  { route: "categories", label: "Categories", href: "#/categories" },
  { route: "accounts", label: "Accounts", href: "#/accounts" },
  { route: "budgets", label: "Budgets", href: "#/budgets" },
  { route: "backup", label: "Backup", href: "#/backup" },
  { route: "insights", label: "Insights", href: "#/insights" },
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
    case "categories":
      return <CategoriesScreen />;
    case "accounts":
      return <AccountsScreen />;
    case "backup":
      return <BackupScreen />;
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
                <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold">Financial Copilot</span>
                    <span className="text-xs text-muted-foreground">Version {appVersion}</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <DataSharingSwitch />
                    {/* The primary action, reachable from every screen (FR-066). */}
                    <Button onClick={() => openForm(null)}>Add transaction</Button>
                  </div>
                </header>
                <DataSharingWarning />
                <div className="flex flex-1">
                  <nav
                    aria-label="Screens"
                    className="flex w-56 shrink-0 flex-col gap-1 border-r bg-sidebar p-4 text-sidebar-foreground"
                  >
                    {sidebarEntries.map((entry) => (
                      <a
                        key={entry.route}
                        href={entry.href}
                        aria-current={currentEntry === entry.route ? "page" : undefined}
                        className={cn(
                          "rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent",
                          currentEntry === entry.route && "bg-sidebar-accent",
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
