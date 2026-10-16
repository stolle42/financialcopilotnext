import { useSyncExternalStore } from "react";

// A hash router of our own: the build then works from any static host or local file (R-04).

/**
 * Filters of the transaction list that an address can set, as a source of the finance chat does:
 * ids and `YYYY-MM-DD` dates, each optional (FR-110, R-26).
 */
export interface ListFilters {
  category?: string;
  account?: string;
  from?: string;
  to?: string;
}

const FILTER_KEYS = ["category", "account", "from", "to"] as const;

export type Route =
  | { name: "transactions"; filters?: ListFilters }
  | { name: "insights" }
  | { name: "import" }
  | { name: "review" }
  | { name: "profile-new" }
  | { name: "profile"; id: string }
  | { name: "budgets" }
  | { name: "categories" }
  | { name: "accounts" }
  | { name: "backup" }
  | { name: "settings" };

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
  "/settings": { name: "settings" },
};

const home: Route = { name: "transactions" };

/** The filters a query holds, or none when no known part of it has a value. */
function filtersOf(query: string): ListFilters | undefined {
  const params = new URLSearchParams(query);
  const filters: ListFilters = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }
  return Object.keys(filters).length > 0 ? filters : undefined;
}

/**
 * The route of a location hash; an empty or unknown hash opens Transactions (FR-063). On the home
 * path, a query sets the list's filters; on any other path it is ignored.
 */
export function parseRoute(hash: string): Route {
  const address = hash.replace(/^#/, "");
  const queryAt = address.indexOf("?");
  const path = (queryAt < 0 ? address : address.slice(0, queryAt)) || "/";
  if (path === "/" && queryAt >= 0) {
    const filters = filtersOf(address.slice(queryAt + 1));
    if (filters) return { name: "transactions", filters };
  }
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

/** The path of the transaction list with `filters` set, as a source's link opens it (FR-110). */
export function transactionsPath(filters: ListFilters): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value) params.append(key, value);
  }
  const query = params.toString();
  return query ? `/?${query}` : "/";
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
