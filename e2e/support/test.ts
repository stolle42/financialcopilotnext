import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { AI_PATH } from "../../src/ai/path";

/**
 * Watches `page` in `context` for a request outside the app's origin, for a request to the AI
 * route that no stand-in answers, and for any Content-Security-Policy violation (FR-061, R-19,
 * R-24). Returns the check that fails the test on any.
 */
export async function guardNetwork(
  context: BrowserContext,
  page: Page,
  baseURL: string | undefined,
): Promise<() => Promise<void>> {
  if (!baseURL) throw new Error("playwright.config.ts sets no baseURL");
  const appOrigin = new URL(baseURL).origin;
  const violations: string[] = [];

  // Abort instead of letting the request through, so a test never reaches the outside world.
  // data: and blob: URLs never reach a route handler, so they stay allowed. The AI route is on the
  // app's origin, but a local server that holds a key would pass the request on to OpenAI.
  await context.route(
    (url) => url.origin !== appOrigin || url.pathname === AI_PATH,
    (route) => {
      violations.push(`request to ${route.request().url()}`);
      return route.abort();
    },
  );

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
export const test = base.extend<{ networkGuard: void }>({
  networkGuard: [
    async ({ context, page, baseURL }, use) => {
      const check = await guardNetwork(context, page, baseURL);
      await use();
      await check();
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
