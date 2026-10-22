import type { Page } from "@playwright/test";
import type { Settings } from "../../src/domain/types";
// A namespace import, so the spec loads even before the catalogue words a new message.
import * as catalogue from "../../src/ui/messages";
import { putRecord, storedRecord } from "../support/app";
import {
  aiFeaturesSwitch,
  keyDialog,
  keyField,
  MASKED_TEST_KEY,
  standInKeyCheck,
  TEST_KEY,
  turnOnAiFeatures,
} from "../support/ai";
import { expect, test } from "../support/test";

// contracts/ui.md, settings; FR-084, FR-095, FR-061, FR-126 – FR-130. The network guard also fails
// these tests on any request outside the app's origin that no stand-in answers, so turning AI
// features on is proven to send only the key check.

const main = (page: Page) => page.getByRole("main");
const storedSettings = (page: Page) => storedRecord<Settings>(page, "settings", "settings");
const storedKey = (page: Page) => storedRecord<string>(page, "settings", "openaiKey");
const turnOnButton = (page: Page) =>
  keyDialog(page).getByRole("button", { name: /^(Turn on|Checking key…)$/ });
const removeKeyButton = (page: Page) =>
  main(page).getByRole("button", { name: "Remove key", exact: true });
const modelGroup = (page: Page) => main(page).getByRole("radiogroup", { name: "Model" });

/** A model's radio button, named by its id with its hint after it. */
const startsWithModel = (id: string) => new RegExp(`^${id.replaceAll(".", "\\.")}(?![\\w.-])`);
const model = (page: Page, id: string) =>
  modelGroup(page).getByRole("radio", { name: startsWithModel(id) });

/** The models Settings offers, in order, with their hints (FR-129). */
const MODELS = [
  { id: "gpt-5.4-mini", hint: "fastest" },
  { id: "gpt-5.6-luna", hint: "balanced" },
  { id: "gpt-6.1-sol", hint: "most thorough, slowest" },
];

/** Opens Settings and the dialog of turning AI features on. */
async function openKeyDialog(page: Page) {
  await page.goto("/#/settings");
  await aiFeaturesSwitch(page).click();
  await expect(keyDialog(page)).toBeVisible();
}

/** Expects AI features off with no key stored, on the screen and in storage. */
async function expectOffWithoutKey(page: Page) {
  await expect(aiFeaturesSwitch(page)).not.toBeChecked();
  expect(await storedSettings(page)).not.toHaveProperty("aiFeatures");
  expect(await storedKey(page)).toBeUndefined();
}

