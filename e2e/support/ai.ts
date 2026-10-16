import type { Page, Route } from "@playwright/test";
import { AI_PATH } from "../../src/ai/path";
import {
  EVENT_STREAM,
  chatContextOf,
  responseWith,
  type PostedRequest,
} from "../../src/ai/testing";
import type { SuggestionRequest } from "../../src/domain/import/suggestions";
import { expect } from "./test";

// The AI features without OpenAI or a key (R-24): a stand-in answers at the AI route in OpenAI's
// place. Each stand-in answers only its own feature, told by the format's name, and passes the
// rest on. Page routes take precedence over the network guard's context route, so the guard still
// fails a test on any request no stand-in answers (FR-061).

/**
 * What a stand-in does with one request: give `json` as the feature's answer, as the text of
 * OpenAI's streamed answer, all its events at once (R-26); send `json` as it is with another
 * `status`, such as OpenAI's error JSON; or refuse the connection.
 */
export type Reply<Request> = (
  request: Request,
) => { status?: number; json: unknown } | "unreachable";

/** A source as an answer names it (contracts/ai.md, finance chat; FR-110). */
export interface SourceNamed {
  name: string;
  from: string;
  to: string;
  category: { side: "expense" | "income"; name: string } | null;
  account: string | null;
}

/** One question of the finance chat, as the app sent it (contracts/ai.md, finance chat). */
export interface ChatQuestion {
  question: string;
  /** The earlier turns sent with it, oldest first. */
  turns: { question: string; answer: string }[];
  context: ChatContextSent;
  request: PostedRequest;
}

/** The parts of the chat's context the specs look at. */
export interface ChatContextSent {
  today: string;
  period: { from: string; to: string };
  accounts: { name: string; type: string; balance: number }[];
  budgets: { category: string; limit: number; spent: number }[];
  months: { month: string }[];
  transactions: { columns: string[]; rows: unknown[][] };
}

export interface StandIn<Request> {
  /** The requests the app sent, decoded, in order. */
  requests: Request[];
  /** Holds every answer from now on, until `release`. */
  hold(): void;
  release(): void;
}

async function standIn<Request>(
  page: Page,
  name: string,
  decode: (posted: PostedRequest) => Request,
  reply: Reply<Request>,
): Promise<StandIn<Request>> {
  const requests: Request[] = [];
  let held: Promise<void> = Promise.resolve();
  let release = () => {};

  await page.route(
    (url) => url.pathname === AI_PATH,
    async (route: Route) => {
      const posted = route.request().postDataJSON() as PostedRequest;
      if (posted?.text?.format?.name !== name) return route.fallback();
      const request = decode(posted);
      requests.push(request);
      await held;
      const answer = reply(request);
      // The app may have cancelled the request while it was held; then there is no one to answer.
      try {
        if (answer === "unreachable") await route.abort("connectionrefused");
        else {
          const status = answer.status ?? 200;
          await route.fulfill(
            status === 200
              ? { status, contentType: EVENT_STREAM, body: responseWith(answer.json) }
              : { status, contentType: "application/json", body: JSON.stringify(answer.json) },
          );
        }
      } catch {
        // The request is gone.
      }
    },
  );

  return {
    requests,
    hold() {
      held = new Promise((resolve) => (release = resolve));
    },
    release: () => release(),
  };
}

/** What the stand-in of category suggestions does with one request. */
export type SuggestionReply = Reply<SuggestionRequest>;

/** Suggests nothing, the shortest valid answer (contracts/ai.md, category suggestions). */
export const suggestNothing: SuggestionReply = () => ({ json: { suggestions: [] } });

/** Suggests `expense` for every money-out row and `income` for every money-in row. */
export const suggestBySide =
  (expense: string, income: string): SuggestionReply =>
  (request) => ({
    json: {
      suggestions: request.rows.map((row) => ({
        rowNumber: row.rowNumber,
        category: row.side === "expense" ? expense : income,
      })),
    },
  });

/**
 * Answers category suggestions in OpenAI's place with `reply`, recording each request
 * (contracts/ai.md, category suggestions).
 */
