import { messageFor } from "../src/ui/messages";
import {
  aiFeaturesSwitch,
  chat,
  keyDialog,
  keyField,
  openChat,
  suggestButton,
  suggestCategories,
  TEST_KEY,
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
}) => {
  await turnOnAiFeatures(page);
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
  await expect(suggestButton(page)).toBeEnabled();
  await page.waitForLoadState("networkidle");
});

test("turning AI features on and opening Insights and the finance chat send nothing before a question (FR-100, FR-101)", async ({
  page,
}) => {
  await turnOnAiFeatures(page);
  await openChat(page);
  await expect(chat(page).getByRole("textbox", { name: "Your question" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await page.waitForLoadState("networkidle");
});

test("the guard catches Suggest categories asking api.openai.com when no test answers in OpenAI's place (R-24, R-31)", async ({
  browser,
  baseURL,
}) => {
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

test("the guard catches the key check asking api.openai.com when no test answers in OpenAI's place (FR-127, R-31)", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const check = await guardNetwork(context, page, baseURL);
  await page.goto("/#/settings");
  await aiFeaturesSwitch(page).click();
  await keyField(page).fill(TEST_KEY);
  await keyDialog(page).getByRole("button", { name: "Turn on" }).click();

  // The guard aborted the check, so the app reports it as unreachable and stores nothing.
  await expect(keyDialog(page)).toContainText(messageFor({ code: "ai-key-check-unreachable" }));
  await expect(check()).rejects.toThrow();
  await context.close();
});
