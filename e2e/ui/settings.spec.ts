import type { Page } from "@playwright/test";
import type { Settings } from "../../src/domain/types";
// A namespace import, so the spec loads even before the catalogue words a new message.
import * as catalogue from "../../src/ui/messages";
import { storedRecord } from "../support/app";
import {
  aiFeaturesSwitch,
  chat,
  LOCAL_ONLY,
  onHostedCopy,
  openChat,
  sharingWarning,
  suggestButton,
} from "../support/ai";
import { importWithProfile, saveMyBankProfile } from "../support/import";
import { expect, test } from "../support/test";

// contracts/ui.md, settings; FR-084, FR-095, FR-061. The network guard also fails these tests on
// any request outside the app's origin, so turning AI features on is proven to send nothing.

const main = (page: Page) => page.getByRole("main");
const storedSettings = (page: Page) => storedRecord<Settings>(page, "settings", "settings");

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

test.describe("AI features (FR-095)", () => {
  test("start off, and the screen says what they do and where data goes", async ({ page }) => {
    await page.goto("/#/settings");
    await expect(aiFeaturesSwitch(page)).not.toBeChecked();
    await expect(main(page)).toContainText("Suggest categories");
    await expect(main(page)).toContainText("finance chat");
    await expect(main(page)).toContainText("OpenAI");
    await expect(main(page)).not.toContainText(/n8n|Anthropic/);
    expect(await storedSettings(page)).not.toHaveProperty("aiFeatures");
  });

  test.describe("turning them on", () => {
    test.skip(({ baseURL }) => onHostedCopy(baseURL), LOCAL_ONLY);

    test("turning them on warns what is shared and with whom; Cancel leaves them off", async ({
      page,
    }) => {
      await page.goto("/#/settings");

      await aiFeaturesSwitch(page).click();

      await expect(sharingWarning(page)).toContainText(catalogue.sharingWarning);
      await expect(sharingWarning(page)).toContainText("OpenAI");
      await expect(sharingWarning(page)).toContainText("finance chat");
      await expect(sharingWarning(page)).not.toContainText(/n8n|Anthropic/);
      await sharingWarning(page).getByRole("button", { name: "Cancel" }).click();
      await expect(sharingWarning(page)).toBeHidden();
      await expect(aiFeaturesSwitch(page)).not.toBeChecked();
      expect(await storedSettings(page)).not.toHaveProperty("aiFeatures");
    });

    test("Escape closes the warning and leaves them off", async ({ page }) => {
      await page.goto("/#/settings");
      await aiFeaturesSwitch(page).click();
      await expect(sharingWarning(page)).toBeVisible();

      await page.keyboard.press("Escape");

      await expect(sharingWarning(page)).toBeHidden();
      await expect(aiFeaturesSwitch(page)).not.toBeChecked();
      expect(await storedSettings(page)).not.toHaveProperty("aiFeatures");
    });

    test("Turn on saves them on, also after a reload, and sends nothing", async ({ page }) => {
      await page.goto("/#/settings");
      await aiFeaturesSwitch(page).click();

      await sharingWarning(page).getByRole("button", { name: "Turn on" }).click();

      await expect(aiFeaturesSwitch(page)).toBeChecked();
      await expect.poll(async () => await storedSettings(page)).toMatchObject({ aiFeatures: true });
      await page.reload();
      await expect(aiFeaturesSwitch(page)).toBeChecked();
      await page.waitForLoadState("networkidle");
    });

    test("turning them off takes effect at once, without a warning", async ({ page }) => {
      await page.goto("/#/settings");
      await aiFeaturesSwitch(page).click();
      await sharingWarning(page).getByRole("button", { name: "Turn on" }).click();
      await expect(aiFeaturesSwitch(page)).toBeChecked();

      await aiFeaturesSwitch(page).click();

      await expect(aiFeaturesSwitch(page)).not.toBeChecked();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      await expect.poll(async () => await storedSettings(page)).not.toHaveProperty("aiFeatures");
      await page.reload();
      await expect(aiFeaturesSwitch(page)).not.toBeChecked();
    });

    test("no other screen shows a notice while they are on", async ({ page }) => {
      await page.goto("/#/settings");
      await aiFeaturesSwitch(page).click();
      await sharingWarning(page).getByRole("button", { name: "Turn on" }).click();
      await expect(aiFeaturesSwitch(page)).toBeChecked();

      await page.goto("/#/");
      await expect(main(page).getByRole("heading", { name: "Transactions" })).toBeVisible();
      await expect(page.getByText("OpenAI")).toHaveCount(0);
    });
  });
});

/** Stores AI features on, as a restored backup could, for the app's next start. */
const storeAiFeaturesOn = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("financial-copilot");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const transaction = open.result.transaction("settings", "readwrite");
          const settings = transaction.objectStore("settings");
          const read = settings.get("settings");
          read.onsuccess = () => settings.put({ ...read.result, aiFeatures: true }, "settings");
          transaction.oncomplete = () => {
            open.result.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
  );

test.describe("only on the user's own computer (FR-106)", () => {
  test("locally, the switch is available, and no line says to run the app locally", async ({
    page,
    baseURL,
  }) => {
    test.skip(onHostedCopy(baseURL), "Checks the app as run locally");
    await page.goto("/#/settings");

    await expect(aiFeaturesSwitch(page)).toBeEnabled();
    await expect(main(page)).not.toContainText(catalogue.aiFeaturesLocalOnly);
  });

  test("on a hosted copy, the switch is off and unavailable with the reason beside it, also with AI features stored on", async ({
    page,
    baseURL,
  }) => {
    test.skip(!onHostedCopy(baseURL), "Checks a hosted copy, as the deployed job does");
    await page.goto("/#/settings");

    await expect(aiFeaturesSwitch(page)).toBeDisabled();
    await expect(aiFeaturesSwitch(page)).not.toBeChecked();
    await expect(aiFeaturesSwitch(page)).toHaveAccessibleDescription(catalogue.aiFeaturesLocalOnly);

    await storeAiFeaturesOn(page);
    await page.reload();
    await expect(aiFeaturesSwitch(page)).toBeDisabled();
    await expect(aiFeaturesSwitch(page)).not.toBeChecked();

    await saveMyBankProfile(page);
    await importWithProfile(page, { account: "Cash", file: "mybank-2026-08.csv" });
    await expect(suggestButton(page)).toBeDisabled();
    await openChat(page);
    await expect(chat(page)).toContainText(catalogue.financeChat.needsAiFeatures);
    await expect(chat(page).getByRole("textbox", { name: "Your question" })).toHaveCount(0);
  });
});
