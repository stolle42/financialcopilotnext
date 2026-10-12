import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SuggestionRequest } from "@/domain/import/suggestions";
import { CATEGORISER_TIMEOUT_MS, askCategoriser } from "./categoriser";
import { CATEGORISER_URL } from "./endpoint";

// contracts/categoriser.md: request, answer and failures; FR-094, R-23.

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

const ask = (signal = new AbortController().signal) => askCategoriser(request, signal);

describe("askCategoriser: the request", () => {
  test("posts the request as JSON to the workflow's address", async () => {
    fetchMock.mockResolvedValue(json({ suggestions: [] }));

    await ask();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(CATEGORISER_URL);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual(request);
  });
});

describe("askCategoriser: the answer", () => {
  test("gives the suggestions of a valid answer, without other keys", async () => {
    fetchMock.mockResolvedValue(
      json({
        suggestions: [
          { rowNumber: 2, category: "Groceries", reason: "a supermarket" },
          { rowNumber: 3, category: null },
        ],
        executionId: "42",
      }),
    );

    expect(await ask()).toStrictEqual([
      { rowNumber: 2, category: "Groceries" },
      { rowNumber: 3, category: null },
    ]);
  });

  test("gives an empty list when Claude suggests nothing", async () => {
    fetchMock.mockResolvedValue(json({ suggestions: [] }));
    expect(await ask()).toEqual([]);
  });
});

describe("askCategoriser: failures (contracts/categoriser.md, failures)", () => {
  test("gives categoriser-unreachable when the request cannot be sent", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await ask()).toEqual({ code: "categoriser-unreachable" });
  });

  test("gives categoriser-unreachable when the workflow is not published (404)", async () => {
    fetchMock.mockResolvedValue(json({ message: "The requested webhook is not registered." }, 404));
    expect(await ask()).toEqual({ code: "categoriser-unreachable" });
  });

  test.each([400, 500, 502, 503])("gives categoriser-failed for status %i", async (status) => {
    fetchMock.mockResolvedValue(json({ message: "Error in workflow" }, status));
    expect(await ask()).toEqual({ code: "categoriser-failed" });
  });

  test.each<[string, () => Response]>([
    ["a body that is not JSON", () => new Response("<html>Bad gateway</html>", { status: 200 })],
    ["an empty body", () => new Response(null, { status: 200 })],
    [
      "n8n's answer when it does not wait for the workflow",
      () => json({ message: "Workflow was started" }),
    ],
    ["the chain's whole item instead of its output", () => json({ output: { suggestions: [] } })],
    [
      "a row number that is not a number",
      () => json({ suggestions: [{ rowNumber: "2", category: "Groceries" }] }),
    ],
    ["a category that is not a name", () => json({ suggestions: [{ rowNumber: 2, category: 7 }] })],
    ["suggestions that are not a list", () => json({ suggestions: { rowNumber: 2 } })],
  ])("gives categoriser-answer-invalid for %s", async (_, response) => {
    fetchMock.mockResolvedValue(response());
    expect(await ask()).toEqual({ code: "categoriser-answer-invalid" });
  });

  test(`gives categoriser-timeout when no answer arrives within ${CATEGORISER_TIMEOUT_MS / 60000} minutes`, async () => {
    vi.useFakeTimers();
    hangingFetch();
    let result: unknown = "pending";
    void ask().then((value) => (result = value));

    await vi.advanceTimersByTimeAsync(CATEGORISER_TIMEOUT_MS - 1000);
    expect(result).toBe("pending");
    await vi.advanceTimersByTimeAsync(1000);

    expect(result).toEqual({ code: "categoriser-timeout" });
  });

  test("waits 4 minutes, longer than Opus needs for SC-001's 300 rows (R-23)", () => {
    expect(CATEGORISER_TIMEOUT_MS).toBe(4 * 60 * 1000);
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
    await expect(ask()).resolves.toEqual({ code: "categoriser-unreachable" });
  });
});
