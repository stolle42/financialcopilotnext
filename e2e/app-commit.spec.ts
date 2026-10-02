import { expect, test } from "./support/test";

// R-18: CI's `deployed` job waits until the production domain serves the pushed commit, which it
// reads from this tag. Vercel builds write the commit id; every other build writes `local`.
test("the page names the commit it was built from", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="app-commit"]')).toHaveAttribute(
    "content",
    /^(local|[0-9a-f]{40})$/,
  );
});
