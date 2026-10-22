import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  chatContextOf,
  completedEvent,
  deltaEvent,
  feedStream,
  openAiError,
  responseWith,
  streamed,
  type PostedRequest,
} from "@/ai/testing";
import { addTurn, chatContext, type NamedSource } from "@/domain/chat";
import type { ChatTurn } from "@/domain/types";
import { loadState, openDatabase } from "@/persistence/db";
import { askChat, chatSession, clearConversation, stopChat, subscribeChat } from "./chat";
import { chooseModel, removeKey, setAiFeatures, turnOnWithKey } from "./settings";
import { createStore, type Store } from "./store";

// FR-061, FR-102 – FR-110, R-25, R-26: a question to the finance chat, asked from the store, and
// the chat's session, which outlives the Insights screen.

const fetchMock = vi.fn<typeof fetch>();
const testKey = "sk-test-0000a1b2";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // Only the clock is fake, so IndexedDB's own timers still run.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T12:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A store with a transaction on Cash, and AI features on unless `aiFeatures` is false. */
async function setUp(aiFeatures = true) {
  const db = await openDatabase();
  const store = createStore(db, await loadState(db));
  await store.run((state, context) => ({
    transactions: {
      put: [
        {
          id: context.newId(),
          seq: 1,
          date: "2026-10-02",
          amountCents: 1199,
          accountId: state.accounts[0]!.id,
          description: "Spotify Premium",
          kind: "expense",
          categoryId: state.categories.find((c) => c.name === "Leisure")!.id,
        },
      ],
    },
  }));
  if (aiFeatures) await turnOnWithKey(store, testKey);
  return { db, store };
}

const question = "Which of my subscriptions have become more expensive?";

const answered = (answer: string, sources: NamedSource[] = [], followUps: string[] = []) =>
  streamed(responseWith({ inScope: true, answer, sources, followUps }));

/** A fetch that answers only when aborted, as an answer still awaited. */
function hangingFetch() {
  fetchMock.mockImplementation(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      }),
  );
}

/** Feeds the answer's events one by one through the stubbed fetch. */
function feeding() {
  const stream = feedStream();
  fetchMock.mockResolvedValue(stream.response);
  return stream;
}

const conversationOf = (store: Store) => store.getState().conversation;

