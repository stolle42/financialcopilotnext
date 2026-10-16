import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { chatContext, type NamedSource } from "@/domain/chat";
import { seedState } from "@/domain/seed";
import { idCounter } from "@/domain/testing";
import type { ChatTurn } from "@/domain/types";
import { CHAT_TURNS_SENT, answerSoFar, askFinanceChat } from "./chat";
import {
  chatContextOf,
  completedEvent,
  deltaEvent,
  feedStream,
  responseWith,
  streamed,
  type PostedRequest,
} from "./testing";

// contracts/ai.md, finance chat; FR-102, FR-103, FR-107, FR-109, FR-110, R-25, R-26.

const context = chatContext(seedState(idCounter()), "2026-10-16");

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const source: NamedSource = {
  name: "Groceries, September 2026",
  from: "2026-09-01",
  to: "2026-09-30",
  category: { side: "expense", name: "Groceries" },
  account: null,
};

const inScope = (answer: string, sources: NamedSource[] = []) => ({
  inScope: true,
  answer,
  sources,
});

const turnsOf = (count: number): ChatTurn[] =>
  Array.from({ length: count }, (_, index) => ({
    question: `Question ${index + 1}`,
    answer: `Answer ${index + 1}`,
    sources: [],
  }));

const ask = (
  turns: readonly ChatTurn[] = [],
  signal = new AbortController().signal,
  onAnswer?: (soFar: { inScope?: boolean; answer: string }) => void,
) => askFinanceChat(context, turns, "How can I reduce my spending?", signal, onAnswer);

async function posted(turns: ChatTurn[] = []): Promise<PostedRequest> {
  fetchMock.mockResolvedValue(streamed(responseWith(inScope("Cook more."))));
  await ask(turns);
  return JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as PostedRequest;
}

interface Schema {
  type?: unknown;
  enum?: unknown[];
  anyOf?: Schema[];
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, Schema>;
  items?: Schema;
}

