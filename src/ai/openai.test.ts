import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "@/files/zod";
import { AI_TIMEOUT_MS, OPENAI_MODEL, askOpenAi, type AiRequest } from "./openai";
import { AI_PATH } from "./path";
import { openAiError, responseText, responseWith, type PostedRequest } from "./testing";

// contracts/ai.md: request, answer and failures; FR-094, R-24.

const request: AiRequest<{ value: string }> = {
  name: "test_answer",
  instructions: "Answer with a value.",
  input: [{ role: "user", content: "What is the value?" }],
  schema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false,
  },
  answer: z.object({ value: z.string() }),
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
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

/** A fetch that answers only when aborted, as a request that takes too long. */
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

const ask = (signal = new AbortController().signal) => askOpenAi(request, signal);

describe("askOpenAi: the request (contracts/ai.md, request)", () => {
  test("posts JSON to the AI route on the app's own origin", async () => {
    fetchMock.mockResolvedValue(json(responseWith({ value: "x" })));

    await ask();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(AI_PATH);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
  });

  test("asks gpt-6.1-sol, stores nothing at OpenAI, and asks for the answer's strict schema", async () => {
    fetchMock.mockResolvedValue(json(responseWith({ value: "x" })));

    await ask();

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as PostedRequest;
    expect(OPENAI_MODEL).toBe("gpt-6.1-sol");
    expect(body).toEqual({
      model: OPENAI_MODEL,
      store: false,
      instructions: request.instructions,
      input: request.input,
      text: {
        format: { type: "json_schema", name: "test_answer", strict: true, schema: request.schema },
      },
    });
  });
});

describe("askOpenAi: the answer (contracts/ai.md, answer)", () => {
  test("reads the message's text after a reasoning item, as the schema reads it", async () => {
    fetchMock.mockResolvedValue(json(responseWith({ value: "x", extra: "ignored" })));
    expect(await ask()).toStrictEqual({ value: "x" });
  });

  test("joins the text of the message's output_text parts, in order", async () => {
    const answer = responseText("");
    answer.output[1] = {
      ...answer.output[1]!,
      content: [
        { type: "output_text", text: '{"val', annotations: [] },
        { type: "output_text", text: 'ue":"x"}', annotations: [] },
      ],
    } as (typeof answer.output)[number];
    fetchMock.mockResolvedValue(json(answer));

    expect(await ask()).toEqual({ value: "x" });
  });
});

describe("askOpenAi: failures (contracts/ai.md, failures)", () => {
  test("gives ai-unreachable when the request cannot be sent", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await ask()).toEqual({ code: "ai-unreachable" });
  });

  test.each<[string, () => Response]>([
    ["no route: the server's empty 404", () => new Response(null, { status: 404 })],
    ["the route's empty 403", () => new Response(null, { status: 403 })],
    ["the route's empty 413", () => new Response(null, { status: 413 })],
    [
      "a hosted copy's error page",
      () =>
        new Response("<!doctype html><title>405</title>", {
          status: 405,
          headers: { "Content-Type": "text/html" },
        }),
    ],
    [
      "a hosted copy's not-found page",
      () =>
        new Response("The page could not be found", {
          status: 404,
          headers: { "Content-Type": "text/plain" },
        }),
    ],
    ["the route's 502 when OpenAI cannot be reached", () => new Response(null, { status: 502 })],
    ["JSON that is not OpenAI's error", () => json({ message: "Not found" }, 404)],
  ])("gives ai-unreachable for %s", async (_, response) => {
    fetchMock.mockResolvedValue(response());
    expect(await ask()).toEqual({ code: "ai-unreachable" });
  });

  test.each([400, 401, 404, 429, 500])(
    "gives ai-failed for OpenAI's own error JSON with status %i",
    async (status) => {
      fetchMock.mockResolvedValue(json(openAiError("Incorrect API key provided."), status));
      expect(await ask()).toEqual({ code: "ai-failed" });
    },
  );

  test.each<[string, () => Response]>([
    ["a body that is not JSON", () => new Response("<html>OK</html>", { status: 200 })],
    ["an empty body", () => new Response(null, { status: 200 })],
    [
      "an answer cut short",
      () =>
        json({
          ...responseWith({ value: "x" }),
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
        }),
    ],
    [
      "a refusal",
      () =>
        json({
          status: "completed",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "refusal", refusal: "I can't help with that." }],
            },
          ],
        }),
    ],
    [
      "no message",
      () => json({ status: "completed", output: [{ type: "reasoning", summary: [] }] }),
    ],
    ["text that is not JSON", () => json(responseText("The value is x."))],
    ["JSON of another shape", () => json(responseWith({ value: 7 }))],
    ["no output at all", () => json({ status: "completed" })],
  ])("gives ai-answer-invalid for %s", async (_, response) => {
    fetchMock.mockResolvedValue(response());
    expect(await ask()).toEqual({ code: "ai-answer-invalid" });
  });

  test(`gives ai-timeout when no answer arrives within ${AI_TIMEOUT_MS / 60000} minutes`, async () => {
    vi.useFakeTimers();
    hangingFetch();
    let result: unknown = "pending";
    void ask().then((value) => (result = value));

    await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS - 1000);
    expect(result).toBe("pending");
    await vi.advanceTimersByTimeAsync(1000);

    expect(result).toEqual({ code: "ai-timeout" });
  });

  test("waits 4 minutes, so its message comes before Firefox's own 300-second limit (R-24)", () => {
    expect(AI_TIMEOUT_MS).toBe(4 * 60 * 1000);
    expect(AI_TIMEOUT_MS).toBeLessThan(300 * 1000);
  });

  test("resolves as cancelled, not as a failure, when the caller aborts", async () => {
    hangingFetch();
    const controller = new AbortController();
    const result = ask(controller.signal);

    controller.abort();

    expect(await result).toBeNull();
  });

  test("never sends when the caller aborted before asking", async () => {
    const controller = new AbortController();
    controller.abort();

    expect(await ask(controller.signal)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("never rejects, even when fetch throws at once", async () => {
    fetchMock.mockImplementation(() => {
      throw new TypeError("Invalid URL");
    });
    await expect(ask()).resolves.toEqual({ code: "ai-unreachable" });
  });
});
