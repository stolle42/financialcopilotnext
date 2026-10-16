import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { chatContext, type ChatTurn } from "@/domain/chat";
import { seedState } from "@/domain/seed";
import { idCounter } from "@/domain/testing";
import { CHAT_TURNS_SENT, askFinanceChat } from "./chat";
import { chatContextOf, responseWith, type PostedRequest } from "./testing";

// contracts/ai.md, finance chat; FR-102 – FR-104, R-25.

const context = chatContext(seedState(idCounter()), "2026-10-16");

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const turnsOf = (count: number): ChatTurn[] =>
  Array.from({ length: count }, (_, index) => ({
    question: `Question ${index + 1}`,
    answer: `Answer ${index + 1}`,
  }));

const ask = (turns: ChatTurn[] = [], signal = new AbortController().signal) =>
  askFinanceChat(context, turns, "How can I reduce my spending?", signal);

async function posted(turns: ChatTurn[] = []): Promise<PostedRequest> {
  fetchMock.mockResolvedValue(json(responseWith({ inScope: true, answer: "Cook more." })));
  await ask(turns);
  return JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as PostedRequest;
}

interface Schema {
  type?: unknown;
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, Schema>;
}

describe("askFinanceChat: the request (contracts/ai.md, finance chat)", () => {
  test("asks for the answer in the contract's strict schema", async () => {
    const { format } = (await posted()).text;

    expect(format).toMatchObject({
      type: "json_schema",
      name: "finance_chat_answer",
      strict: true,
    });
    const schema = format.schema as Schema;
    expect(schema).toMatchObject({ type: "object", additionalProperties: false });
    expect([...schema.required!].sort()).toEqual(["answer", "inScope"]);
    expect(schema.properties!.inScope!.type).toBe("boolean");
    expect(schema.properties!.answer!.type).toBe("string");
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

  test("sends at most the last 10 turns (FR-102)", async () => {
    const { input } = await posted(turnsOf(12));

    expect(CHAT_TURNS_SENT).toBe(10);
    expect(input).toHaveLength(2 * CHAT_TURNS_SENT + 1);
    expect(input[0]).toEqual({ role: "user", content: "Question 3" });
    expect(input.at(-2)).toEqual({ role: "assistant", content: "Answer 12" });
  });
});

describe("askFinanceChat: the answer", () => {
  test("gives an answer in scope", async () => {
    fetchMock.mockResolvedValue(json(responseWith({ inScope: true, answer: "Cook more." })));
    expect(await ask()).toStrictEqual({ inScope: true, answer: "Cook more." });
  });

  test("gives a question out of scope as such, whatever the text", async () => {
    fetchMock.mockResolvedValue(json(responseWith({ inScope: false, answer: "Paris." })));
    expect(await ask()).toMatchObject({ inScope: false });
  });

  test.each(["", "   "])(
    "gives ai-answer-invalid for an empty answer in scope (%j)",
    async (text) => {
      fetchMock.mockResolvedValue(json(responseWith({ inScope: true, answer: text })));
      expect(await ask()).toEqual({ code: "ai-answer-invalid" });
    },
  );

  test("gives ai-answer-invalid for an answer of another shape", async () => {
    fetchMock.mockResolvedValue(json(responseWith({ answer: "Cook more." })));
    expect(await ask()).toEqual({ code: "ai-answer-invalid" });
  });

  test("passes the transport's failures on, and a cancel as null", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await ask()).toEqual({ code: "ai-unreachable" });

    const controller = new AbortController();
    controller.abort();
    expect(await ask([], controller.signal)).toBeNull();
  });
});
