import { messageFor } from "../src/ui/messages";
import { sharingWarning, suggestButton, suggestCategories } from "./support/categoriser";
import { importWithProfile, saveMyBankProfile } from "./support/import";
import { expect, guardNetwork, test } from "./support/test";

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

test("reviewing an import sends nothing until the user agrees to the data-sharing warning (FR-090, FR-095)", async ({
  page,
}) => {
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
  await expect(suggestButton(page)).toBeEnabled();
  await suggestButton(page).click();
  await expect(sharingWarning(page)).toBeVisible();
  await page.waitForLoadState("networkidle");
});

test("the guard catches Suggest categories when no test answers in the workflow's place", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const check = await guardNetwork(context, page, baseURL);
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
  await suggestCategories(page);

  // The guard aborted the request, so the app reports it as unreachable, and the guard fails.
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    messageFor({ code: "categoriser-unreachable" }),
  );
  await expect(check()).rejects.toThrow();
  await context.close();
});
