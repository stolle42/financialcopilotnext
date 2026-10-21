// The page's side of the service worker (contracts/app-updates.md, the page's side; R-30).

/**
 * Registers sw.js in the production build only, so the dev server runs without a worker. A browser
 * that refuses a worker still runs the app, only not offline.
 */
export function registerWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
}
