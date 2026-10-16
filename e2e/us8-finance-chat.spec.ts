import type { Page } from "@playwright/test";
import { messageFor } from "../src/ui/messages";
// A namespace import, so the spec loads even before the catalogue words a new message.
import * as catalogue from "../src/ui/messages";
import { addTransaction } from "./support/app";
import {
  LOCAL_ONLY,
  answer,
  askInChat,
  chat,
  chatButton,
  conversation,
  onHostedCopy,
  openChat,
  outOfScope,
  questionField,
  standInChat,
  suggestions,
  turnOnAiFeatures,
  type ChatQuestion,
  type Reply,
} from "./support/ai";
import { expect, setToday, test } from "./support/test";

// The journey of User Story 8, scenarios 1–11 (quickstart.md, US8). A stand-in answers at the AI
// route in OpenAI's place (R-26). On a hosted copy, where AI features cannot be turned on, only
// scenario 1 runs (FR-106).

const subscriptions = "Which of my subscriptions have become more expensive?";
const outOfScopeQuestion = "What is the capital of France?";
const beforeTheData = "Did I spend more on travel than in 2024?";
const toStop = "Where did I spend more this month than last month?";
const failing = "And how about next month?";
const followUp = "Which subscription costs the most?";
const setBudget = "Set my groceries budget to €300.";

const priceRise =
  "Spotify Premium rose from €10.99 to €11.99 in September 2026. Both payments are in Leisure.";
const missingData =
  "I can't tell: the data I get starts in September 2025, so 2024 is not in it. " +
  "Since then you spent nothing on Travel.";
const mostExpensive = "Spotify Premium, at €11.99 a month.";
const howToBudget =
  "I can't change anything in the app. To set it, open Budgets, type 300 as the limit of " +
  "Groceries and press Enter.";

/** The stand-in's answer to each question of the journey. */
const replies: Record<string, ReturnType<Reply<ChatQuestion>>> = {
  [subscriptions]: {
    json: {
      inScope: true,
      answer: priceRise,
      sources: [
        {
          name: "Leisure, August – September 2026",
          from: "2026-08-01",
          to: "2026-09-30",
          category: { side: "expense", name: "Leisure" },
          account: null,
        },
      ],
      followUps: [followUp],
    },
  },
  [followUp]: answer(mostExpensive)({} as ChatQuestion),
  [setBudget]: answer(howToBudget)({} as ChatQuestion),
  [beforeTheData]: answer(missingData)({} as ChatQuestion),
  [outOfScopeQuestion]: outOfScope({} as ChatQuestion),
  [toStop]: answer("This comes too late.")({} as ChatQuestion),
  [failing]: "unreachable",
};

const sources = (page: Page) => chat(page).getByRole("navigation", { name: "Sources" });
const examples = (page: Page) =>
  chat(page).getByRole("button", { name: subscriptions, exact: true });
const stopButton = (page: Page) => chat(page).getByRole("button", { name: "Stop" });

test.beforeEach(async ({ page }) => {
  await setToday(page, "2026-09-20");
});

test("scenario 1: every screen shows the chat's button, and with AI features off the chat says it needs them and offers nothing to send (FR-100)", async ({
  page,
}) => {
  const standIn = await standInChat(page);
  await page.goto("/#/budgets");
  await expect(chatButton(page)).toHaveText(catalogue.financeChat.title);
  await page.goto("/");
  await expect(chatButton(page)).toHaveText(catalogue.financeChat.title);
  await chatButton(page).click();

  await expect(chat(page)).toContainText(catalogue.financeChat.needsAiFeatures);
  await expect(questionField(page)).toHaveCount(0);
  await expect(examples(page)).toHaveCount(0);
  expect(standIn.requests).toEqual([]);
});

