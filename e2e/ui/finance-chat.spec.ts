import type { Page } from "@playwright/test";
import { aiFeaturesSwitch, chat, chatButton, questionField, turnOnAiFeatures } from "../support/ai";
import { expect, test } from "../support/test";

// contracts/ui.md, finance chat, width (FR-117, R-28). The window is 1280px wide, so the chat's
// greatest width, three quarters of it, is 960px.

const START = 384;
const LEAST = 320;
const GREATEST = 960;
const STEP = 16;

/** The edge of the chat's sheet, which sets its width. */
const separator = (page: Page) => chat(page).getByRole("separator", { name: "Resize the chat" });

/** The chat's sheet's width, in CSS pixels. */
async function width(page: Page) {
  return Math.round((await chat(page).boundingBox())!.width);
}

/** Opens the chat and waits until it has slid into place, against the window's right edge. */
async function openChat(page: Page) {
  await chatButton(page).click();
  await expect(chat(page)).toBeVisible();
  await expect
    .poll(async () => {
      const box = (await chat(page).boundingBox())!;
      return Math.round(box.x + box.width);
    })
    .toBe(page.viewportSize()!.width);
}

/** Drags the separator by `by` pixels, to the left when negative. */
async function drag(page: Page, by: number) {
  const box = (await separator(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + by, y, { steps: 8 });
  await page.mouse.up();
}

/**
 * Drags the separator until the sheet's left edge is at `x`, measured from the window's left edge.
 * The separator's middle need not lie on that edge, which the sheet's outline moves by a pixel.
 */
async function dragTo(page: Page, x: number) {
  const sheet = (await chat(page).boundingBox())!;
  await drag(page, x - sheet.x);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/#/insights");
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Insights", level: 1 }),
  ).toBeVisible();
});

test("opens 384px wide, with a separator on its edge whose value is its width", async ({
  page,
}) => {
  await openChat(page);

  expect(await width(page)).toBe(START);
  await expect(separator(page)).toBeVisible();
  await expect(separator(page)).toHaveAttribute("aria-orientation", "vertical");
  await expect(separator(page)).toHaveAttribute("aria-valuenow", String(START));
  await expect(separator(page)).toHaveAttribute("aria-valuemin", String(LEAST));
  await expect(separator(page)).toHaveAttribute("aria-valuemax", String(GREATEST));
  expect(await separator(page).evaluate((element) => getComputedStyle(element).cursor)).toBe(
    "ew-resize",
  );
  // The separator sits on the sheet's left edge.
  const sheet = (await chat(page).boundingBox())!;
  const edge = (await separator(page).boundingBox())!;
  expect(edge.x).toBeLessThanOrEqual(sheet.x);
  expect(edge.x + edge.width).toBeGreaterThanOrEqual(sheet.x);
});

test("widens and narrows as the separator is dragged, within 320px and three quarters of the window", async ({
  page,
}) => {
  await openChat(page);

  await drag(page, -200);
  expect(await width(page)).toBe(START + 200);
  await expect(separator(page)).toHaveAttribute("aria-valuenow", String(START + 200));

  await drag(page, 120);
  expect(await width(page)).toBe(START + 80);
  await expect(separator(page)).toHaveAttribute("aria-valuenow", String(START + 80));

  await dragTo(page, 1200);
  expect(await width(page)).toBe(LEAST);
  await expect(separator(page)).toHaveAttribute("aria-valuenow", String(LEAST));

  await dragTo(page, 10);
  expect(await width(page)).toBe(GREATEST);
  await expect(separator(page)).toHaveAttribute("aria-valuenow", String(GREATEST));
});

test("widens by 16px with Left and narrows by 16px with Right, once the separator has focus", async ({
  page,
}) => {
  await openChat(page);
  await separator(page).focus();
  await expect(separator(page)).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  expect(await width(page)).toBe(START + STEP);
  await expect(separator(page)).toHaveAttribute("aria-valuenow", String(START + STEP));

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  expect(await width(page)).toBe(START - STEP);
  await expect(separator(page)).toHaveAttribute("aria-valuenow", String(START - STEP));
  // The chat stays open: the keys move the edge and nothing else.
  await expect(chat(page)).toBeVisible();
});

test("narrows with a window too narrow for its width, to three quarters of it", async ({
  page,
}) => {
  await openChat(page);
  await dragTo(page, 1280 - 900);
  expect(await width(page)).toBe(900);

  await page.setViewportSize({ width: 1000, height: 720 });
  await expect.poll(() => width(page)).toBe(750);
  await expect(separator(page)).toHaveAttribute("aria-valuenow", "750");
  await expect(separator(page)).toHaveAttribute("aria-valuemax", "750");
});

test("keeps its width when closed and opened again and when another screen opens, until a reload", async ({
  page,
}) => {
  await openChat(page);
  await drag(page, -200);
  expect(await width(page)).toBe(START + 200);

  await page.keyboard.press("Escape");
  await expect(chat(page)).toBeHidden();
  await openChat(page);
  expect(await width(page)).toBe(START + 200);

  await page.keyboard.press("Escape");
  await expect(chat(page)).toBeHidden();
  await page
    .getByRole("navigation", { name: "Screens" })
    .getByRole("link", { name: "Accounts" })
    .click();
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Accounts", level: 1 }),
  ).toBeVisible();
  await openChat(page);
  expect(await width(page)).toBe(START + 200);
  await expect(separator(page)).toHaveAttribute("aria-valuenow", String(START + 200));

  await page.reload();
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Accounts", level: 1 }),
  ).toBeVisible();
  await openChat(page);
  expect(await width(page)).toBe(START);
});

test.describe("the model that answers (contracts/ui.md, finance chat; FR-129)", () => {
  const answersBy = (page: Page) => chat(page).getByText(/^Answers by /);

  test("a muted line above the question field names the model in use, gpt-5.4-mini by default", async ({
    page,
  }) => {
    await turnOnAiFeatures(page);
    await openChat(page);

    await expect(answersBy(page)).toHaveText("Answers by gpt-5.4-mini");
    const line = (await answersBy(page).boundingBox())!;
    const field = (await questionField(page).boundingBox())!;
    expect(line.y + line.height).toBeLessThanOrEqual(field.y);
    // The muted colour: not the colour of the conversation's text.
    const colour = await answersBy(page).evaluate((element) => getComputedStyle(element).color);
    const text = await chat(page).evaluate((element) => getComputedStyle(element).color);
    expect(colour).not.toBe(text);
  });

  test("names gpt-6.1-sol once chosen in Settings", async ({ page }) => {
    await turnOnAiFeatures(page);
    await page.goto("/#/settings");
    await page
      .getByRole("main")
      .getByRole("radiogroup", { name: "Model" })
      .getByRole("radio", { name: /^gpt-6\.1-sol(?![\w.-])/ })
      .check();

    await openChat(page);

    await expect(answersBy(page)).toHaveText("Answers by gpt-6.1-sol");
  });

  test("is absent while AI features are off", async ({ page }) => {
    await openChat(page);
    await expect(chat(page)).toBeVisible();
    await expect(answersBy(page)).toHaveCount(0);

    await turnOnAiFeatures(page);
    await page.goto("/#/settings");
    await aiFeaturesSwitch(page).click();
    await expect(aiFeaturesSwitch(page)).not.toBeChecked();
    await openChat(page);
    await expect(answersBy(page)).toHaveCount(0);
  });
});
