import type { Suggestion, SuggestionRequest } from "@/domain/import/suggestions";
import type { Refusal } from "@/domain/types";
import { z } from "@/files/zod";
import { CATEGORISER_URL } from "./endpoint";

// The one request the app makes outside its origin: Suggest categories, to the n8n workflow that
// asks Claude (contracts/categoriser.md, R-23). Every failure becomes a code; nothing rejects.

/** How long the app waits for an answer (FR-094). */
export const CATEGORISER_TIMEOUT_MS = 4 * 60 * 1000;

export type CategoriserRefusalCode =
  | "categoriser-unreachable"
  | "categoriser-timeout"
  | "categoriser-failed"
  | "categoriser-answer-invalid";

const answerSchema = z.object({
  suggestions: z.array(z.object({ rowNumber: z.number().int(), category: z.string().nullable() })),
});

/**
 * Posts `request` to the workflow and gives its suggestions, a refusal, or `null` when `signal`
 * aborts first, as when the user leaves review (FR-090).
 */
export async function askCategoriser(
  request: SuggestionRequest,
  signal: AbortSignal,
): Promise<Suggestion[] | Refusal<CategoriserRefusalCode> | null> {
  if (signal.aborted) return null;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CATEGORISER_TIMEOUT_MS);
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel);

  // A cancelled request is no failure, and a request that ran out of time is a timeout.
  const failure = (code: CategoriserRefusalCode): Refusal<CategoriserRefusalCode> | null =>
    signal.aborted ? null : { code: timedOut ? "categoriser-timeout" : code };

  try {
    let response: Response;
    try {
      response = await fetch(CATEGORISER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch {
      return failure("categoriser-unreachable");
    }
    // n8n answers 404 for a workflow that is not published (contracts/categoriser.md, failures).
    if (response.status === 404) return failure("categoriser-unreachable");
    if (!response.ok) return failure("categoriser-failed");
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return failure("categoriser-answer-invalid");
    }
    if (signal.aborted) return null;
    const answer = answerSchema.safeParse(body);
    return answer.success ? answer.data.suggestions : failure("categoriser-answer-invalid");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
