import { messageFor } from "../src/ui/messages";
import {
  chat,
  LOCAL_ONLY,
  onHostedCopy,
  openChat,
  suggestButton,
  suggestCategories,
  turnOnAiFeatures,
} from "./support/ai";
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

test("turning AI features on and reviewing an import send nothing until Suggest categories (FR-090, FR-095)", async ({
  page,
  baseURL,
}) => {
  test.skip(onHostedCopy(baseURL), LOCAL_ONLY);
  await turnOnAiFeatures(page);
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
  await expect(suggestButton(page)).toBeEnabled();
  await page.waitForLoadState("networkidle");
});

test("turning AI features on and opening Insights and the finance chat send nothing before a question (FR-100, FR-101)", async ({
  page,
  baseURL,
}) => {
  test.skip(onHostedCopy(baseURL), LOCAL_ONLY);
  await turnOnAiFeatures(page);
  await openChat(page);
  await expect(chat(page).getByRole("textbox", { name: "Your question" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await page.waitForLoadState("networkidle");
});

test("the guard catches Suggest categories when no test answers in OpenAI's place, though the route is on the app's origin (R-24)", async ({
  browser,
  baseURL,
}) => {
  test.skip(onHostedCopy(baseURL), LOCAL_ONLY);
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const check = await guardNetwork(context, page, baseURL);
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
  await turnOnAiFeatures(page);
  await suggestCategories(page);

  // The guard aborted the request, so the app reports it as unreachable, and the guard fails.
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    messageFor({ code: "ai-unreachable" }),
  );
  await expect(check()).rejects.toThrow();
  await context.close();
});
