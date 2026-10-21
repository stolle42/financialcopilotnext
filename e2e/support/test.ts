import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { AI_PATH } from "../../src/ai/path";

/**
 * Whether the guard must watch requests instead of routing them: in Firefox, a routed context's
 * requests pass the service worker by, so the app would never run from its caches (R-30).
 */
export function guardWatchesOnly(browserName: string, serviceWorkers: string | undefined): boolean {
  return browserName === "firefox" && serviceWorkers === "allow";
}

/**
 * Watches `page` in `context` for a request outside the app's origin, for a request to the AI
 * route that no stand-in answers, and for any Content-Security-Policy violation (FR-061, R-19,
 * R-24). Returns the check that fails the test on any. With `watchOnly`, see `guardWatchesOnly`,
 * such a request still fails the test, but is not stopped.
 */
export async function guardNetwork(
  context: BrowserContext,
  page: Page,
  baseURL: string | undefined,
  { watchOnly = false }: { watchOnly?: boolean } = {},
): Promise<() => Promise<void>> {
  if (!baseURL) throw new Error("playwright.config.ts sets no baseURL");
  const appOrigin = new URL(baseURL).origin;
  const violations: string[] = [];
  const forbidden = (url: URL) => url.origin !== appOrigin || url.pathname === AI_PATH;

  if (watchOnly) {
    context.on("request", (request) => {
      const url = new URL(request.url());
      if (url.protocol.startsWith("http") && forbidden(url)) {
        violations.push(`request to ${request.url()}`);
      }
    });
  } else {
    // Abort instead of letting the request through, so a test never reaches the outside world.
    // data: and blob: URLs never reach a route handler, so they stay allowed. The AI route is on
    // the app's origin, but a local server that holds a key would pass the request on to OpenAI.
    await context.route(forbidden, (route) => {
      violations.push(`request to ${route.request().url()}`);
      return route.abort();
    });
  }

  await page.exposeFunction("reportCspViolation", (violation: string) => {
    violations.push(`CSP violation: ${violation}`);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      const report = (window as unknown as { reportCspViolation(violation: string): void })
        .reportCspViolation;
      report(`${event.violatedDirective} blocked ${event.blockedURI || "an inline resource"}`);
    });
  });

  return async () => {
    // The browser reports a violation a moment after it blocks the request, so a test that ends
    // right after a blocked fetch would otherwise pass before the report arrives.
    if (!page.isClosed()) await page.waitForTimeout(50);
    expect(violations, "the app must not reach outside its own origin (FR-061)").toEqual([]);
  };
}

/**
 * Every spec imports `test` from here, so the network guard runs in all of them: a request outside
 * the app's origin, or a Content-Security-Policy violation, fails the test (FR-061, R-19). A test
 * that opens a context of its own guards it with `guardNetwork`.
 */
export const test = base.extend<{ networkGuard: void; offlineCheck: void }>({
  networkGuard: [
    async ({ context, page, baseURL, browserName, serviceWorkers }, use) => {
      const check = await guardNetwork(context, page, baseURL, {
        watchOnly: guardWatchesOnly(browserName, serviceWorkers),
      });
      await use();
      await check();
    },
    { auto: true },
  ],
  // In the project `offline`, every page the test opens must be controlled by the worker, with the
  // network cut, from the first to the last (SC-018, R-30).
  offlineCheck: [
    async ({ context, page }, use, testInfo) => {
      if (testInfo.project.name !== "offline") return use();

      // The first visit, online: the worker installs and takes control. Then the network goes.
      await page.goto("/");
      await page.waitForFunction(async () => {
        await navigator.serviceWorker.ready;
        return !!navigator.serviceWorker.controller;
      });
      await context.setOffline(true);

      const states: { url: string; controlled: boolean; online: boolean }[] = [];
      await page.exposeFunction("reportOfflineState", (state: (typeof states)[number]) => {
        states.push(state);
      });
      await page.addInitScript(() => {
        const report = () =>
          (
            window as unknown as {
              reportOfflineState(state: {
                url: string;
                controlled: boolean;
                online: boolean;
              }): void;
            }
          ).reportOfflineState({
            url: location.href,
            controlled: !!navigator.serviceWorker?.controller,
            online: navigator.onLine,
          });
        report();
        window.addEventListener("online", report);
        navigator.serviceWorker?.addEventListener("controllerchange", report);
      });

      await use();

      if (!page.isClosed()) {
        states.push(
          await page.evaluate(() => ({
            url: location.href,
            controlled: !!navigator.serviceWorker?.controller,
            online: navigator.onLine,
          })),
        );
      }
      expect(states.length, "the test opened no page").toBeGreaterThan(0);
      expect(
        states.filter((state) => !state.controlled || state.online),
        "every page must be controlled by the worker and offline throughout (SC-018)",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Fixes the page's clock to local noon of `date` (YYYY-MM-DD), so "today" is known in a test. */
export async function setToday(page: Page, date: string): Promise<void> {
  await page.clock.setFixedTime(new Date(`${date}T12:00:00`));
}

/** An amount as the app shows it in the test locale, en-US (FR-060). */
export function euros(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" }).format(cents / 100);
}
