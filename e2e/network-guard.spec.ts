import { test } from "./support/test";

// FR-061: every end-to-end test runs behind the guard, so a request to another host fails it.
test.fail("a request to another origin fails the test", async ({ page }) => {
  await page.goto("/");
  // Swallow the fetch's own outcome, so only the guard can make this test fail.
  await page.evaluate(() =>
    fetch("https://example.com", { mode: "no-cors" }).then(
      () => undefined,
      () => undefined,
    ),
  );
});

test("opening the app makes no request to another origin", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});
