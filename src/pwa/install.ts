import { useSyncExternalStore } from "react";

// Install app (contracts/app-updates.md, the page's side; FR-122). Chrome and Edge fire
// `beforeinstallprompt` while they would offer to install the app; Firefox and an installed app
// never do.

/** The part of `beforeinstallprompt` the page uses; the DOM types do not hold it. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
}

export interface InstallWatch {
  /** Whether an event is kept, so the browser's question can be asked. */
  installable(): boolean;
  /** Asks the browser's question, once for each event kept. */
  install(): Promise<void>;
  /** Calls `listener` each time installable() changes; gives a function that stops it. */
  subscribe(listener: () => void): () => void;
}

/** Keeps the install offer that `target`, the window, fires, in place of the browser's own. */
export function watchInstall(target: EventTarget): InstallWatch {
  let kept: InstallPromptEvent | undefined;
  const listeners = new Set<() => void>();
  const keep = (event: InstallPromptEvent | undefined) => {
    kept = event;
    for (const listener of listeners) listener();
  };

  target.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    keep(event as InstallPromptEvent);
  });
  target.addEventListener("appinstalled", () => keep(undefined));

  return {
    installable: () => kept !== undefined,
    async install() {
      const event = kept;
      if (!event) return;
      // An event's prompt() works once, so it is forgotten before it is asked.
      keep(undefined);
      await event.prompt();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * The window's install offer. src/main.tsx imports this module first, so no event fires before
 * it listens.
 */
export const appInstall: InstallWatch | undefined =
  typeof window === "undefined" ? undefined : watchInstall(window);

const never = () => () => {};

/** Whether the app can be installed now, for Install app (FR-122). */
export function useInstallable(): boolean {
  return useSyncExternalStore(
    appInstall?.subscribe ?? never,
    () => appInstall?.installable() ?? false,
  );
}
