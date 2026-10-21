// First, so it listens before the browser offers to install the app (FR-122).
import "@/pwa/install";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@/ui/index.css";
import { loadState, openDatabase, type Database } from "@/persistence/db";
import { registerWorker } from "@/pwa/updates";
import { createStore, StoreContext } from "@/store/store";
import { App } from "@/ui/app/App";
import { ErrorBoundary } from "@/ui/app/ErrorBoundary";
import { FailureScreen } from "@/ui/app/FailureScreen";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("index.html has no #root element");
const root = createRoot(rootElement);

let unexpectedErrorShown = false;

function render(node: ReactNode): void {
  // An error screen stays, even if start-up finishes after it.
  if (unexpectedErrorShown) return;
  root.render(<StrictMode>{node}</StrictMode>);
}

/** Replaces whatever is on screen with `unexpected-error`; the details go to the console (R-15). */
function showUnexpectedError(error: unknown): void {
  console.error("Unexpected error", error);
  render(<FailureScreen code="unexpected-error" />);
  unexpectedErrorShown = true;
}

window.addEventListener("error", (event) => {
  // Browsers report a ResizeObserver whose resize settles in the next frame as an error event
  // without an error. It is a notice, not a failure, and the components' observers cause it.
  if (!event.error && event.message.startsWith("ResizeObserver loop")) return;
  showUnexpectedError(event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => showUnexpectedError(event.reason));

/**
 * Asks the browser to keep the data under storage pressure (R-07). Not awaited before rendering,
 * because Firefox asks the user first; a rejection means the data is not persistent.
 */
function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return Promise.resolve(false);
  return navigator.storage.persist().catch(() => false);
}

async function start(): Promise<void> {
  const storagePersisted = requestPersistentStorage();

  let db: Database;
  try {
    // Blocked storage either throws at once (Firefox, Safari) or rejects later (Chromium).
    db = await openDatabase();
  } catch {
    render(<FailureScreen code="storage-unavailable" />);
    return;
  }

  const store = createStore(db, await loadState(db));
  render(
    <ErrorBoundary>
      <StoreContext.Provider value={store}>
        <App storagePersisted={storagePersisted} />
      </StoreContext.Provider>
    </ErrorBoundary>,
  );
}

registerWorker();

// One running copy: a second tab would hold its own state and write over the first one's (R-07).
void navigator.locks.request("financial-copilot", { ifAvailable: true }, async (lock) => {
  if (!lock) {
    render(<FailureScreen code="open-in-another-tab" />);
    return;
  }
  await start();
  // Keep the lock for as long as the page lives.
  await new Promise<never>(() => {});
});
