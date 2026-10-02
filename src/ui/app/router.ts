import { useSyncExternalStore } from "react";

// A hash router of our own: the build then works from any static host or local file (R-04).

export type Route =
  | { name: "transactions" }
  | { name: "insights" }
  | { name: "import" }
  | { name: "review" }
  | { name: "profile-new" }
  | { name: "profile"; id: string }
  | { name: "budgets" }
  | { name: "categories" }
  | { name: "accounts" }
  | { name: "backup" };

const fixedRoutes: Record<string, Route> = {
  "/": { name: "transactions" },
  "/insights": { name: "insights" },
  "/import": { name: "import" },
  "/import/review": { name: "review" },
  "/import/profiles/new": { name: "profile-new" },
  "/budgets": { name: "budgets" },
  "/categories": { name: "categories" },
  "/accounts": { name: "accounts" },
  "/backup": { name: "backup" },
};

const home: Route = { name: "transactions" };

/** The route of a location hash; an empty or unknown hash opens Transactions (FR-063). */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  const fixed = fixedRoutes[path];
  if (fixed) return fixed;

  const profile = /^\/import\/profiles\/([^/]+)$/.exec(path);
  if (profile?.[1]) {
    try {
      return { name: "profile", id: decodeURIComponent(profile[1]) };
    } catch {
      return home; // A malformed escape, such as a hand-edited URL.
    }
  }
  return home;
}

/** Opens `path`, such as `/insights`, as a new history entry. */
export function navigate(path: string): void {
  window.location.hash = path;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** The current route, updated on every hash change. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}