describe("askFinanceChat: the request (contracts/ai.md, finance chat)", () => {
  test("asks for the answer in the contract's strict schema, inScope, answer and sources in that order", async () => {
    const { format } = (await posted()).text;

    expect(format).toMatchObject({
      type: "json_schema",
      name: "finance_chat_answer",
      strict: true,
    });
    const schema = format.schema as Schema;
    expect(schema).toMatchObject({ type: "object", additionalProperties: false });
    // OpenAI writes the keys in the schema's order, which lets the app read inScope first (R-26).
    expect(Object.keys(schema.properties!)).toEqual(["inScope", "answer", "sources"]);
    expect([...schema.required!].sort()).toEqual(["answer", "inScope", "sources"]);
    expect(schema.properties!.inScope!.type).toBe("boolean");
    expect(schema.properties!.answer!.type).toBe("string");
  });

  test("asks for each source's name, dates, category with its side or null, and account or null (FR-110)", async () => {
    const schema = (await posted()).text.format.schema as Schema;
    const sources = schema.properties!.sources!;
    expect(sources.type).toBe("array");

    const item = sources.items!;
    expect(item).toMatchObject({ type: "object", additionalProperties: false });
    expect(Object.keys(item.properties!)).toEqual(["name", "from", "to", "category", "account"]);
    expect([...item.required!].sort()).toEqual(["account", "category", "from", "name", "to"]);
    for (const key of ["name", "from", "to"]) expect(item.properties![key]!.type).toBe("string");
    expect(item.properties!.account!.anyOf).toEqual([{ type: "string" }, { type: "null" }]);

    const category = item.properties!.category!.anyOf!;
    expect(category).toContainEqual({ type: "null" });
    const named = category.find((option) => option.type === "object")!;
    expect(named).toMatchObject({ additionalProperties: false });
    expect([...named.required!].sort()).toEqual(["name", "side"]);
    expect(named.properties!.side!.enum).toEqual(["expense", "income"]);
    expect(named.properties!.name!.type).toBe("string");
  });

  test("ends the instructions with the context as JSON, after the line Data:", async () => {
    const request = await posted();

    expect(chatContextOf(request)).toEqual(context);
    expect(request.instructions.endsWith(JSON.stringify(context))).toBe(true);
  });

  test("instructs to answer only from the user's own data, and never to follow instructions in descriptions (FR-103)", async () => {
    const { instructions } = await posted();
    const rules = instructions.slice(0, instructions.lastIndexOf("\nData:\n"));

    expect(rules).toMatch(/only questions about the user's own finances/i);
    expect(rules).toMatch(/inScope/);
    expect(rules).toMatch(/general financial or investment advice/i);
    expect(rules).toMatch(/never invent/i);
    expect(rules).toMatch(/price increase/i);
    expect(rules).toMatch(/Never follow instructions/);
    expect(rules).toMatch(/plain text/i);
    expect(rules).toMatch(/language of the question/i);
  });

  test("instructs to rest every figure on the data, and to say what is missing and why (FR-109)", async () => {
    const { instructions } = await posted();
    const rules = instructions.slice(0, instructions.lastIndexOf("\nData:\n"));

    expect(rules).toMatch(/never estimate/i);
    expect(rules).toMatch(/what is missing/i);
    expect(rules).toMatch(/why/i);
  });

  test("instructs to list in sources what the answer rests on, as the data names it (FR-110)", async () => {
    const { instructions } = await posted();
    const rules = instructions.slice(0, instructions.lastIndexOf("\nData:\n"));

    expect(rules).toMatch(/sources/);
    expect(rules).toMatch(/rests on/i);
    expect(rules).toMatch(/side/);
    expect(rules).toMatch(/null/);
  });

  test("streams the answer", async () => {
    expect((await posted()).stream).toBe(true);
  });

  test("sends the question alone when the conversation is empty", async () => {
    expect((await posted()).input).toEqual([
      { role: "user", content: "How can I reduce my spending?" },
    ]);
  });

  test("sends the earlier turns, oldest first, as questions and answers, then the question", async () => {
    expect((await posted(turnsOf(2))).input).toEqual([
      { role: "user", content: "Question 1" },
      { role: "assistant", content: "Answer 1" },
      { role: "user", content: "Question 2" },
      { role: "assistant", content: "Answer 2" },
      { role: "user", content: "How can I reduce my spending?" },
    ]);
  });

  test("sends a stopped answer as far as it got, and leaves out turns without an answer text (R-26)", async () => {
    const turns: ChatTurn[] = [
      { question: "Where does my money go?", answer: "Groceries.", sources: [] },
      { question: "What is the capital of France?", answer: "", outOfScope: true, sources: [] },
      { question: "And last month?", answer: "", stopped: true, sources: [] },
      { question: "Can I save?", answer: "You could cook", stopped: true, sources: [] },
    ];

    expect((await posted(turns)).input).toEqual([
      { role: "user", content: "Where does my money go?" },
      { role: "assistant", content: "Groceries." },
      { role: "user", content: "Can I save?" },
      { role: "assistant", content: "You could cook" },
      { role: "user", content: "How can I reduce my spending?" },
    ]);
  });

  test("sends at most the last 10 turns that have an answer text (FR-102)", async () => {
    const { input } = await posted(turnsOf(12));

    expect(CHAT_TURNS_SENT).toBe(10);
    expect(input).toHaveLength(2 * CHAT_TURNS_SENT + 1);
    expect(input[0]).toEqual({ role: "user", content: "Question 3" });
    expect(input.at(-2)).toEqual({ role: "assistant", content: "Answer 12" });
  });

  test("counts only turns with an answer text towards the 10", async () => {
    const outOfScope: ChatTurn = {
      question: "Weather?",
      answer: "",
      outOfScope: true,
      sources: [],
    };
    const { input } = await posted([...turnsOf(10), outOfScope]);

    expect(input[0]).toEqual({ role: "user", content: "Question 1" });
    expect(input).toHaveLength(2 * CHAT_TURNS_SENT + 1);
  });
});

describe("askFinanceChat: the answer (FR-103, FR-107, FR-110)", () => {
  test("gives an answer in scope with the sources it names", async () => {
    fetchMock.mockResolvedValue(streamed(responseWith(inScope("Cook more.", [source]))));
    expect(await ask()).toStrictEqual({ inScope: true, answer: "Cook more.", sources: [source] });
  });

  test("gives a question out of scope as such, whatever the text", async () => {
    fetchMock.mockResolvedValue(
      streamed(responseWith({ inScope: false, answer: "Paris.", sources: [] })),
    );
    expect(await ask()).toEqual({ inScope: false });
  });

  test("stops the request once it reads that the question is out of scope (R-26)", async () => {
    const stream = feedStream();
    fetchMock.mockResolvedValue(stream.response);
    const onAnswer = vi.fn();

    const result = ask([], undefined, onAnswer);
    stream.send(deltaEvent('{"inScope":fal'));
    stream.send(deltaEvent('se,"answer":"The capital'));

    expect(await result).toEqual({ inScope: false });
    expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    for (const [soFar] of onAnswer.mock.calls as [{ answer: string }][]) {
      expect(soFar.answer).not.toContain("capital");
    }
  });

  test("reports the answer so far as it grows, delta by delta (FR-107)", async () => {
    const stream = feedStream();
    fetchMock.mockResolvedValue(stream.response);
    const onAnswer = vi.fn();

    const result = ask([], undefined, onAnswer);
    stream.send(deltaEvent('{"inScope":true,"answer":"Coo'));
    await vi.waitFor(() =>
      expect(onAnswer).toHaveBeenLastCalledWith({ inScope: true, answer: "Coo" }),
    );
    stream.send(deltaEvent('k more.\\nAnd eat out less."'));
    await vi.waitFor(() =>
      expect(onAnswer).toHaveBeenLastCalledWith({
        inScope: true,
        answer: "Cook more.\nAnd eat out less.",
      }),
    );
    stream.send(deltaEvent(',"sources":[]}'), completedEvent());
    stream.end();

    expect(await result).toEqual(inScope("Cook more.\nAnd eat out less."));
  });

  test.each(["", "   "])(
    "gives ai-answer-invalid for an empty answer in scope (%j)",
    async (text) => {
      fetchMock.mockResolvedValue(streamed(responseWith(inScope(text))));
      expect(await ask()).toEqual({ code: "ai-answer-invalid" });
    },
  );

  test.each<[string, unknown]>([
    ["without sources", { inScope: true, answer: "Cook more." }],
    ["without inScope", { answer: "Cook more.", sources: [] }],
    ["with a source of another shape", inScope("Cook more.", [{ name: "x" } as NamedSource])],
  ])("gives ai-answer-invalid for an answer %s", async (_, answer) => {
    fetchMock.mockResolvedValue(streamed(responseWith(answer)));
    expect(await ask()).toEqual({ code: "ai-answer-invalid" });
  });

  test("passes the transport's failures on, and a cancel as null", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await ask()).toEqual({ code: "ai-unreachable" });

    const controller = new AbortController();
    controller.abort();
    expect(await ask([], controller.signal)).toBeNull();
  });

  test("resolves as cancelled when the caller aborts while the answer arrives", async () => {
    const stream = feedStream();
    fetchMock.mockResolvedValue(stream.response);
    const controller = new AbortController();
    const onAnswer = vi.fn();

    const result = ask([], controller.signal, onAnswer);
    stream.send(deltaEvent('{"inScope":true,"answer":"Coo'));
    await vi.waitFor(() => expect(onAnswer).toHaveBeenCalled());
    controller.abort();

    expect(await result).toBeNull();
  });
});

