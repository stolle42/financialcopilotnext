import { budgetProgress } from "@/domain/budgets";
import { chatContext, type ChatContext } from "@/domain/chat";
import { monthOf } from "@/domain/dates";
import {
  suggestionCategories,
  suggestionExamples,
  type Suggestion,
  type SuggestionRequest,
} from "@/domain/import/suggestions";
import { nameKey } from "@/domain/names";
import type { CategorisedTransaction, State } from "@/domain/types";

// The pure parts of the model check of FR-131 (R-32): the hold-out of the suggestions, their
// score, the facts printed beside the chat's answers, and the order in which models are checked.
// scripts/check-models.ts asks OpenAI with them; it runs only by hand, never in npm test or CI.

/** The order the models are checked in, the default first (R-32). */
export const CHECK_ORDER = ["gpt-5.4-mini", "gpt-5.6-luna", "gpt-6.1-sol"] as const;

/** How many transactions the suggestions' check holds out, and how many it needs right. */
export const HELD_OUT = 100;
export const RIGHT_TO_PASS = 90;

/** A held-out row's category, which the request hides. */
export interface Expected {
  rowNumber: number;
  category: string;
}

const newestFirst = (a: CategorisedTransaction, b: CategorisedTransaction) =>
  a.date === b.date ? b.seq - a.seq : a.date < b.date ? 1 : -1;

/**
 * The suggestions' request: the newest 100 categorised expenses and incomes as rows numbered from
 * 1, with their categories hidden, and the examples built from the rest as `suggestionRequest`
 * builds them (R-29, R-32). `expected` holds each row's category.
 */
export function holdOut(state: State): { request: SuggestionRequest; expected: Expected[] } {
  const categories = new Map(state.categories.map((c) => [c.id, c]));
  const held = state.transactions
    .filter((t): t is CategorisedTransaction => t.kind !== "transfer")
    .filter((t) => categories.get(t.categoryId)?.role === null && t.description.trim() !== "")
    .sort(newestFirst)
    .slice(0, HELD_OUT);
  const heldIds = new Set(held.map((t) => t.id));
  const rest: State = {
    ...state,
    transactions: state.transactions.filter((t) => !heldIds.has(t.id)),
  };
  return {
    request: {
      rows: held.map((t, index) => ({
        rowNumber: index + 1,
        side: t.kind,
        counterparty: null,
        description: t.description,
      })),
      categories: suggestionCategories(state.categories),
      examples: suggestionExamples(rest),
    },
    expected: held.map((t, index) => ({
      rowNumber: index + 1,
      category: categories.get(t.categoryId)!.name,
    })),
  };
}

/**
 * How many rows the suggestions got right: those whose first suggestion names the held-out
 * category by name key (R-08). Another category, `null`, a row left out or one not sent is wrong.
 */
export function scoreSuggestions(
  expected: readonly Expected[],
  suggestions: readonly Suggestion[],
): number {
  const categoryOf = new Map(expected.map((entry) => [entry.rowNumber, nameKey(entry.category)]));
  const seen = new Set<number>();
  let right = 0;
  for (const { rowNumber, category } of suggestions) {
    if (seen.has(rowNumber)) continue;
    seen.add(rowNumber);
    if (category !== null && categoryOf.get(rowNumber) === nameKey(category)) right += 1;
  }
  return right;
}

export function suggestionsPass(right: number): boolean {
  return right >= RIGHT_TO_PASS;
}

/** What the app works out, which the owner checks each chat answer against (R-32). */
export interface ChatFacts {
  budgets: { category: string; spentCents: number; limitCents: number; overLimit: boolean }[];
  months: ChatContext["months"];
  priceChanges: { description: string; fromCents: number; toCents: number; month: string }[];
}

/**
 * Each budget of today's month against its limit, each month's totals by category as the chat's
 * data holds them, and each change in the amount of a payment made more than once, by its
 * description's name key, oldest first.
 */
export function chatFacts(state: State, today: string): ChatFacts {
  const budgets = budgetProgress(state, monthOf(today)).map((progress) => ({
    category: progress.category.name,
    spentCents: progress.spentCents,
    limitCents: progress.limitCents,
    overLimit: progress.overLimit,
  }));

  const payments = new Map<string, CategorisedTransaction[]>();
  for (const transaction of state.transactions) {
    if (transaction.kind !== "expense" || transaction.description.trim() === "") continue;
    const key = nameKey(transaction.description);
    payments.set(key, [...(payments.get(key) ?? []), transaction]);
  }
  const priceChanges: ChatFacts["priceChanges"] = [];
  for (const repeated of payments.values()) {
    const oldestFirst = [...repeated].sort(newestFirst).reverse();
    oldestFirst.slice(1).forEach((payment, index) => {
      const before = oldestFirst[index]!;
      if (payment.amountCents === before.amountCents) return;
      priceChanges.push({
        description: payment.description.trim(),
        fromCents: before.amountCents,
        toCents: payment.amountCents,
        month: monthOf(payment.date),
      });
    });
  }
  priceChanges.sort((a, b) => a.month.localeCompare(b.month));

  return { budgets, months: chatContext(state, today).months, priceChanges };
}

/** What one step found for one model; `detail` is printed with it. */
export interface StepResult {
  name: string;
  passed: boolean;
  detail?: string;
}

/** One part of the check, such as the suggestions or one chat question. */
export interface CheckStep {
  name: string;
  run: (model: string) => Promise<StepResult>;
}

export interface ModelResult {
  model: string;
  passed: boolean;
  steps: StepResult[];
}

/**
 * Checks each model in turn through `steps`, in order. A model's first failure, or a step that
 * throws, ends its check, and the next model starts (R-32).
 */
export async function checkModels(
  models: readonly string[],
  steps: readonly CheckStep[],
): Promise<ModelResult[]> {
  const results: ModelResult[] = [];
  for (const model of models) {
    const done: StepResult[] = [];
    for (const step of steps) {
      let result: StepResult;
      try {
        result = await step.run(model);
      } catch (error) {
        result = { name: step.name, passed: false, detail: String(error) };
      }
      done.push(result);
      if (!result.passed) break;
    }
    results.push({ model, passed: done.every((result) => result.passed), steps: done });
  }
  return results;
}
