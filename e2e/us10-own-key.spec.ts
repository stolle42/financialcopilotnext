import type { Page } from "@playwright/test";
import type { Settings } from "../src/domain/types";
// A namespace import, so the spec loads even before the catalogue words a new message.
import * as catalogue from "../src/ui/messages";
import { putRecord, storedRecord } from "./support/app";
import {
  aiFeaturesSwitch,
  answer,
  askInChat,
  chat,
  conversation,
  keyDialog,
  keyField,
  MASKED_TEST_KEY,
  openChat,
  RESPONSES_URL,
  standInCategoriser,
  standInChat,
  standInKeyCheck,
  suggestCategories,
  TEST_KEY,
  turnOnAiFeatures,
} from "./support/ai";
import { backupText, restoreBackup, saveBackup, storedData } from "./support/backup";
import { importWithProfile, saveMyBankProfile } from "./support/import";
import { expect, guardNetwork, test } from "./support/test";

// The journey of User Story 10: AI features with the user's own OpenAI key, and the model they
// choose (FR-126 – FR-130, SC-021; quickstart.md, US10). A stand-in answers the key check in
// OpenAI's place, and the network guard fails a test on any other request outside the app's origin.

const main = (page: Page) => page.getByRole("main");
const storedSettings = (page: Page) => storedRecord<Settings>(page, "settings", "settings");
const storedKey = (page: Page) => storedRecord<string>(page, "settings", "openaiKey");
const turnOnButton = (page: Page) =>
  keyDialog(page).getByRole("button", { name: /^(Turn on|Checking key…)$/ });
const modelGroup = (page: Page) => main(page).getByRole("radiogroup", { name: "Model" });
const model = (page: Page, id: string) =>
  modelGroup(page).getByRole("radio", {
    name: new RegExp(`^${id.replaceAll(".", "\\.")}(?![\\w.-])`),
  });

/** True when `text` holds the key or any part of it the app ever shows. */
const holdsKey = (text: string) => text.includes(TEST_KEY) || text.includes(TEST_KEY.slice(-4));

async function openKeyDialog(page: Page) {
  await page.goto("/#/settings");
  await aiFeaturesSwitch(page).click();
  await expect(keyDialog(page)).toBeVisible();
}

test("1. turning AI features on shows one dialog with the warning, the key's cost, the link and an empty field", async ({
  page,
}) => {
  await openKeyDialog(page);

  await expect(keyDialog(page)).toContainText(catalogue.sharingWarning);
  await expect(keyDialog(page)).toContainText(catalogue.aiKey.about);
  await expect(
    keyDialog(page).getByRole("link", { name: "Create an API key at OpenAI" }),
  ).toHaveAttribute("href", "https://platform.openai.com/api-keys");
  await expect(keyField(page)).toHaveValue("");
  await expect(turnOnButton(page)).toBeDisabled();
  await keyField(page).fill(TEST_KEY);
  await expect(turnOnButton(page)).toBeEnabled();
});

test("2. a key OpenAI does not accept shows its message within 10 seconds, and nothing is stored (SC-021)", async ({
  page,
}) => {
  const check = await standInKeyCheck(page, 401);
  await openKeyDialog(page);
  await keyField(page).fill(TEST_KEY);

  const started = Date.now();
  await turnOnButton(page).click();
  await expect(keyDialog(page)).toContainText(
    "OpenAI didn't accept this key. Check that you copied all of it.",
    { timeout: 10_000 },
  );
  expect(Date.now() - started).toBeLessThan(10_000);

  // The check sends the key and nothing else (FR-127, contracts/ai.md, key check).
  expect(check.requests).toHaveLength(1);
  const [sent] = check.requests;
  expect(sent!.method).toBe("GET");
  expect(sent!.body).toBeNull();
  expect(sent!.headers.authorization).toBe(`Bearer ${TEST_KEY}`);
  expect(sent!.headers).not.toHaveProperty("cookie");
  expect(sent!.headers).not.toHaveProperty("content-type");

  await keyDialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(aiFeaturesSwitch(page)).not.toBeChecked();
  expect(await storedKey(page)).toBeUndefined();
  expect(await storedSettings(page)).not.toHaveProperty("aiFeatures");
});