test("is the last entry in the sidebar (FR-084)", async ({ page }) => {
  await page.goto("/");
  const links = page.getByRole("navigation", { name: "Screens" }).getByRole("link");
  await expect(links).toHaveText([
    "Transactions",
    "Categories",
    "Accounts",
    "Budgets",
    "Backup",
    "Insights",
    "Settings",
  ]);
  await links.last().click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(main(page).getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
});

test("without a worker, shows no update section (FR-124)", async ({ page }) => {
  await page.goto("/#/settings");
  await expect(main(page).getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(main(page)).not.toContainText(/is available/);
  await expect(main(page).getByRole("button", { name: "Update", exact: true })).toHaveCount(0);
});

test.describe("AI features (FR-095, FR-126, FR-127)", () => {
  test("start off, and the screen says what they do, where data goes and who pays", async ({
    page,
  }) => {
    await page.goto("/#/settings");
    await expect(aiFeaturesSwitch(page)).toBeEnabled();
    await expect(aiFeaturesSwitch(page)).not.toBeChecked();
    await expect(main(page)).toContainText(catalogue.aiFeaturesDescription);
    await expect(main(page)).toContainText("Suggest categories");
    await expect(main(page)).toContainText("finance chat");
    await expect(main(page)).toContainText("your own OpenAI account");
    await expect(main(page)).not.toContainText(/n8n|Anthropic/);
    await expect(main(page)).not.toContainText("Your key:");
    await expect(removeKeyButton(page)).toHaveCount(0);
    await expectOffWithoutKey(page);
  });

  test("turning them on opens one dialog: the warning, the lines about the key, the link and an empty key field", async ({
    page,
  }) => {
    await openKeyDialog(page);

    await expect(keyDialog(page)).toContainText(catalogue.sharingWarning);
    await expect(keyDialog(page)).toContainText(catalogue.aiKey.about);
    await expect(keyDialog(page)).not.toContainText(/n8n|Anthropic/);
    const link = keyDialog(page).getByRole("link", { name: "Create an API key at OpenAI" });
    await expect(link).toHaveAttribute("href", "https://platform.openai.com/api-keys");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(keyField(page)).toHaveAttribute("type", "password");
    await expect(keyField(page)).toHaveAttribute("autocomplete", "off");
    await expect(keyField(page)).toHaveAttribute("spellcheck", "false");
    await expect(keyField(page)).toHaveValue("");
    await expect(keyDialog(page).getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  test("Turn on is unavailable while the field is empty or holds only spaces", async ({ page }) => {
    await openKeyDialog(page);

    await expect(turnOnButton(page)).toBeDisabled();
    await keyField(page).fill("   ");
    await expect(turnOnButton(page)).toBeDisabled();
    await keyField(page).fill(TEST_KEY);
    await expect(turnOnButton(page)).toBeEnabled();
    await keyField(page).fill("");
    await expect(turnOnButton(page)).toBeDisabled();
  });

  test("Cancel closes the dialog, leaves them off and sends nothing", async ({ page }) => {
    const check = await standInKeyCheck(page);
    await openKeyDialog(page);
    await keyField(page).fill(TEST_KEY);

    await keyDialog(page).getByRole("button", { name: "Cancel" }).click();

    await expect(keyDialog(page)).toBeHidden();
    await expectOffWithoutKey(page);
    expect(check.requests).toHaveLength(0);
  });

  test("Escape closes the dialog and leaves them off", async ({ page }) => {
    await openKeyDialog(page);

    await page.keyboard.press("Escape");

    await expect(keyDialog(page)).toBeHidden();
    await expectOffWithoutKey(page);
  });

  test("Turn on reads Checking key… with the field read-only, then stores the trimmed key and turns them on", async ({
    page,
  }) => {
    const check = await standInKeyCheck(page, 200);
    check.hold();
    await openKeyDialog(page);
    await keyField(page).fill(`  ${TEST_KEY}  `);

    await turnOnButton(page).click();

    await expect(turnOnButton(page)).toHaveText("Checking key…");
    await expect(turnOnButton(page)).toBeDisabled();
    await expect(keyField(page)).not.toBeEditable();
    await expect.poll(() => check.requests.length).toBe(1);
    check.release();

    await expect(keyDialog(page)).toBeHidden();
    await expect(aiFeaturesSwitch(page)).toBeChecked();
    await expect.poll(() => storedKey(page)).toBe(TEST_KEY);
    expect(await storedSettings(page)).toMatchObject({ aiFeatures: true });
    expect(check.requests[0]!.headers.authorization).toBe(`Bearer ${TEST_KEY}`);
  });

  test("shows the stored key only masked, also after a reload, with Remove key", async ({
    page,
  }) => {
    await turnOnAiFeatures(page);
    await page.goto("/#/settings");

    await expect(main(page)).toContainText(catalogue.aiKey.stored(MASKED_TEST_KEY));
    await expect(removeKeyButton(page)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(TEST_KEY);
    await expect(page.locator(`input[value="${TEST_KEY}"]`)).toHaveCount(0);

    await page.reload();
    await expect(aiFeaturesSwitch(page)).toBeChecked();
    await expect(main(page)).toContainText(catalogue.aiKey.stored(MASKED_TEST_KEY));
    await expect(page.locator("body")).not.toContainText(TEST_KEY);
  });

  test("a key OpenAI does not accept shows its message, keeps what was entered, and stores nothing", async ({
    page,
  }) => {
    await standInKeyCheck(page, 401);
    await openKeyDialog(page);
    await keyField(page).fill(TEST_KEY);

    await turnOnButton(page).click();

    await expect(keyDialog(page)).toContainText(
      "OpenAI didn't accept this key. Check that you copied all of it.",
    );
    await expect(keyField(page)).toHaveValue(TEST_KEY);
    await expect(keyField(page)).toBeEditable();
    await expect(turnOnButton(page)).toHaveText("Turn on");
    await keyDialog(page).getByRole("button", { name: "Cancel" }).click();
    await expectOffWithoutKey(page);
  });

  for (const answer of [500, 429, "unreachable"] as const) {
    test(`a key check answered with ${answer} says OpenAI could not be reached, and stores nothing`, async ({
      page,
    }) => {
      await standInKeyCheck(page, answer);
      await openKeyDialog(page);
      await keyField(page).fill(TEST_KEY);

      await turnOnButton(page).click();

      await expect(keyDialog(page)).toContainText(
        catalogue.messageFor({ code: "ai-key-check-unreachable" }),
      );
      await expect(keyField(page)).toHaveValue(TEST_KEY);
      await page.keyboard.press("Escape");
      await expectOffWithoutKey(page);
    });
  }

  test("a key answered with a 403, which may not list models, turns them on", async ({ page }) => {
    await standInKeyCheck(page, 403);
    await openKeyDialog(page);
    await keyField(page).fill(TEST_KEY);

    await turnOnButton(page).click();

    await expect(keyDialog(page)).toBeHidden();
    await expect(aiFeaturesSwitch(page)).toBeChecked();
  });

  test("Cancel during the check stops it, sends no second request and stores nothing", async ({
    page,
  }) => {
    const check = await standInKeyCheck(page, 200);
    check.hold();
    await openKeyDialog(page);
    await keyField(page).fill(TEST_KEY);
    await turnOnButton(page).click();
    await expect(turnOnButton(page)).toHaveText("Checking key…");

    await keyDialog(page).getByRole("button", { name: "Cancel" }).click();
    check.release();

    await expect(keyDialog(page)).toBeHidden();
    // Long enough for a stored key or a second check to show, had the check gone on.
    await page.waitForTimeout(200);
    expect(check.requests).toHaveLength(1);
    await expectOffWithoutKey(page);
  });

  test("turning them off takes effect at once, without a dialog, and keeps the key", async ({
    page,
  }) => {
    await turnOnAiFeatures(page);
    await page.goto("/#/settings");

    await aiFeaturesSwitch(page).click();

    await expect(aiFeaturesSwitch(page)).not.toBeChecked();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect.poll(() => storedSettings(page)).not.toHaveProperty("aiFeatures");
    expect(await storedKey(page)).toBe(TEST_KEY);
    await expect(main(page)).toContainText(catalogue.aiKey.stored(MASKED_TEST_KEY));
    await expect(removeKeyButton(page)).toBeVisible();
    await page.reload();
    await expect(aiFeaturesSwitch(page)).not.toBeChecked();
  });

  test("turning them on again with a key stored shows the masked key in place of the field, and checks it", async ({
    page,
  }) => {
    await turnOnAiFeatures(page);
    await page.goto("/#/settings");
    await aiFeaturesSwitch(page).click();
    await expect(aiFeaturesSwitch(page)).not.toBeChecked();
    const check = await standInKeyCheck(page, 200);

    await aiFeaturesSwitch(page).click();

    await expect(keyDialog(page)).toContainText(catalogue.aiKey.stored(MASKED_TEST_KEY));
    await expect(keyField(page)).toHaveCount(0);
    await turnOnButton(page).click();
    await expect(keyDialog(page)).toBeHidden();
    await expect(aiFeaturesSwitch(page)).toBeChecked();
    expect(check.requests.map((request) => request.headers.authorization)).toEqual([
      `Bearer ${TEST_KEY}`,
    ]);
  });

  test("Remove key asks first; Cancel keeps the key, Remove key deletes it and turns them off", async ({
    page,
  }) => {
    await turnOnAiFeatures(page);
    await page.goto("/#/settings");

    await removeKeyButton(page).click();
    const confirmation = page.getByRole("alertdialog", { name: "Remove key?" });
    await expect(confirmation).toContainText(catalogue.aiKey.removeWarning);
    await confirmation.getByRole("button", { name: "Cancel" }).click();
    await expect(confirmation).toBeHidden();
    await expect(aiFeaturesSwitch(page)).toBeChecked();
    expect(await storedKey(page)).toBe(TEST_KEY);

    await removeKeyButton(page).click();
    await confirmation.getByRole("button", { name: "Remove key" }).click();

    await expect(confirmation).toBeHidden();
    await expect(aiFeaturesSwitch(page)).not.toBeChecked();
    await expect(main(page)).not.toContainText("Your key:");
    await expect(removeKeyButton(page)).toHaveCount(0);
    await expect.poll(() => storedKey(page)).toBeUndefined();
    expect(await storedSettings(page)).not.toHaveProperty("aiFeatures");
  });

  test("no other screen shows a notice while they are on", async ({ page }) => {
    await turnOnAiFeatures(page);

    await page.goto("/#/");
    await expect(main(page).getByRole("heading", { name: "Transactions" })).toBeVisible();
    await expect(page.getByText("OpenAI")).toHaveCount(0);
  });
});

test.describe("Model (FR-129, FR-130)", () => {
  test("lists the models in order with their hints, the default checked, also with AI features off", async ({
    page,
  }) => {
    await page.goto("/#/settings");

    await expect(aiFeaturesSwitch(page)).not.toBeChecked();
    const radios = modelGroup(page).getByRole("radio");
    await expect(radios).toHaveCount(MODELS.length);
    for (const [index, { id, hint }] of MODELS.entries()) {
      await expect(radios.nth(index)).toHaveAccessibleName(startsWithModel(id));
      await expect(radios.nth(index)).toBeEnabled();
      await expect(modelGroup(page)).toContainText(hint);
    }
    await expect(model(page, "gpt-5.4-mini")).toBeChecked();
    await expect(main(page)).not.toContainText("no longer offered");
  });

  test("selecting a model saves it at once, sends nothing, and keeps it across a reload", async ({
    page,
  }) => {
    await page.goto("/#/settings");

    await model(page, "gpt-6.1-sol").check();

    await expect(model(page, "gpt-6.1-sol")).toBeChecked();
    await expect(model(page, "gpt-5.4-mini")).not.toBeChecked();
    await expect.poll(async () => (await storedSettings(page))?.model).toBe("gpt-6.1-sol");
    await page.reload();
    await expect(model(page, "gpt-6.1-sol")).toBeChecked();

    await model(page, "gpt-5.4-mini").check();
    await expect.poll(async () => (await storedSettings(page))?.model).toBe("gpt-5.4-mini");
  });

  test("a stored model no longer offered checks the default with a note, until the user selects one", async ({
    page,
  }) => {
    await page.goto("/#/settings");
    await expect(modelGroup(page)).toBeVisible();
    await putRecord(page, "settings", "settings", {
      ...(await storedSettings(page)),
      model: "gpt-4o",
    });
    await page.reload();

    await expect(model(page, "gpt-5.4-mini")).toBeChecked();
    const note = catalogue.modelChoice.noLongerOffered("gpt-5.4-mini");
    await expect(main(page)).toContainText(note);
    expect((await storedSettings(page))?.model).toBe("gpt-4o");

    await model(page, "gpt-5.6-luna").check();
    await expect(main(page)).not.toContainText(note);
    await expect.poll(async () => (await storedSettings(page))?.model).toBe("gpt-5.6-luna");
  });
});
