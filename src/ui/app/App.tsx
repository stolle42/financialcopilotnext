import { CSPProvider } from "@base-ui/react/csp-provider";
import { createContext, type ReactNode } from "react";
import { Toaster } from "@/ui/components/ui/toast";
import { useRoute } from "./router";

function SidebarGroup({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

// Stands in for the transaction list until T032 builds it.
function TransactionsPlaceholder() {
  return <h1 className="text-2xl font-semibold">Transactions</h1>;
}

/**
 * Whether the browser agreed to keep the app's data, as start-up asked it (R-07). Pending until
 * the browser answers; the Backup screen shows it (FR-075).
 */
export const StoragePersistedContext = createContext<Promise<boolean>>(Promise.resolve(false));

/** The desktop shell: header, sidebar and the screen of the current route (contracts/ui.md). */
export function App({ storagePersisted }: { storagePersisted: Promise<boolean> }) {
  const route = useRoute();
  const screen = route.name === "transactions" ? <TransactionsPlaceholder /> : null;

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
                className="flex w-56 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 text-sidebar-foreground"
              >
                <SidebarGroup title="Main" />
                <SidebarGroup title="Manage" />
              </nav>
              <main className="flex-1 p-6">{screen}</main>
            </div>
          </div>
        </Toaster>
      </StoragePersistedContext.Provider>
    </CSPProvider>
  );
}