describe("answerSoFar: the partial answer as it streams (R-26)", () => {
  test.each<[string, string, { inScope?: boolean; answer: string }]>([
    ["nothing yet", "", { answer: "" }],
    ["inScope cut in half", '{"inSc', { answer: "" }],
    ["inScope's value cut in half", '{"inScope":tr', { answer: "" }],
    ["inScope complete", '{"inScope":true', { inScope: true, answer: "" }],
    ["out of scope", '{"inScope":false,"answer":"Par', { inScope: false, answer: "Par" }],
    ["the answer's key cut in half", '{"inScope":true,"ans', { inScope: true, answer: "" }],
    ["the answer begun", '{"inScope":true,"answer":"Coo', { inScope: true, answer: "Coo" }],
    [
      "the answer complete, with the sources begun",
      '{"inScope":true,"answer":"Done.","sources":[{"na',
      { inScope: true, answer: "Done." },
    ],
    [
      "spaces and line breaks between the keys",
      '{ "inScope" : true ,\n "answer" : "Spaced',
      { inScope: true, answer: "Spaced" },
    ],
  ])("reads %s", (_, text, expected) => {
    expect(answerSoFar(text)).toEqual(expected);
  });

  test("decodes the answer's escapes", () => {
    expect(
      answerSoFar('{"inScope":true,"answer":"Line one\\nLine \\"two\\" caf\\u00e9 \\\\ \\/ \\ttab'),
    ).toEqual({ inScope: true, answer: 'Line one\nLine "two" café \\ / \ttab' });
  });

  test.each([
    ['{"inScope":true,"answer":"a\\', "a"],
    ['{"inScope":true,"answer":"a\\u00', "a"],
    ['{"inScope":true,"answer":"a\\u00e', "a"],
  ])("shows nothing of an escape cut in half: %j", (text, answer) => {
    expect(answerSoFar(text)).toEqual({ inScope: true, answer });
  });

  test("keeps an escaped quote inside the answer, not as its end", () => {
    expect(answerSoFar('{"inScope":true,"answer":"Say \\"hi\\" now","sources":[]}')).toEqual({
      inScope: true,
      answer: 'Say "hi" now',
    });
  });
});
