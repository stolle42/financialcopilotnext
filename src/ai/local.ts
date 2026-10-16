// AI features only where the local route can pass them on to OpenAI: in the app served from the
// user's own computer (FR-106, R-24). A hosted copy has no route, and no request may carry data to
// its server either.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Whether `hostname`, the page's own by default, is the user's own computer. */
export function servedLocally(hostname: string = globalThis.location?.hostname ?? ""): boolean {
  return LOCAL_HOSTS.has(hostname);
}