describe("askChat: who may ask (FR-061, FR-100, FR-106)", () => {
  test("with AI features off, gives ai-features-off, and sends and stores nothing", async () => {
    const { store } = await setUp(false);
    const before = store.getState();

    expect(await askChat(store, question)).toEqual({ code: "ai-features-off" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.getState()).toBe(before);
    expect(chatSession(store).asking).toBeNull();
  });

  test("with the switch on but no key stored, as a v1.5 database leaves it, gives ai-features-off and sends nothing (FR-126)", async () => {
    const { store } = await setUp();
    await removeKey(store);
    await setAiFeatures(store, true);
    const before = store.getState();

    expect(await askChat(store, question)).toEqual({ code: "ai-features-off" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.getState()).toBe(before);
  });
});

describe("askChat: what a question sends (FR-102)", () => {
  test("sends the question, the stored turns, and the context of today's data", async () => {
    const { store } = await setUp();
    const earlier: ChatTurn = { question: "How much did I spend?", answer: "€11.99.", sources: [] };
    await store.run((state) => addTurn(state, earlier));
    fetchMock.mockResolvedValue(answered("None."));

    await askChat(store, question);

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as PostedRequest;
    expect(body.text.format.name).toBe("finance_chat_answer");
    expect(body.input).toEqual([
      { role: "user", content: "How much did I spend?" },
      { role: "assistant", content: "€11.99." },
      { role: "user", content: question },
    ]);
    const sent = chatContextOf(body);
    expect(sent).toEqual(chatContext(store.getState(), "2026-10-16"));
    expect(JSON.stringify(sent)).toContain("Spotify Premium");
  });
});

describe("askChat: the key and the model (FR-128, FR-129)", () => {
  const posted = (call: number) =>
    JSON.parse(String(fetchMock.mock.calls[call]![1]?.body)) as PostedRequest;

  test("asks OpenAI with the stored key and the default model when none is chosen", async () => {
    const { store } = await setUp();
    fetchMock.mockResolvedValue(answered("None."));

    await askChat(store, question);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${testKey}`);
    expect(posted(0).model).toBe("gpt-5.4-mini");
  });

  test("an answer being written keeps the model it started with; the next question asks the new one", async () => {
    const { store } = await setUp();
    await chooseModel(store, "gpt-6.1-sol");
    const stream = feeding();

    const asked = askChat(store, question);
    stream.send(deltaEvent('{"inScope":true,"answer":"None'));
    await vi.waitFor(() => expect(chatSession(store).asking?.answer).toBe("None"));
    await chooseModel(store, "gpt-5.6-luna");
    stream.send(deltaEvent(' rose.","sources":[],"followUps":[]}'), completedEvent());
    stream.end();
    await asked;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(posted(0).model).toBe("gpt-6.1-sol");
    expect(conversationOf(store).at(-1)?.answer).toBe("None rose.");

    fetchMock.mockResolvedValue(answered("Still none."));
    await askChat(store, question);
    expect(posted(1).model).toBe("gpt-5.6-luna");
  });

  test.each<[string, number, string, unknown]>([
    ["ai-key-rejected", 401, "invalid_api_key", undefined],
    ["ai-no-credit", 429, "insufficient_quota", undefined],
    ["ai-model-unavailable", 404, "model_not_found", { model: "gpt-6.1-sol" }],
  ])(
    "gives %s, stores nothing, and the session holds the question",
    async (code, status, openAiCode, details) => {
      const { store } = await setUp();
      await chooseModel(store, "gpt-6.1-sol");
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify(openAiError("No.", openAiCode)), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      );
      const before = store.getState();

      const refusal = details === undefined ? { code } : { code, details };
      expect(await askChat(store, question)).toEqual(refusal);

      expect(store.getState()).toBe(before);
      expect(chatSession(store).failure).toEqual({ ...refusal, question });
    },
  );
});

describe("askChat: the answer and the session (FR-104, FR-107, FR-110)", () => {
  test("shows the question at once, then the answer as it grows, telling each change", async () => {
    const { store } = await setUp();
    const stream = feeding();
    const changed = vi.fn();
    const unsubscribe = subscribeChat(store, changed);

    const asked = askChat(store, question);
    expect(chatSession(store).asking).toEqual({ question, answer: "" });
    expect(changed).toHaveBeenCalled();

    stream.send(deltaEvent('{"inScope":true,"answer":"None ro'));
    await vi.waitFor(() =>
      expect(chatSession(store).asking).toEqual({ question, answer: "None ro" }),
    );
    stream.send(deltaEvent('se."'));
    await vi.waitFor(() =>
      expect(chatSession(store).asking).toEqual({ question, answer: "None rose." }),
    );
    stream.send(deltaEvent(',"sources":[],"followUps":[]}'), completedEvent());
    stream.end();

    expect(await asked).toBeNull();
    expect(chatSession(store).asking).toBeNull();
    unsubscribe();
  });

  test("stores a complete answer, with its sources' ids, in memory and in storage", async () => {
    const { db, store } = await setUp();
    const state = store.getState();
    const leisure = state.categories.find((c) => c.side === "expense" && c.name === "Leisure")!;
    const cash = state.accounts[0]!;
    fetchMock.mockResolvedValue(
      answered("Spotify Premium rose.", [
        {
          name: "Leisure, October 2026",
          from: "2026-10-01",
          to: "2026-10-16",
          category: { side: "expense", name: "Leisure" },
          account: "Cash",
        },
        {
          name: "An account the user does not have",
          from: "2026-10-01",
          to: "2026-10-16",
          category: null,
          account: "Savings",
        },
      ]),
    );

    expect(await askChat(store, question)).toBeNull();

    const stored: ChatTurn = {
      question,
      answer: "Spotify Premium rose.",
      sources: [
        {
          name: "Leisure, October 2026",
          from: "2026-10-01",
          to: "2026-10-16",
          categoryId: leisure.id,
          accountId: cash.id,
        },
      ],
    };
    expect(conversationOf(store)).toEqual([stored]);
    expect((await loadState(db)).conversation).toEqual([stored]);
  });

  test("stores a complete answer with its follow-ups, and one that suggests none without them (FR-111)", async () => {
    const { db, store } = await setUp();
    fetchMock
      .mockResolvedValueOnce(
        answered("Spotify Premium rose.", [], ["And Netflix?", "What do they cost a year?"]),
      )
      .mockResolvedValueOnce(answered("It did not."));

    await askChat(store, question);
    await askChat(store, "And Netflix?");

    expect(conversationOf(store)).toStrictEqual([
      {
        question,
        answer: "Spotify Premium rose.",
        sources: [],
        followUps: ["And Netflix?", "What do they cost a year?"],
      },
      { question: "And Netflix?", answer: "It did not.", sources: [] },
    ]);
    expect((await loadState(db)).conversation).toStrictEqual(conversationOf(store));
    // Follow-ups are not sent with later questions (FR-111).
    expect(String(fetchMock.mock.calls[1]![1]?.body)).not.toContain("What do they cost a year?");
  });

  test("adds each answered question after the earlier ones", async () => {
    const { store } = await setUp();
    fetchMock.mockResolvedValueOnce(answered("First.")).mockResolvedValueOnce(answered("Second."));

    await askChat(store, "One?");
    await askChat(store, "Two?");

    expect(conversationOf(store).map((turn) => [turn.question, turn.answer])).toEqual([
      ["One?", "First."],
      ["Two?", "Second."],
    ]);
    const second = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)) as PostedRequest;
    expect(second.input.slice(0, 2)).toEqual([
      { role: "user", content: "One?" },
      { role: "assistant", content: "First." },
    ]);
  });

  test("stores a question out of scope as such, with no text and no sources (FR-103)", async () => {
    const { store } = await setUp();
    fetchMock.mockResolvedValue(
      streamed(responseWith({ inScope: false, answer: "Paris.", sources: [], followUps: [] })),
    );

    expect(await askChat(store, "What is the capital of France?")).toBeNull();

    expect(conversationOf(store)).toEqual([
      { question: "What is the capital of France?", answer: "", outOfScope: true, sources: [] },
    ]);
  });
});

describe("stopChat, and turning AI features off (FR-108)", () => {
  test("Stop ends the answer at once and stores its text so far, marked stopped, without sources", async () => {
    const { db, store } = await setUp();
    const stream = feeding();

    const asked = askChat(store, question);
    stream.send(deltaEvent('{"inScope":true,"answer":"You could'));
    await vi.waitFor(() => expect(chatSession(store).asking?.answer).toBe("You could"));
    await stopChat(store);

    expect(await asked).toBeNull();
    expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    const stopped: ChatTurn = { question, answer: "You could", stopped: true, sources: [] };
    expect(conversationOf(store)).toEqual([stopped]);
    expect((await loadState(db)).conversation).toEqual([stopped]);
    expect(chatSession(store).asking).toBeNull();
  });

  test("Stop before the first words stores the question with an empty answer, marked stopped", async () => {
    const { store } = await setUp();
    hangingFetch();

    const asked = askChat(store, question);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await stopChat(store);

    expect(await asked).toBeNull();
    expect(conversationOf(store)).toEqual([{ question, answer: "", stopped: true, sources: [] }]);
  });

  test("Stop with no question asked does nothing", async () => {
    const { store } = await setUp();
    const before = store.getState();

    await stopChat(store);

    expect(store.getState()).toBe(before);
  });

  test("turning AI features off stops the answer in the same way (FR-095)", async () => {
    const { store } = await setUp();
    const stream = feeding();

    const asked = askChat(store, question);
    stream.send(deltaEvent('{"inScope":true,"answer":"You could'));
    await vi.waitFor(() => expect(chatSession(store).asking?.answer).toBe("You could"));
    await setAiFeatures(store, false);

    expect(await asked).toBeNull();
    expect(store.getState().settings.aiFeatures).toBeUndefined();
    expect(conversationOf(store)).toEqual([
      { question, answer: "You could", stopped: true, sources: [] },
    ]);
  });

  test("Remove key stops the answer in the same way, and deletes the key (FR-126)", async () => {
    const { db, store } = await setUp();
    const stream = feeding();

    const asked = askChat(store, question);
    stream.send(deltaEvent('{"inScope":true,"answer":"You could'));
    await vi.waitFor(() => expect(chatSession(store).asking?.answer).toBe("You could"));
    await removeKey(store);

    expect(await asked).toBeNull();
    expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    expect(store.getState().apiKey).toBeNull();
    expect(store.getState().settings.aiFeatures).toBeUndefined();
    const stopped: ChatTurn = { question, answer: "You could", stopped: true, sources: [] };
    expect(conversationOf(store)).toEqual([stopped]);
    expect((await loadState(db)).conversation).toEqual([stopped]);
  });
});

describe("askChat: failures (FR-104)", () => {
  test("a failure before any text stores nothing, and the session holds the code and the question", async () => {
    const { store } = await setUp();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const before = store.getState();

    expect(await askChat(store, question)).toEqual({ code: "ai-unreachable" });

    expect(store.getState()).toBe(before);
    expect(chatSession(store)).toEqual({
      asking: null,
      failure: { code: "ai-unreachable", question },
    });
  });

  test("a failure after part of the answer stores nothing either", async () => {
    const { db, store } = await setUp();
    const stream = feeding();

    const asked = askChat(store, question);
    stream.send(deltaEvent('{"inScope":true,"answer":"You could'));
    await vi.waitFor(() => expect(chatSession(store).asking?.answer).toBe("You could"));
    stream.breakOff();

    expect(await asked).toEqual({ code: "ai-unreachable" });
    expect(conversationOf(store)).toEqual([]);
    expect((await loadState(db)).conversation).toEqual([]);
    expect(chatSession(store).failure).toEqual({ code: "ai-unreachable", question });
  });

  test("the next question clears the last failure", async () => {
    const { store } = await setUp();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await askChat(store, question);
    fetchMock.mockResolvedValue(answered("None rose."));

    await askChat(store, question);

    expect(chatSession(store).failure).toBeNull();
  });

  test("while an answer is awaited, a second question sends nothing and changes nothing", async () => {
    const { store } = await setUp();
    hangingFetch();
    void askChat(store, question);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(await askChat(store, "Another question?")).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(chatSession(store).asking).toEqual({ question, answer: "" });
    await stopChat(store);
  });

  test("a failed write keeps the conversation as it was, and the session holds save-failed", async () => {
    const { db, store } = await setUp();
    fetchMock.mockResolvedValue(answered("None rose."));
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "settings")
        throw new DOMException("The disk is full", "QuotaExceededError");
      return put.apply(this, args);
    });

    expect(await askChat(store, question)).toMatchObject({ code: "save-failed" });

    vi.restoreAllMocks();
    expect(conversationOf(store)).toEqual([]);
    expect((await loadState(db)).conversation).toEqual([]);
    expect(chatSession(store).failure).toEqual({ code: "save-failed", question });
  });
});

describe("clearConversation (FR-069, FR-104)", () => {
  test("empties the conversation in memory and in storage, and the last failure", async () => {
    const { db, store } = await setUp();
    fetchMock.mockResolvedValueOnce(answered("None rose."));
    await askChat(store, question);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await askChat(store, "And next month?");
    expect(conversationOf(store)).toHaveLength(1);

    expect(await clearConversation(store)).toBeNull();

    expect(conversationOf(store)).toEqual([]);
    expect((await loadState(db)).conversation).toEqual([]);
    expect(chatSession(store).failure).toBeNull();
  });
});
