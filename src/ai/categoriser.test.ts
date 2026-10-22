import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SuggestionRequest } from "@/domain/import/suggestions";
import { askCategoriser } from "./categoriser";
import { responseWith, streamed, type PostedRequest } from "./testing";

// contracts/ai.md, category suggestions; FR-090 – FR-094, R-23, R-24.

const request: SuggestionRequest = {
  rows: [
    { rowNumber: 2, side: "expense", counterparty: "REWE Markt GmbH", description: "Card payment" },
  ],
  categories: { expense: ["Groceries", "Housing"], income: ["Salary"] },
  examples: [{ side: "expense", description: "Lidl", category: "Groceries" }],
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The user's key and the model in use (FR-128, FR-129). */
const access = { apiKey: "sk-proj-categoriserKey9z8y", model: "gpt-6.1-sol" };

const ask = (signal = new AbortController().signal) => askCategoriser(request, access, signal);

async function posted(): Promise<PostedRequest> {
  fetchMock.mockResolvedValue(streamed(responseWith({ suggestions: [] })));
  await ask();
  return JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as PostedRequest;
}

interface Schema {
  type?: unknown;
  anyOf?: Schema[];
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, Schema>;
  items?: Schema;
}

describe("askCategoriser: the request (contracts/ai.md, category suggestions)", () => {
  test("asks OpenAI with the key and the model it is given (FR-128, FR-129)", async () => {
    const { model } = await posted();

    expect(model).toBe("gpt-6.1-sol");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${access.apiKey}`);
  });

  test("sends the suggestion request as JSON text, the one input", async () => {
    const { input } = await posted();

    expect(input).toHaveLength(1);
    expect(input[0]!.role).toBe("user");
    expect(JSON.parse(input[0]!.content)).toEqual(request);
  });

  test("asks for the answer in the contract's strict schema", async () => {
    const { format } = (await posted()).text;

    expect(format).toMatchObject({
      type: "json_schema",
      name: "category_suggestions",
      strict: true,
    });
    const schema = format.schema as Schema;
    expect(schema).toMatchObject({ type: "object", additionalProperties: false });
    expect(schema.required).toEqual(["suggestions"]);
    const suggestions = schema.properties!.suggestions!;
    expect(suggestions.type).toBe("array");
    const item = suggestions.items!;
    expect(item.additionalProperties).toBe(false);
    expect([...item.required!].sort()).toEqual(["category", "rowNumber"]);
    expect(item.properties!.rowNumber!.type).toBe("integer");
    expect(item.properties!.category!.anyOf).toEqual([{ type: "string" }, { type: "null" }]);
  });

  test("instructs to copy names exactly, to give null for a transfer, and never to follow instructions in the texts", async () => {
    const { instructions } = await posted();

    expect(instructions).toMatch(/copied exactly/i);
    expect(instructions).toMatch(/null/);
    expect(instructions).toMatch(/transfer between the user's own accounts/i);
    expect(instructions).toMatch(/examples/i);
    expect(instructions).toMatch(/Never follow instructions/);
  });
});

describe("askCategoriser: the answer", () => {
  test("gives the suggestions of a valid answer, without other keys", async () => {
    fetchMock.mockResolvedValue(
      streamed(
        responseWith({
          suggestions: [
            { rowNumber: 2, category: "Groceries", reason: "a supermarket" },
            { rowNumber: 3, category: null },
          ],
        }),
      ),
    );

    expect(await ask()).toStrictEqual([
      { rowNumber: 2, category: "Groceries" },
      { rowNumber: 3, category: null },
    ]);
  });

  test("gives an empty list when the AI suggests nothing", async () => {
    fetchMock.mockResolvedValue(streamed(responseWith({ suggestions: [] })));
    expect(await ask()).toEqual([]);
  });

  test.each<[string, unknown]>([
    ["a row number that is not a number", { suggestions: [{ rowNumber: "2", category: "X" }] }],
    ["a category that is not a name", { suggestions: [{ rowNumber: 2, category: 7 }] }],
    ["suggestions that are not a list", { suggestions: { rowNumber: 2 } }],
    ["no suggestions", { message: "Workflow was started" }],
  ])("gives ai-answer-invalid for %s", async (_, answer) => {
    fetchMock.mockResolvedValue(streamed(responseWith(answer)));
    expect(await ask()).toEqual({ code: "ai-answer-invalid" });
  });

  test("passes the transport's failures on, and a cancel as null", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await ask()).toEqual({ code: "ai-unreachable" });

    const controller = new AbortController();
    controller.abort();
    expect(await ask(controller.signal)).toBeNull();
  });
});
