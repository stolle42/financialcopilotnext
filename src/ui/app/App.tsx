import { CSPProvider } from "@base-ui/react/csp-provider";
import { cn } from "cn";
import { createContext, type ReactNode } from "react";
import { Toaster } from "@/ui/components/ui/toast";
import { AccountsScreen } from "@/ui/screens/accounts/AccountsScreen";
import { useRoute, type Route } from "./router";

// Stands in for the transaction list until T032 builds it.
function TransactionsPlaceholder() {
  return <h1 className="text-2xl font-semibold">Transactions</h1>;
}

/** The sidebar, one flat list in the order of contracts/ui.md; each screen's task adds its entry. */
const sidebarEntries: { route: Route["name"]; label: string; href: string }[] = [
  { route: "accounts", label: "Accounts", href: "#/accounts" },
];

function screenFor(route: Route): ReactNode {
  switch (route.name) {
    case "transactions":
      return <TransactionsPlaceholder />;
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

  return (
    // Base UI must not inject <style> elements, which the Content-Security-Policy blocks (R-19).
    <CSPProvider disableStyleElements>
      <StoragePersistedContext.Provider value={storagePersisted}>
        <Toaster>
          <div className="flex min-h-screen flex-col">
            <header className="flex h-14 shrink-0 items-center border-b px-6">
              <span className="text-lg font-semibold">Financial Copilot</span>
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
        </Toaster>
      </StoragePersistedContext.Provider>
    </CSPProvider>
  );
}