test("3. a key OpenAI accepts turns AI features on, showing the masked key, Remove key and gpt-5.4-mini", async ({
  page,
}) => {
  await standInKeyCheck(page, 200);
  await openKeyDialog(page);
  await keyField(page).fill(TEST_KEY);

  await turnOnButton(page).click();

  await expect(keyDialog(page)).toBeHidden();
  await expect(aiFeaturesSwitch(page)).toBeChecked();
  await expect(main(page)).toContainText(`Your key: ${MASKED_TEST_KEY}`);
  await expect(main(page)).not.toContainText(TEST_KEY);
  await expect(main(page).getByRole("button", { name: "Remove key", exact: true })).toBeVisible();
  await expect(model(page, "gpt-5.4-mini")).toBeChecked();
});

test("4. Remove key, confirmed, deletes the key and turns AI features off", async ({ page }) => {
  await turnOnAiFeatures(page);
  await page.goto("/#/settings");

  await main(page).getByRole("button", { name: "Remove key", exact: true }).click();
  await page
    .getByRole("alertdialog", { name: "Remove key?" })
    .getByRole("button", { name: "Remove key" })
    .click();

  await expect(aiFeaturesSwitch(page)).not.toBeChecked();
  await expect(main(page)).not.toContainText("Your key:");
  await expect.poll(() => storedKey(page)).toBeUndefined();
});

test("5. after choosing gpt-6.1-sol, the chat says so, and the next question and the next request for suggestions name it (FR-129)", async ({
  page,
}) => {
  const categoriser = await standInCategoriser(page);
  const chatStandIn = await standInChat(page, answer("Mostly groceries."));
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
  await turnOnAiFeatures(page);
  await openChat(page);
  await expect(chat(page).getByText(/^Answers by /)).toHaveText("Answers by gpt-5.4-mini");
  await page.keyboard.press("Escape");

  await page.goto("/#/settings");
  await model(page, "gpt-6.1-sol").check();
  await expect.poll(async () => (await storedSettings(page))?.model).toBe("gpt-6.1-sol");

  await openChat(page);
  await expect(chat(page).getByText(/^Answers by /)).toHaveText("Answers by gpt-6.1-sol");
  await askInChat(page, "Where does my money go?");
  await expect(conversation(page)).toHaveCount(2);
  await page.keyboard.press("Escape");
  await page.goto("/#/import");
  await suggestCategories(page);
  await expect(page.getByRole("region", { name: "Suggestions" }).getByRole("status")).toBeVisible();

  expect(chatStandIn.sent.map((sent) => sent.posted.model)).toEqual(["gpt-6.1-sol"]);
  expect(categoriser.sent.map((sent) => sent.posted.model)).toEqual(["gpt-6.1-sol"]);
});

test("6. a backup holds the model and AI features on but no part of the key, and restores in a fresh install with the switch off", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/#/settings");
  await model(page, "gpt-5.6-luna").check();
  await turnOnAiFeatures(page);

  const backup = await saveBackup(page);

  expect(backup.json.data.settings).toMatchObject({ aiFeatures: true, model: "gpt-5.6-luna" });
  expect(holdsKey(backup.text)).toBe(false);

  const fresh = await browser.newContext({ baseURL, locale: "en-US" });
  const freshPage = await fresh.newPage();
  const checkNetwork = await guardNetwork(fresh, freshPage, baseURL);
  await freshPage.goto("/");
  await restoreBackup(freshPage, backup.text, backup.fileName);

  await freshPage.goto("/#/settings");
  await expect(model(freshPage, "gpt-5.6-luna")).toBeChecked();
  await expect(aiFeaturesSwitch(freshPage)).not.toBeChecked();
  expect(await storedKey(freshPage)).toBeUndefined();
  // Turning them on there asks for a key.
  await aiFeaturesSwitch(freshPage).click();
  await expect(keyField(freshPage)).toBeVisible();
  await expect(keyField(freshPage)).toHaveValue("");
  await checkNetwork();
  await fresh.close();
});

