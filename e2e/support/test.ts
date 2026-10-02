import { test as base, expect, type Page } from "@playwright/test";

/**
 * Every spec imports `test` from here, so the network guard runs in all of them: a request outside
 * the app's origin, or a Content-Security-Policy violation, fails the test (FR-061, R-19).
 */
export const test = base.extend<{ networkGuard: void }>({
  networkGuard: [
    async ({ context, page, baseURL }, use) => {
      if (!baseURL) throw new Error("playwright.config.ts sets no baseURL");
      const appOrigin = new URL(baseURL).origin;
      const violations: string[] = [];

      // Abort instead of letting the request through, so a test never reaches the outside world.
      // data: and blob: URLs never reach a route handler, so they stay allowed.
      await context.route(
        (url) => url.origin !== appOrigin,
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

      await use();

      expect(violations, "the app must not reach outside its own origin (FR-061)").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Fixes the page's clock to local noon of `date` (YYYY-MM-DD), so "today" is known in a test. */
export async function setToday(page: Page, date: string): Promise<void> {
  await page.clock.setFixedTime(new Date(`${date}T12:00:00`));
}
