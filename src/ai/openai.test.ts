import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "@/files/zod";
import { AI_TIMEOUT_MS, OPENAI_MODEL, askOpenAi, type AiRequest } from "./openai";
import { AI_PATH } from "./path";
import {
  completedEvent,
  createdEvent,
  deltaEvent,
  errorEvent,
  failedEvent,
  feedStream,
  incompleteEvent,
  openAiError,
  reasoningEvent,
  refusalEvent,
  responseText,
  responseWith,
  streamed,
  type PostedRequest,
} from "./testing";

// contracts/ai.md: request, answer and failures; FR-094, FR-107, R-24, R-26.

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

const ask = (signal = new AbortController().signal, onText?: (text: string) => void) =>
  askOpenAi(request, signal, onText);

/** Lets the transport read what the test has sent so far. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("askOpenAi: the request (contracts/ai.md, request)", () => {
  test("posts JSON to the AI route on the app's own origin", async () => {
    fetchMock.mockResolvedValue(streamed(responseWith({ value: "x" })));

    await ask();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(AI_PATH);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
  });

  test("asks gpt-6.1-sol, stores nothing at OpenAI, streams the answer, and asks for its strict schema", async () => {
    fetchMock.mockResolvedValue(streamed(responseWith({ value: "x" })));

    await ask();

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as PostedRequest;
    expect(OPENAI_MODEL).toBe("gpt-6.1-sol");
    expect(body).toEqual({
      model: OPENAI_MODEL,
      store: false,
      stream: true,
      instructions: request.instructions,
      input: request.input,
      text: {
        format: { type: "json_schema", name: "test_answer", strict: true, schema: request.schema },
      },
    });
  });
});

describe("askOpenAi: the streamed answer (contracts/ai.md, answer; R-26)", () => {
  test("joins the deltas' text in order, ignoring other events, and reads it as the schema does", async () => {
    fetchMock.mockResolvedValue(streamed(responseWith({ value: "x", extra: "ignored" })));
    expect(await ask()).toStrictEqual({ value: "x" });
  });

  test("accepts an event stream whose content type names its charset", async () => {
    fetchMock.mockResolvedValue(
      new Response(responseWith({ value: "x" }), {
        headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      }),
    );
    expect(await ask()).toEqual({ value: "x" });
  });

  test("reports the text so far after each delta, and only then", async () => {
    const stream = feedStream();
    fetchMock.mockResolvedValue(stream.response);
    const onText = vi.fn();

    const result = ask(undefined, onText);
    stream.send(createdEvent(), reasoningEvent());
    await settle();
    expect(onText).not.toHaveBeenCalled();

    stream.send(deltaEvent('{"val'));
    await vi.waitFor(() => expect(onText).toHaveBeenLastCalledWith('{"val'));
    stream.send(deltaEvent('ue":"x"}'));
    await vi.waitFor(() => expect(onText).toHaveBeenLastCalledWith('{"value":"x"}'));
    stream.send(completedEvent());
    stream.end();

    expect(await result).toEqual({ value: "x" });
    expect(onText).toHaveBeenCalledTimes(2);
  });

  test("reads an event that arrives in pieces, cut anywhere, as one", async () => {
    const stream = feedStream();
    fetchMock.mockResolvedValue(stream.response);
    const onText = vi.fn();
    const whole = deltaEvent('{"value":"x"}');

    const result = ask(undefined, onText);
    stream.send(whole.slice(0, 7));
    stream.send(whole.slice(7, 40));
    await settle();
    expect(onText).not.toHaveBeenCalled();
    stream.send(whole.slice(40), completedEvent());
    stream.end();

    expect(await result).toEqual({ value: "x" });
    expect(onText).toHaveBeenCalledExactlyOnceWith('{"value":"x"}');
  });

  test("decodes a character whose bytes are cut between pieces", async () => {
    const stream = feedStream();
    fetchMock.mockResolvedValue(stream.response);
    const bytes = new TextEncoder().encode(deltaEvent('{"value":"€ café"}') + completedEvent());
    const cut = bytes.indexOf(0xe2) + 1; // Inside the euro sign's three bytes.

    const result = ask();
    stream.sendBytes(bytes.slice(0, cut));
    stream.sendBytes(bytes.slice(cut));
    stream.end();

    expect(await result).toEqual({ value: "€ café" });
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
      "another server's error page",
      () =>
        new Response("<!doctype html><title>405</title>", {
          status: 405,
          headers: { "Content-Type": "text/html" },
        }),
    ],
    [
      "another server's not-found page",
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

  test("gives ai-unreachable when the events break off, also after part of the text", async () => {
    const stream = feedStream();
    fetchMock.mockResolvedValue(stream.response);

    const result = ask();
    stream.send(createdEvent(), deltaEvent('{"val'));
    await settle();
    stream.breakOff();

    expect(await result).toEqual({ code: "ai-unreachable" });
  });

  test("gives ai-unreachable when the events end before the response completes", async () => {
    fetchMock.mockResolvedValue(streamed(createdEvent() + deltaEvent('{"value":"x"}')));
    expect(await ask()).toEqual({ code: "ai-unreachable" });
  });

  test.each([400, 401, 404, 429, 500])(
    "gives ai-failed for OpenAI's own error JSON with status %i",
    async (status) => {
      fetchMock.mockResolvedValue(json(openAiError("Incorrect API key provided."), status));
      expect(await ask()).toEqual({ code: "ai-failed" });
    },
  );

  test.each<[string, string]>([
    ["a response.failed event", failedEvent()],
    ["an error event", errorEvent()],
  ])("gives ai-failed for %s, also after part of the text", async (_, failure) => {
    fetchMock.mockResolvedValue(streamed(createdEvent() + deltaEvent('{"val') + failure));
    expect(await ask()).toEqual({ code: "ai-failed" });
  });

  test.each<[string, () => Response]>([
    ["a completed answer as JSON, not as events", () => json({ status: "completed", output: [] })],
    ["a page that is not an event stream", () => new Response("<html>OK</html>", { status: 200 })],
    ["an empty body", () => new Response(null, { status: 200 })],
    [
      "an answer cut short",
      () => streamed(createdEvent() + deltaEvent('{"value":"x"}') + incompleteEvent()),
    ],
    ["a refusal", () => streamed(createdEvent() + refusalEvent() + completedEvent())],
    ["no text before completing", () => streamed(createdEvent() + completedEvent())],
    ["text that is not JSON", () => streamed(responseText("The value is x."))],
    ["JSON of another shape", () => streamed(responseWith({ value: 7 }))],
    ["data that is not JSON", () => streamed("data: [DONE]\n\n")],
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

  test("gives ai-timeout when the whole answer takes longer, though its text keeps arriving (FR-104)", async () => {
    vi.useFakeTimers();
    const stream = feedStream();
    fetchMock.mockResolvedValue(stream.response);
    let result: unknown = "pending";
    void ask().then((value) => (result = value));

    for (let minute = 1; minute < AI_TIMEOUT_MS / 60000; minute++) {
      await vi.advanceTimersByTimeAsync(60000);
      stream.send(deltaEvent("x"));
    }
    await vi.advanceTimersByTimeAsync(60000 - 1000);
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

  test("resolves as cancelled when the caller aborts while the text arrives, and reports no more", async () => {
    const stream = feedStream();
    fetchMock.mockResolvedValue(stream.response);
    const controller = new AbortController();
    const onText = vi.fn();

    const result = ask(controller.signal, onText);
    stream.send(deltaEvent('{"val'));
    await vi.waitFor(() => expect(onText).toHaveBeenCalledTimes(1));
    controller.abort();
    try {
      stream.send(deltaEvent('ue":"x"}'), completedEvent());
    } catch {
      // The transport has cancelled the stream already.
    }

    expect(await result).toBeNull();
    expect(onText).toHaveBeenCalledTimes(1);
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
