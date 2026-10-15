import type { Page } from "@playwright/test";
import type { Settings } from "../../src/domain/types";
// A namespace import, so the spec loads even before the catalogue words a new message.
import * as catalogue from "../../src/ui/messages";
import { storedRecords } from "../support/app";
import { aiFeaturesSwitch, sharingWarning } from "../support/categoriser";
import { expect, test } from "../support/test";

// contracts/ui.md, settings; FR-084, FR-095, FR-061. The network guard also fails these tests on
// any request outside the app's origin, so turning AI features on is proven to send nothing.

const main = (page: Page) => page.getByRole("main");
const storedSettings = async (page: Page) => (await storedRecords<Settings>(page, "settings"))[0];

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

test.describe("AI features (FR-095)", () => {
  test("start off, and the screen says what they do and where data goes", async ({ page }) => {
    await page.goto("/#/settings");
    await expect(aiFeaturesSwitch(page)).not.toBeChecked();
    await expect(main(page)).toContainText("Suggest categories");
    await expect(main(page)).toContainText("Anthropic");
    expect(await storedSettings(page)).not.toHaveProperty("aiFeatures");
  });

  test("turning them on warns what is shared and with whom; Cancel leaves them off", async ({
    page,
  }) => {
    await page.goto("/#/settings");

    await aiFeaturesSwitch(page).click();

    await expect(sharingWarning(page)).toContainText(catalogue.sharingWarning);
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
    await expect(page.getByText("Anthropic")).toHaveCount(0);
  });
});