test("scenarios 2–11: ask, follow a source, stop, keep the conversation, follow up, and ask about the app (FR-101 – FR-111)", async ({
  page,
  baseURL,
}) => {
  test.skip(onHostedCopy(baseURL), LOCAL_ONLY);
  await page.goto("/");
  await addTransaction(page, {
    amount: "10.99",
    category: "Leisure",
    date: "2026-08-02",
    description: "Spotify Premium",
  });
  await addTransaction(page, {
    amount: "11.99",
    category: "Leisure",
    date: "2026-09-02",
    description: "Spotify Premium",
  });
  await addTransaction(page, { amount: "40.00", category: "Groceries", description: "Shop" });
  const standIn = await standInChat(page, (request) => replies[request.question]!);
  await turnOnAiFeatures(page);

  // 2. With AI features on and an empty conversation, the chat offers example questions, and one
  //    sends at once (FR-101).
  await openChat(page);
  await expect(examples(page)).toBeVisible();
  standIn.hold();
  await examples(page).click();

  // 3. "Thinking…" until the first words, then the answer (FR-107).
  await expect(conversation(page)).toHaveText([subscriptions, catalogue.financeChat.thinking]);
  standIn.release();
  await expect(conversation(page).nth(1)).toContainText(priceRise);
  expect(standIn.requests[0]!.question).toBe(subscriptions);

  // 7. The answer ends with its sources; one closes the chat and shows the transaction list
  //    filtered as it says, and the chat opened again there holds the conversation (FR-110).
  await sources(page).getByRole("link", { name: "Leisure, August – September 2026" }).click();
  await expect(chat(page)).toBeHidden();
  const listed = page.getByRole("list", { name: "Transactions" }).getByRole("listitem");
  await expect(listed).toHaveCount(2);
  await expect(listed.filter({ hasText: "Spotify Premium" })).toHaveCount(2);
  await chatButton(page).click();
  await expect(conversation(page)).toHaveCount(2);

  // 4. While an answer is being written the chat stays usable, and Stop ends it at once, its text
  //    so far kept and marked as stopped (FR-108).
  standIn.hold();
  await askInChat(page, toStop);
  await expect(stopButton(page)).toBeVisible();
  await questionField(page).fill("A draft of the next question");
  await expect(questionField(page)).toHaveValue("A draft of the next question");
  await stopButton(page).click();
  await expect(conversation(page).nth(3)).toHaveText(catalogue.financeChat.stopped);
  standIn.release();

  // 5. A question about neither finance nor the app gets the fixed answer, and the example
  //    questions again (FR-101, FR-103).
  await askInChat(page, outOfScopeQuestion);
  await expect(conversation(page).nth(5)).toHaveText(catalogue.financeChat.outOfScope);
  await expect(examples(page)).toBeVisible();

  // 6. A question the data answers only in part: the answer says what is missing, as the
  //    instructions ask of every answer (FR-109).
  await askInChat(page, beforeTheData);
  await expect(conversation(page).nth(7)).toContainText(missingData);
  const rules = standIn.requests.at(-1)!.request.instructions;
  expect(rules).toMatch(/what is missing/i);
  expect(rules).toMatch(/never estimate/i);

  // 9. A failure says why and what to do, keeps the conversation, and puts the question back.
  await askInChat(page, failing);
  await expect(chat(page).getByRole("alert")).toHaveText(messageFor({ code: "ai-unreachable" }));
  await expect(conversation(page)).toHaveCount(8);
  await expect(questionField(page)).toHaveValue(failing);

  // 8. The conversation survives closing and reopening the app; cleared and confirmed, it is gone
  //    and the examples are back (FR-104, FR-069).
  await page.reload();
  await chatButton(page).click();
  await expect(conversation(page)).toHaveCount(8);
  await expect(conversation(page).first()).toHaveText(subscriptions);
  await chat(page).getByRole("button", { name: "Clear conversation" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Clear conversation" }).click();
  await expect(conversation(page)).toHaveCount(0);
  await expect(examples(page)).toBeVisible();

  // 10. A complete answer offers its follow-up questions as the examples are offered, and one
  //     sends at once (FR-111).
  await examples(page).click();
  await expect(suggestions(page).getByRole("button")).toHaveText([followUp]);
  await suggestions(page).getByRole("button", { name: followUp }).click();
  await expect(conversation(page).nth(2)).toHaveText(followUp);
  await expect(conversation(page).nth(3)).toHaveText(mostExpensive);
  expect(standIn.requests.at(-1)!.question).toBe(followUp);

  // 11. A request to change something gets an answer, without sources; the instructions carry the
  //     guide to the app and say that the chat cannot change anything (FR-103, FR-109).
  await askInChat(page, setBudget);
  await expect(conversation(page).nth(5)).toHaveText(howToBudget);
  await expect(conversation(page).nth(5).getByRole("navigation")).toHaveCount(0);
  const instructions = standIn.requests.at(-1)!.request.instructions;
  expect(instructions).toContain("\nApp guide:\n");
  expect(instructions).toMatch(/cannot change anything/i);
});
