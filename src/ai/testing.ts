// Answers of OpenAI's Responses API, and the requests the app posts, for Vitest and for the
// Playwright stand-in (contracts/ai.md). It imports nothing, so both can load it.

/** A completed answer whose message holds `text`, after a reasoning item, as OpenAI sends it. */
export function responseText(text: string) {
  return {
    id: "resp_test",
    object: "response",
    status: "completed",
    output: [
      { id: "rs_test", type: "reasoning", summary: [] },
      {
        id: "msg_test",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
  };
}

/** A completed answer whose message holds `json`, as structured outputs give it. */
export const responseWith = (json: unknown) => responseText(JSON.stringify(json));

/** OpenAI's JSON for a failure it reports itself, such as a rejected key. */
export function openAiError(message: string) {
  return { error: { message, type: "invalid_request_error", param: null, code: null } };
}

/** The body the app posts to the AI route (contracts/ai.md, request). */
export interface PostedRequest {
  model: string;
  store: boolean;
  instructions: string;
  input: { role: "user" | "assistant"; content: string }[];
  text: { format: { type: string; name: string; strict: boolean; schema: unknown } };
}
