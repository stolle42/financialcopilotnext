import type { Refusal } from "@/domain/types";
import type { z } from "@/files/zod";
import { AI_PATH } from "./path";

// The one code that makes a request: both AI features post to the local route, which passes the
// request on to OpenAI's Responses API, and read the answer as it streams back (contracts/ai.md;
// R-24, R-26). Every failure becomes a code; nothing rejects.

export const OPENAI_MODEL = "gpt-6.1-sol";

/** How long the app waits for a whole answer, below Firefox's own 300 seconds (FR-094). */
export const AI_TIMEOUT_MS = 4 * 60 * 1000;

export type AiRefusalCode = "ai-unreachable" | "ai-failed" | "ai-timeout" | "ai-answer-invalid";

export type AiFailure = Refusal<AiRefusalCode>;

/** How long the key check waits for OpenAI's answer (SC-021). */
export const KEY_CHECK_TIMEOUT_MS = 10_000;

export type KeyCheckFailureCode = "ai-key-not-accepted" | "ai-key-check-unreachable";

/**
 * Asks OpenAI whether it accepts `apiKey`, with a request that carries the key and nothing else
 * (FR-127, contracts/ai.md, key check). A 403 still accepts the key: OpenAI knows it, and only
 * this listing is out of its reach. Gives `cancelled` when `signal` aborts; never rejects.
 */
export async function checkKey(
  apiKey: string,
  signal: AbortSignal,
): Promise<"accepted" | "cancelled" | Refusal<KeyCheckFailureCode>> {
  if (signal.aborted) return "cancelled";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), KEY_CHECK_TIMEOUT_MS);
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel);
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      credentials: "omit",
      signal: controller.signal,
    });
    if (signal.aborted) return "cancelled";
    if (response.ok || response.status === 403) return "accepted";
    return { code: response.status === 401 ? "ai-key-not-accepted" : "ai-key-check-unreachable" };
  } catch {
    return signal.aborted ? "cancelled" : { code: "ai-key-check-unreachable" };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

/** What one AI feature asks: its prompt, and the strict schema and zod check of its answer. */
export interface AiRequest<Answer> {
  /** The format's name, which tells the features apart (contracts/ai.md, request). */
  name: string;
  instructions: string;
  input: AiMessage[];
  /** The JSON Schema OpenAI's structured output follows. */
  schema: Record<string, unknown>;
  answer: z.ZodType<Answer>;
}

const EVENT_STREAM = "text/event-stream";

/** OpenAI reports its own failures as `{ error: { message } }`, with any status (R-24). */
async function isOpenAiError(response: Response): Promise<boolean> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } } | null;
    return typeof body?.error?.message === "string";
  } catch {
    return false;
  }
}

type Reading = { text: string } | { code: AiRefusalCode };

/** What one server-sent event means for the answer: more text, its end, a failure, or nothing. */
function readEvent(raw: string, text: string): Reading | { delta: string } | null {
  const data = raw
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(line.startsWith("data: ") ? 6 : 5))
    .join("\n");
  if (data === "") return null;
  let event: { type?: unknown; delta?: unknown };
  try {
    event = JSON.parse(data) as typeof event;
  } catch {
    return { code: "ai-answer-invalid" };
  }
  switch (event.type) {
    case "response.output_text.delta":
      return typeof event.delta === "string"
        ? { delta: event.delta }
        : { code: "ai-answer-invalid" };
    case "response.completed":
      return { text };
    case "response.failed":
    case "error":
      return { code: "ai-failed" };
    case "response.incomplete":
    case "response.refusal.delta":
    case "response.refusal.done":
      return { code: "ai-answer-invalid" };
    default:
      return null;
  }
}

/**
 * Reads the events of `response` until the answer completes, reporting the text so far after
 * each delta. Events that break off, or end before the answer completes, mean the AI could not
 * be reached. Aborting `signal` stops reading.
 */
async function readAnswer(
  response: Response,
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<Reading> {
  const reader = response.body?.getReader();
  if (!reader) return { code: "ai-unreachable" };
  const stop = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener("abort", stop);
  const decoder = new TextDecoder();
  let pending = "";
  let text = "";
  try {
    for (;;) {
      let part: ReadableStreamReadResult<Uint8Array>;
      try {
        part = await reader.read();
      } catch {
        return { code: "ai-unreachable" };
      }
      if (part.done || signal.aborted) return { code: "ai-unreachable" };
      pending += decoder.decode(part.value, { stream: true }).replace(/\r\n?/g, "\n");
      // An event ends at a blank line; a piece may end anywhere inside one.
      for (let end = pending.indexOf("\n\n"); end >= 0; end = pending.indexOf("\n\n")) {
        const raw = pending.slice(0, end);
        pending = pending.slice(end + 2);
        const meaning = readEvent(raw, text);
        if (meaning === null) continue;
        if (!("delta" in meaning)) return meaning;
        text += meaning.delta;
        onText(text);
      }
    }
  } finally {
    signal.removeEventListener("abort", stop);
    stop();
  }
}

/**
 * Posts `request` and gives its answer, checked against the feature's schema, a failure, or
 * `null` when `signal` aborts first. `onText` gets the answer's text so far as it streams.
 */
export async function askOpenAi<Answer>(
  request: AiRequest<Answer>,
  signal: AbortSignal,
  onText?: (text: string) => void,
): Promise<Answer | AiFailure | null> {
  if (signal.aborted) return null;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, AI_TIMEOUT_MS);
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel);

  // A cancelled request is no failure, and a request that ran out of time is a timeout.
  const failure = (code: AiRefusalCode): AiFailure | null =>
    signal.aborted ? null : { code: timedOut ? "ai-timeout" : code };

  try {
    let response: Response;
    try {
      response = await fetch(AI_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          store: false,
          stream: true,
          instructions: request.instructions,
          input: request.input,
          text: {
            format: {
              type: "json_schema",
              name: request.name,
              strict: true,
              schema: request.schema,
            },
          },
        }),
        signal: controller.signal,
      });
    } catch {
      return failure("ai-unreachable");
    }
    if (!response.ok) {
      return failure((await isOpenAiError(response)) ? "ai-failed" : "ai-unreachable");
    }
    if (!response.headers.get("content-type")?.startsWith(EVENT_STREAM)) {
      return failure("ai-answer-invalid");
    }

    const reading = await readAnswer(response, controller.signal, (text) => {
      if (!controller.signal.aborted) onText?.(text);
    });
    if ("code" in reading) return failure(reading.code);
    if (signal.aborted) return null;
    let json: unknown;
    try {
      json = JSON.parse(reading.text);
    } catch {
      return failure("ai-answer-invalid");
    }
    const answer = request.answer.safeParse(json);
    return answer.success ? answer.data : failure("ai-answer-invalid");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
