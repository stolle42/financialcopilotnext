import type { Locator, Page } from "@playwright/test";
import { screenIntro } from "../support/app";
import { expect, test } from "../support/test";

// contracts/ui.md, FAQ; FR-139 – FR-140, FR-061, FR-123. The network guard also fails these tests
// on any request outside the app's origin.

const TOPICS = [
  "Getting started",
  "Importing bank files",
  "Accounts and budgets",
  "Your data and AI features",
];

const QUESTIONS = [
  "Where do I start?",
  "Entering every bank transaction by hand is a lot of work. How can I make it easier?",
  "Can the app connect to my bank directly?",
  "Where is my data, and who can see it?",
  "My bank's file doesn't import, or the preview looks wrong. What do I do?",
  "Why are some rows marked as duplicates?",
  "Can I undo an import?",
  "A payment to my credit card or savings account counts as spending. How do I fix it?",
  "Why does an account's balance differ from my bank's?",
  "How do budgets work? Does money I don't spend carry over?",
  "Can I lose my data?",
  "What do the AI features do, and what do they cost?",
];

const main = (page: Page) => page.getByRole("main");
/** Each question with its answer. */
const entries = (page: Page) => main(page).locator("details");
const question = (entry: Locator) => entry.locator(":scope > summary");
const answer = (entry: Locator) => entry.locator(":scope > :not(summary)").first();
const entryOf = (page: Page, text: string) =>
  entries(page).filter({ has: page.locator("summary", { hasText: text }) });

async function openFaq(page: Page) {
  await page.goto("/#/faq");
  await expect(main(page).getByRole("heading", { name: "FAQ", level: 1 })).toBeVisible();
}

/** Opens every answer. */
async function openAll(page: Page) {
  for (const entry of await entries(page).all()) await question(entry).click();
  await expect(main(page).locator("details[open]")).toHaveCount(QUESTIONS.length);
}

test("says under the heading what FAQ is for (FR-137)", async ({ page }) => {
  await openFaq(page);
  await expect(screenIntro(page)).toHaveText(
    "Answers to questions users often have, with links to where to act.",
  );
});

test("shows the four topics as headings and the twelve questions, every answer hidden (FR-139)", async ({
  page,
}) => {
  await openFaq(page);
  await expect(main(page).getByRole("heading", { level: 2 })).toHaveText(TOPICS);
  await expect(main(page).locator("summary")).toHaveText(QUESTIONS);
  for (const entry of await entries(page).all()) await expect(answer(entry)).toBeHidden();
});

test("selecting a question shows its answer, and selecting it again hides it", async ({ page }) => {
  await openFaq(page);
  const entry = entryOf(page, QUESTIONS[0]!);
  await question(entry).click();
  await expect(answer(entry)).toBeVisible();
  await question(entry).click();
  await expect(answer(entry)).toBeHidden();
});

test("Enter and Space on a question show and hide its answer", async ({ page }) => {
  await openFaq(page);
  const entry = entryOf(page, QUESTIONS[2]!);
  await question(entry).focus();
  await page.keyboard.press("Enter");
  await expect(answer(entry)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(answer(entry)).toBeHidden();
  await page.keyboard.press("Space");
  await expect(answer(entry)).toBeVisible();
  await page.keyboard.press("Space");
  await expect(answer(entry)).toBeHidden();
});

test("shows several answers at once", async ({ page }) => {
  await openFaq(page);
  const first = entryOf(page, QUESTIONS[0]!);
  const last = entryOf(page, QUESTIONS[11]!);
  await question(first).click();
  await question(last).click();
  await expect(answer(first)).toBeVisible();
  await expect(answer(last)).toBeVisible();
});

test("each link inside the app opens its screen (FR-139)", async ({ page }) => {
  await openFaq(page);
  await openAll(page);
  const inside = main(page).locator('a[href^="#/"]');
  const targets = [
    ...new Set(await inside.evaluateAll((all) => all.map((a) => a.getAttribute("href")!))),
  ];
  expect(targets.length).toBeGreaterThan(0);
  for (const target of targets) {
    await openFaq(page);
    await openAll(page);
    await main(page).locator(`a[href="${target}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`${target.replaceAll("/", "\\/")}$`));
    await expect(main(page).getByRole("heading", { level: 1 })).not.toHaveText("FAQ");
  }
});

test("the link to OpenAI's page for API keys opens in a new tab, with no referrer (FR-139)", async ({
  page,
}) => {
  await openFaq(page);
  await openAll(page);
  const outside = main(page).locator('a:not([href^="#"])');
  await expect(outside).not.toHaveCount(0);
  for (const link of await outside.all()) {
    await expect(link).toHaveAttribute("href", "https://platform.openai.com/api-keys");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
});

test("opening FAQ and every answer sends no request outside the app (FR-061)", async ({
  page,
  baseURL,
}) => {
  await page.goto("/");
  await expect(main(page).getByRole("heading", { name: "Transactions" })).toBeVisible();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page
    .getByRole("navigation", { name: "Screens" })
    .getByRole("link", { name: "FAQ" })
    .click();
  await expect(main(page).getByRole("heading", { name: "FAQ", level: 1 })).toBeVisible();
  await openAll(page);
  expect(requests.filter((url) => !url.startsWith(baseURL!))).toEqual([]);
});

test.describe("without a network connection (FR-123)", () => {
  test.use({ serviceWorkers: "allow" });

  test("shows every question and answer once the app was opened before", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.waitForFunction(async () => {
      await navigator.serviceWorker.ready;
      return !!navigator.serviceWorker.controller;
    });
    await context.setOffline(true);
    await page.goto("/#/faq");
    await page.reload();
    await expect(main(page).getByRole("heading", { name: "FAQ", level: 1 })).toBeVisible();
    await expect(main(page).locator("summary")).toHaveText(QUESTIONS);
    await openAll(page);
    for (const entry of await entries(page).all()) await expect(answer(entry)).toBeVisible();
  });
});
