import type { Page } from "@playwright/test";
import type { ChatTurn } from "../../src/domain/types";
// A namespace import, so the spec loads before the catalogue words the chat's new lines.
import * as catalogue from "../../src/ui/messages";
import {
  aiFeaturesSwitch,
  answer,
  chat,
  chatButton,
  conversation,
  keyDialog,
  keyField,
  questionField,
  askInChat,
  standInChat,
  standInKeyCheck,
  suggestions,
  TEST_KEY,
  turnOnAiFeatures,
} from "../support/ai";
import { putRecord } from "../support/app";
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

test.describe("while AI features are off (FR-135)", () => {
  /** The chat's words while AI features are off, as the catalogue will hold them. */
  const said = catalogue.financeChat as unknown as {
    about: readonly string[];
    forExample: string;
    examples: readonly string[];
    charges: string;
    turnOn: string;
    faqLink: string;
  };
  const turnOnButton = (page: Page) => chat(page).getByRole("button", { name: said.turnOn });
  const faqLink = (page: Page) => chat(page).getByRole("link", { name: said.faqLink });
  const keyDialogTurnOn = (page: Page) =>
    keyDialog(page).getByRole("button", { name: "Turn on", exact: true });

  /** Expects the sheet as AI features off leave it: every part, no field, no example buttons. */
  async function expectOffState(page: Page) {
    for (const line of said.about) await expect(chat(page)).toContainText(line);
    await expect(chat(page)).toContainText(said.charges);
    await expect(turnOnButton(page)).toBeVisible();
    await expect(faqLink(page)).toBeVisible();
    await expect(questionField(page)).toHaveCount(0);
    await expect(suggestions(page)).toHaveCount(0);
  }

  test("shows what it answers, the examples, what it needs, Turn on AI features and the FAQ link, in that order, with no field", async ({
    page,
  }) => {
    await openChat(page);
    await expectOffState(page);
    const parts = [
      chat(page).getByText(said.about[0]!),
      chat(page).getByText(said.forExample, { exact: true }),
      chat(page).getByText(said.examples[0]!, { exact: true }),
      chat(page).getByText(said.examples.at(-1)!, { exact: true }),
      chat(page).getByText(said.charges),
      turnOnButton(page),
      faqLink(page),
    ];
    let above = -1;
    for (const part of parts) {
      const y = (await part.boundingBox())!.y;
      expect(y).toBeGreaterThan(above);
      above = y;
    }
  });

  test("lists the examples as text, which cannot be selected or sent", async ({ page }) => {
    const standIn = await standInChat(page);
    await openChat(page);
    for (const example of said.examples) {
      await expect(chat(page).getByText(example, { exact: true })).toBeVisible();
      await expect(chat(page).getByRole("button", { name: example })).toHaveCount(0);
    }
    await chat(page).getByText(said.examples[0]!, { exact: true }).click();
    await page.waitForTimeout(300);
    expect(standIn.requests).toHaveLength(0);
    await expect(conversation(page)).toHaveCount(0);
  });

  test("Turn on AI features opens the dialog of Settings; Cancel leaves the sheet as it was", async ({
    page,
  }) => {
    await openChat(page);
    await turnOnButton(page).click();
    await expect(keyDialog(page)).toBeVisible();
    await expect(keyField(page)).toBeVisible();
    await keyDialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(keyDialog(page)).toBeHidden();
    await expect(chat(page)).toBeVisible();
    await expectOffState(page);
  });

  test("a key OpenAI does not accept leaves the sheet as it was", async ({ page }) => {
    await standInKeyCheck(page, 401);
    await openChat(page);
    await turnOnButton(page).click();
    await keyField(page).fill(TEST_KEY);
    await keyDialogTurnOn(page).click();
    await expect(keyDialog(page)).toContainText("OpenAI didn't accept this key.");
    await keyDialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(keyDialog(page)).toBeHidden();
    await expect(chat(page)).toBeVisible();
    await expectOffState(page);
  });

  test("a key OpenAI accepts shows the field, focused, and the example buttons, in the open sheet", async ({
    page,
  }) => {
    await standInKeyCheck(page, 200);
    await openChat(page);
    await turnOnButton(page).click();
    await keyField(page).fill(TEST_KEY);
    await keyDialogTurnOn(page).click();
    await expect(keyDialog(page)).toBeHidden();
    await expect(chat(page)).toBeVisible();
    await expect(questionField(page)).toBeFocused();
    await expect(suggestions(page).getByRole("button")).toHaveText([...said.examples]);
    await expect(turnOnButton(page)).toHaveCount(0);
    await expect(chat(page)).not.toContainText(said.charges);
  });

  test("a stored conversation stays above, and the next question continues it", async ({
    page,
  }) => {
    const stored: ChatTurn[] = [
      { question: "Where does my money go?", answer: "Mostly to groceries.", sources: [] },
    ];
    await putRecord(page, "settings", "conversation", stored);
    await page.reload();
    await openChat(page);
    await expect(conversation(page)).toHaveText([
      "Where does my money go?",
      "Mostly to groceries.",
    ]);
    await expectOffState(page);
    const last = (await conversation(page).last().boundingBox())!;
    const about = (await chat(page).getByText(said.about[0]!).boundingBox())!;
    expect(last.y).toBeLessThan(about.y);

    const standIn = await standInChat(page, answer("Rent, mostly."));
    await standInKeyCheck(page, 200);
    await turnOnButton(page).click();
    await keyField(page).fill(TEST_KEY);
    await keyDialogTurnOn(page).click();
    await askInChat(page, "And last month?");
    await expect(conversation(page)).toHaveText([
      "Where does my money go?",
      "Mostly to groceries.",
      "And last month?",
      "Rent, mostly.",
    ]);
    expect(standIn.requests[0]!.turns).toEqual([
      { question: "Where does my money go?", answer: "Mostly to groceries." },
    ]);
  });

  test("the FAQ link opens FAQ and closes the sheet", async ({ page }) => {
    await openChat(page);
    await faqLink(page).click();
    await expect(page).toHaveURL(/#\/faq$/);
    await expect(chat(page)).toBeHidden();
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Help", level: 1 }),
    ).toBeVisible();
  });
});
