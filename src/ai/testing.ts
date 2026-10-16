// Answers of OpenAI's Responses API, and the requests the app posts, for Vitest and for the
// Playwright stand-in (contracts/ai.md). Every answer streams as server-sent events (R-26). It
// imports nothing, so both can load it.

/** The content type of a streamed answer. */
export const EVENT_STREAM = "text/event-stream";

/** One server-sent event, as OpenAI writes it: its type, then its data as JSON. */
export function event(data: { type: string } & Record<string, unknown>): string {
  return `event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const createdEvent = () =>
  event({ type: "response.created", response: { id: "resp_test", status: "in_progress" } });

/** A part of the reasoning summary, which the app ignores. */
export const reasoningEvent = () =>
  event({
    type: "response.reasoning_summary_text.delta",
    item_id: "rs_test",
    output_index: 0,
    summary_index: 0,
    delta: "Looking at the data.",
  });

/** The next part of the answer's text. */
export const deltaEvent = (delta: string) =>
  event({
    type: "response.output_text.delta",
    item_id: "msg_test",
    output_index: 1,
    content_index: 0,
    delta,
  });

export const completedEvent = () =>
  event({ type: "response.completed", response: { id: "resp_test", status: "completed" } });

/** OpenAI fails the response after it began, such as on an error of its own. */
export const failedEvent = (message = "The server had an error.") =>
  event({
    type: "response.failed",
    response: { id: "resp_test", status: "failed", error: { code: "server_error", message } },
  });

/** OpenAI reports an error on the stream itself, such as too many requests. */
export const errorEvent = (message = "Rate limit reached.") =>
  event({ type: "error", code: "rate_limit_exceeded", message, param: null });

/** The answer was cut short, such as by its token limit. */
export const incompleteEvent = () =>
  event({
    type: "response.incomplete",
    response: {
      id: "resp_test",
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    },
  });

/** The model refuses instead of answering. */
export const refusalEvent = (refusal = "I can't help with that.") =>
  event({
    type: "response.refusal.delta",
    item_id: "msg_test",
    output_index: 1,
    content_index: 0,
    delta: refusal,
  });

/** The parts that `text` arrives in: `parts` deltas, the last one shorter. */
export function deltasOf(text: string, parts = 3): string[] {
  const size = Math.max(1, Math.ceil(text.length / parts));
  const deltas: string[] = [];
  for (let at = 0; at < text.length; at += size) deltas.push(text.slice(at, at + size));
  return deltas;
}

/** A whole streamed answer whose text is `text`, in a few deltas after a reasoning summary. */
export function responseText(text: string): string {
  return [
    createdEvent(),
    reasoningEvent(),
    ...deltasOf(text).map(deltaEvent),
    completedEvent(),
  ].join("");
}

/** A whole streamed answer whose text is `json`, as structured outputs give it. */
export const responseWith = (json: unknown) => responseText(JSON.stringify(json));

/** A response that carries `body` as server-sent events. */
export const streamed = (body: string | ReadableStream<Uint8Array>, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": EVENT_STREAM } });

/** A streamed response that the test feeds event by event, or in any pieces it likes. */
export function feedStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(started) {
      controller = started;
    },
  });
  const encoder = new TextEncoder();
  return {
    response: streamed(body),
    /** Sends the text of one or more events, or a piece of one. */
    send(...text: string[]) {
      controller.enqueue(encoder.encode(text.join("")));
    },
    /** Sends raw bytes, which may end inside a character. */
    sendBytes(bytes: Uint8Array) {
      controller.enqueue(bytes);
    },
    /** Ends the stream, as the server does after its last event. */
    end() {
      controller.close();
    },
    /** Breaks the stream off, as a lost connection does. */
    breakOff() {
      controller.error(new TypeError("network error"));
    },
  };
}

/** OpenAI's JSON for a failure it reports itself, such as a rejected key. */
export function openAiError(message: string) {
  return { error: { message, type: "invalid_request_error", param: null, code: null } };
}

/** The body the app posts to the AI route (contracts/ai.md, request). */
export interface PostedRequest {
  model: string;
  store: boolean;
  stream: boolean;
  instructions: string;
  input: { role: "user" | "assistant"; content: string }[];
  text: { format: { type: string; name: string; strict: boolean; schema: unknown } };
}

/** The line after which a finance chat question's instructions hold its context as JSON. */
const DATA_LINE = "\nData:\n";

/** The context a finance chat question sent, read back from its instructions (contracts/ai.md). */
export function chatContextOf(request: PostedRequest): unknown {
  const at = request.instructions.lastIndexOf(DATA_LINE);
  if (at < 0) throw new Error("The instructions hold no Data: line");
  return JSON.parse(request.instructions.slice(at + DATA_LINE.length));
}
