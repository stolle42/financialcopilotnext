import { readFileSync } from "node:fs";
import { test } from "vitest";
import { askCategoriser } from "@/ai/categoriser";
import { askFinanceChat } from "@/ai/chat";
import type { AiAccess } from "@/ai/openai";
import { chatContext } from "@/domain/chat";
import { parseBackup } from "@/files/backup";
import { financeChat } from "@/ui/messages";
import {
  CHECK_ORDER,
  HELD_OUT,
  chatFacts,
  checkModels,
  holdOut,
  scoreSuggestions,
  suggestionsPass,
  type CheckStep,
} from "./modelCheck";

// The model check of FR-131 (R-32, quickstart.md, model check), run by hand before a release that
// lists a model: npm run check:models, with OPENAI_API_KEY and DEMO_BACKUP set in the shell. The
// key is read from the environment only, and never printed or written to a file.

/** Each request is stopped after this long, and counts as failed (R-32). */
const REQUEST_LIMIT_MS = 60_000;

const OUT_OF_SCOPE = "What is the capital of France?";

/** The day after `date`, a `YYYY-MM-DD` date. */
function dayAfter(date: string): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

const seconds = (since: number) => `${((performance.now() - since) / 1000).toFixed(1)} s`;

test("check the models on the demonstration data (FR-131)", { timeout: 0 }, async () => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const backupPath = process.env.DEMO_BACKUP;
  if (!apiKey) throw new Error("Set OPENAI_API_KEY in this shell for the run.");
  if (!backupPath) throw new Error("Set DEMO_BACKUP to a backup of the demonstration data.");

  const parsed = parseBackup(readFileSync(backupPath, "utf-8"));
  if ("code" in parsed) throw new Error(`DEMO_BACKUP could not be loaded: ${parsed.code}`);
  const state = parsed;
  const last = state.transactions
    .map((t) => t.date)
    .sort()
    .at(-1);
  if (!last) throw new Error("DEMO_BACKUP holds no transactions.");
  const today = dayAfter(last);

  console.log(`Today: ${today}`);
  console.log("Facts the app works out:");
  console.log(JSON.stringify(chatFacts(state, today), null, 2));

  const { request, expected } = holdOut(state);
  const access = (model: string): AiAccess => ({ apiKey, model });

  const suggestions: CheckStep = {
    name: "suggestions",
    run: async (model) => {
      const started = performance.now();
      const answer = await askCategoriser(
        request,
        access(model),
        AbortSignal.timeout(REQUEST_LIMIT_MS),
      );
      if (answer === null) return { name: "suggestions", passed: false, detail: "over 60 s" };
      if (!Array.isArray(answer)) {
        return { name: "suggestions", passed: false, detail: answer.code };
      }
      const right = scoreSuggestions(expected, answer);
      return {
        name: "suggestions",
        passed: suggestionsPass(right),
        detail: `${right} of ${HELD_OUT} right in ${seconds(started)}`,
      };
    },
  };

  const context = chatContext(state, today);
  const question = (text: string): CheckStep => ({
    name: text,
    run: async (model) => {
      const started = performance.now();
      const answer = await askFinanceChat(
        context,
        [],
        text,
        access(model),
        AbortSignal.timeout(REQUEST_LIMIT_MS),
      );
      if (answer === null) return { name: text, passed: false, detail: "over 60 s" };
      if ("code" in answer) return { name: text, passed: false, detail: answer.code };
      const time = seconds(started);
      if (text === OUT_OF_SCOPE) {
        return {
          name: text,
          passed: !answer.inScope,
          detail: `inScope ${answer.inScope}, ${time}`,
        };
      }
      if (!answer.inScope) return { name: text, passed: false, detail: `out of scope, ${time}` };
      // Complete in time; the owner and Claude judge what it says against the facts (R-32).
      return {
        name: text,
        passed: true,
        detail: `${time}\n${answer.answer}\nSources: ${JSON.stringify(answer.sources)}`,
      };
    },
  });

  const results = await checkModels(CHECK_ORDER, [
    suggestions,
    ...financeChat.examples.map(question),
    question(OUT_OF_SCOPE),
  ]);

  for (const result of results) {
    console.log(`\n=== ${result.model}: ${result.passed ? "passed" : "failed"} ===`);
    for (const step of result.steps) {
      console.log(`\n[${step.passed ? "pass" : "FAIL"}] ${step.name}`);
      if (step.detail) console.log(step.detail);
    }
  }
});