test("7. AI features on in v1.5, with no key, show the switch off, and turning it on asks for a key", async ({
  page,
}) => {
  await page.goto("/#/settings");
  await expect(aiFeaturesSwitch(page)).toBeVisible();
  await putRecord(page, "settings", "settings", {
    ...(await storedSettings(page)),
    aiFeatures: true,
  });
  await page.reload();

  await expect(aiFeaturesSwitch(page)).not.toBeChecked();
  await aiFeaturesSwitch(page).click();
  await expect(keyField(page)).toBeVisible();
  await expect(keyField(page)).toHaveValue("");
});

test("8. a backup whose model the app no longer lists uses gpt-5.4-mini, and Settings says so", async ({
  page,
}) => {
  await page.goto("/");
  const data = await storedData(page);
  const text = backupText({ ...data, settings: { ...data.settings, model: "gpt-4o" } });

  await restoreBackup(page, text, "old-model.json");

  await page.goto("/#/settings");
  await expect(model(page, "gpt-5.4-mini")).toBeChecked();
  await expect(main(page)).toContainText(
    "The model you chose is no longer offered; now using gpt-5.4-mini.",
  );
});

test("9. the chat and Suggest categories ask api.openai.com with the key and the model in use, and only they carry the key (FR-128)", async ({
  page,
  baseURL,
}) => {
  const appOrigin = new URL(baseURL!).origin;
  const requests: { url: string; method: string; headers: Record<string, string> }[] = [];
  page.on("request", (request) => {
    void request
      .allHeaders()
      .then((headers) => requests.push({ url: request.url(), method: request.method(), headers }));
  });
  const categoriser = await standInCategoriser(page);
  const chatStandIn = await standInChat(page, answer("Mostly groceries."));
  await saveMyBankProfile(page);
  await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
  await page.goto("/#/settings");
  await model(page, "gpt-5.6-luna").check();
  await turnOnAiFeatures(page);
  const fromHere = requests.length;

  await page.goto("/#/import");
  await suggestCategories(page);
  await expect(page.getByRole("region", { name: "Suggestions" }).getByRole("status")).toBeVisible();
  await openChat(page);
  await askInChat(page, "Where does my money go?");
  await expect(conversation(page)).toHaveCount(2);

  for (const standIn of [categoriser, chatStandIn]) {
    expect(standIn.sent).toHaveLength(1);
    expect(standIn.sent[0]!.headers.authorization).toBe(`Bearer ${TEST_KEY}`);
    expect(standIn.sent[0]!.headers).not.toHaveProperty("cookie");
    expect(standIn.sent[0]!.posted.model).toBe("gpt-5.6-luna");
  }
  // Only the requests to OpenAI carry the key, and the app's own origin receives nothing for an
  // AI feature: no request to it while the two features asked.
  const sentByFeatures = requests.slice(fromHere);
  const carrying = requests.filter((r) => JSON.stringify(r.headers).includes(TEST_KEY));
  expect(carrying.length).toBeGreaterThanOrEqual(2);
  for (const request of carrying) expect(request.url).toMatch(/^https:\/\/api\.openai\.com\//);
  expect(sentByFeatures.filter((r) => r.url.startsWith(appOrigin) && r.method !== "GET")).toEqual(
    [],
  );
  expect(sentByFeatures.filter((r) => r.url === RESPONSES_URL && r.method === "POST")).toHaveLength(
    2,
  );
});