export async function standInCategoriser(page: Page, reply: SuggestionReply = suggestNothing) {
  const answering = await standIn(
    page,
    "category_suggestions",
    (posted) => JSON.parse(posted.input[0]!.content) as SuggestionRequest,
    reply,
  );
  return { ...answering, bodies: answering.requests };
}

/** Answers the question in scope with `text` and `sources` (contracts/ai.md, finance chat). */
export const answer =
  (text: string, sources: SourceNamed[] = []): Reply<ChatQuestion> =>
  () => ({ json: { inScope: true, answer: text, sources } });

/** Answers as for a question out of scope; the chat shows its fixed answer instead. */
export const outOfScope: Reply<ChatQuestion> = () => ({
  json: { inScope: false, answer: "The capital of France is Paris.", sources: [] },
});

/** Answers the finance chat in OpenAI's place with `reply`, recording each question. */
export function standInChat(page: Page, reply: Reply<ChatQuestion> = answer("An answer.")) {
  return standIn(
    page,
    "finance_chat_answer",
    (posted) => {
      const messages = posted.input;
      const turns: ChatQuestion["turns"] = [];
      for (let i = 0; i + 1 < messages.length - 1; i += 2) {
        turns.push({ question: messages[i]!.content, answer: messages[i + 1]!.content });
      }
      return {
        question: messages.at(-1)!.content,
        turns,
        context: chatContextOf(posted) as ChatContextSent,
        request: posted,
      };
    },
    reply,
  );
}

/** The button in review's Suggestions section (contracts/ui.md, review). */
export const suggestButton = (page: Page) =>
  page
    .getByRole("region", { name: "Suggestions" })
    .getByRole("button", { name: /^(Suggest categories|Asking the AI)/ });

/** The AI features switch on the Settings screen (contracts/ui.md, settings). */
export const aiFeaturesSwitch = (page: Page) =>
  page.getByRole("main").getByRole("switch", { name: "AI features" });

/** The warning that turning AI features on shows first (FR-095). */
export const sharingWarning = (page: Page) =>
  page.getByRole("alertdialog", { name: "Turn on AI features?" });

/**
 * Turns AI features on in Settings and agrees to the data-sharing warning (FR-095), then returns
 * to the screen the page was on, if any.
 */
export async function turnOnAiFeatures(page: Page) {
  const from = page.url().startsWith("http") ? page.url() : null;
  await page.goto("/#/settings");
  await aiFeaturesSwitch(page).click();
  await sharingWarning(page).getByRole("button", { name: "Turn on" }).click();
  await expect(aiFeaturesSwitch(page)).toBeChecked();
  if (from) await page.goto(from);
}

/** Selects Suggest categories, which sends at once while AI features are on (FR-090). */
export async function suggestCategories(page: Page) {
  await suggestButton(page).click();
}

/** The button on Insights that opens the finance chat (contracts/ui.md, insights; FR-100). */
export const chatButton = (page: Page) =>
  page.getByRole("main").getByRole("button", { name: "Ask about your finances" });

/** The finance chat's sheet. */
export const chat = (page: Page) => page.getByRole("dialog", { name: "Ask about your finances" });

/** The chat's conversation: each question, then its answer. */
export const conversation = (page: Page) =>
  chat(page).getByRole("log", { name: "Conversation" }).getByRole("listitem");

/** The field to type a question into. */
export const questionField = (page: Page) =>
  chat(page).getByRole("textbox", { name: "Your question" });

/** Opens Insights and its finance chat. */
export async function openChat(page: Page) {
  await page.goto("/#/insights");
  await chatButton(page).click();
  await expect(chat(page)).toBeVisible();
}

/** Types `question` into the chat and sends it with Enter (FR-101). */
export async function askInChat(page: Page, question: string) {
  await questionField(page).fill(question);
  await questionField(page).press("Enter");
}

/**
 * True when the specs run against a copy not served from the user's own computer, such as the
 * Vercel one in the `deployed` job, where AI features cannot be turned on (FR-106). The specs keep
 * their own list of local host names, apart from the app's.
 */
export const onHostedCopy = (baseURL: string | undefined) =>
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL ?? "http://localhost").hostname);

/** Why a spec that turns AI features on skips on a hosted copy. */
export const LOCAL_ONLY = "AI features cannot be turned on in a hosted copy (FR-106)";
