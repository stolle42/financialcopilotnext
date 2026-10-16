import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { chatContextOf, responseWith, type PostedRequest } from "@/ai/testing";
import { chatContext } from "@/domain/chat";
import { loadState, openDatabase } from "@/persistence/db";
import { askChat } from "./chat";
import { setAiFeatures } from "./settings";
import { createStore } from "./store";

// FR-061, FR-102 – FR-104, R-25: a question to the finance chat, asked from the store.

const fetchMock = vi.fn<typeof fetch>();

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
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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
  if (aiFeatures) await setAiFeatures(store, true);
  return { db, store };
}

const question = "Which of my subscriptions have become more expensive?";
const ask = (store: Parameters<typeof askChat>[0], signal = new AbortController().signal) =>
  askChat(store, [{ question: "How much did I spend?", answer: "€11.99." }], question, signal);

describe("askChat (FR-100 – FR-104)", () => {
  test("with AI features off, gives ai-features-off and sends nothing (FR-061, FR-100)", async () => {
    const { store } = await setUp(false);

    expect(await ask(store)).toEqual({ code: "ai-features-off" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("sends the question, the earlier turns, and the context of today's data (FR-102)", async () => {
    const { store } = await setUp();
    fetchMock.mockResolvedValue(json(responseWith({ inScope: true, answer: "None." })));

    await ask(store);

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as PostedRequest;
    expect(body.text.format.name).toBe("finance_chat_answer");
    expect(body.input.at(-1)).toEqual({ role: "user", content: question });
    expect(body.input[0]).toEqual({ role: "user", content: "How much did I spend?" });
    expect(chatContextOf(body)).toEqual(chatContext(store.getState(), "2026-10-16"));
    expect(JSON.stringify(chatContextOf(body))).toContain("Spotify Premium");
  });

  test("resolves to the answer, and changes nothing in memory or storage (FR-103)", async () => {
    const { db, store } = await setUp();
    fetchMock.mockResolvedValue(json(responseWith({ inScope: true, answer: "None rose." })));
    const before = store.getState();
    const stored = await loadState(db);

    expect(await ask(store)).toEqual({ inScope: true, answer: "None rose." });

    expect(store.getState()).toBe(before);
    expect(await loadState(db)).toEqual(stored);
  });

  test("passes a failure on as its code", async () => {
    const { store } = await setUp();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await ask(store)).toEqual({ code: "ai-unreachable" });
  });

  test("resolves as cancelled when the question is aborted, as when the user leaves Insights (FR-104)", async () => {
    const { store } = await setUp();
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
    );
    const controller = new AbortController();

    const result = ask(store, controller.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    controller.abort();

    expect(await result).toBeNull();
  });
});
