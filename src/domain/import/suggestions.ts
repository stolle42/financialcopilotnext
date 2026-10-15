import type { Changes } from "../changes";
import { protectedCategory, sortCategories } from "../categories";
import { nameKey } from "../names";
import type { Category, CategorisedTransaction, ParsedRow, Refusal, Side, State } from "../types";
import { proposedSide } from "./direction";
import { reviewView, type ReviewView } from "./groups";

// Category suggestions by Claude: which rows a request sends, what it holds, and how an answer
// fills the batch (FR-090 – FR-093, contracts/categoriser.md).

/** At most this many rows per request (FR-090). */
export const MAX_SUGGESTION_ROWS = 300;
/** At most this many of the user's earlier decisions per request (FR-091). */
export const MAX_SUGGESTION_EXAMPLES = 100;

/** The batch was confirmed, discarded or replaced while Claude answered (FR-092). */
export type SuggestionRefusalCode = "suggestions-outdated";

/** The body of a request (contracts/categoriser.md, request). */
export interface SuggestionRequest {
  rows: { rowNumber: number; side: Side; counterparty: string | null; description: string }[];
  categories: Record<Side, string[]>;
  examples: { side: Side; description: string; category: string }[];
}

/** One entry of an answer: a category name for a row, or `null` (contracts/categoriser.md). */
export interface Suggestion {
  rowNumber: number;
  category: string | null;
}

/** The batch a request was built for, and the rows it sent. */
export interface SentRows {
  batchId: string;
  rowNumbers: readonly number[];
}

/** A side's categories a suggestion may name: neither "Uncategorised" nor "Unaccounted". */
const ordinaryCategories = (categories: readonly Category[], side: Side) =>
  sortCategories(categories, side).filter((c) => c.role === null);

function holdsUncategorised(row: ParsedRow, categories: readonly Category[]): boolean {
  const uncategorised = protectedCategory(
    categories,
    proposedSide(row.amountCents),
    "uncategorised",
  );
  return row.assignment.type === "category" && row.assignment.categoryId === uncategorised.id;
}

const hasText = (row: ParsedRow) => row.description.trim() !== "" || row.counterparty !== null;

/**
 * The rows a request sends, in review order: rows under review still in their side's
 * "Uncategorised", with some text, on a side with a category to suggest; at most 300 (FR-090).
 */
export function suggestableRows(view: ReviewView, categories: readonly Category[]): ParsedRow[] {
  const offers = {
    expense: ordinaryCategories(categories, "expense").length > 0,
    income: ordinaryCategories(categories, "income").length > 0,
  };
  return [...view.groups.flatMap((group) => group.rows), ...view.plainRows]
    .filter(
      (row) =>
        offers[proposedSide(row.amountCents)] &&
        hasText(row) &&
        holdsUncategorised(row, categories),
    )
    .slice(0, MAX_SUGGESTION_ROWS);
}

/** The newest decision for each side and description, newest first, at most 100 (FR-091). */
function examples(state: State): SuggestionRequest["examples"] {
  const categoriesById = new Map(state.categories.map((c) => [c.id, c]));
  const newestFirst = state.transactions
    .filter((t): t is CategorisedTransaction => t.kind !== "transfer")
    .sort((a, b) => (a.date === b.date ? b.seq - a.seq : a.date < b.date ? 1 : -1));
  const seen = new Set<string>();
  const found: SuggestionRequest["examples"] = [];
  for (const transaction of newestFirst) {
    const category = categoriesById.get(transaction.categoryId);
    const description = transaction.description.trim();
    const key = `${transaction.kind} ${nameKey(description)}`;
    if (category?.role !== null || description === "" || seen.has(key)) continue;
    seen.add(key);
    found.push({ side: transaction.kind, description, category: category.name });
    if (found.length === MAX_SUGGESTION_EXAMPLES) break;
  }
  return found;
}

/**
 * The request for the pending batch: the rows to suggest for, the category names and earlier
 * decisions, and nothing else; no amount, date or account (FR-091).
 */
export function suggestionRequest(state: State): SuggestionRequest {
  if (!state.pendingBatch) throw new Error("No pending batch");
  const rows = suggestableRows(reviewView(state.pendingBatch), state.categories);
  const names = (side: Side) => ordinaryCategories(state.categories, side).map((c) => c.name);
  return {
    rows: rows.map((row) => ({
      rowNumber: row.rowNumber,
      side: proposedSide(row.amountCents),
      counterparty: row.counterparty,
      description: row.description,
    })),
    categories: { expense: names("expense"), income: names("income") },
    examples: examples(state),
  };
}

/**
 * Fills each sent row that still holds "Uncategorised" with the category its suggestion names on
 * the row's side, marked as suggested; everything else in the answer is ignored (FR-092, FR-093).
 */
export function applySuggestions(
  state: State,
  sent: SentRows,
  suggestions: readonly Suggestion[],
): { changes: Changes; filled: number } | Refusal<SuggestionRefusalCode> {
  const batch = state.pendingBatch;
  if (!batch || batch.id !== sent.batchId) return { code: "suggestions-outdated" };

  // The first entry for a row counts, even when it names no category.
  const named = new Map<number, string | null>();
  for (const { rowNumber, category } of suggestions) {
    if (!named.has(rowNumber)) named.set(rowNumber, category);
  }
  const wasSent = new Set(sent.rowNumbers);

  let filled = 0;
  const rows = batch.rows.map((row) => {
    const name = named.get(row.rowNumber);
    if (row.status !== "parsed" || !row.included || !wasSent.has(row.rowNumber) || !name) {
      return row;
    }
    if (!holdsUncategorised(row, state.categories)) return row;
    const category = ordinaryCategories(state.categories, proposedSide(row.amountCents)).find(
      (c) => nameKey(c.name) === nameKey(name),
    );
    if (!category) return row;
    filled += 1;
    return {
      ...row,
      assignment: { type: "category" as const, categoryId: category.id, suggested: true as const },
    };
  });
  return { changes: filled ? { pendingBatch: { put: [{ ...batch, rows }] } } : {}, filled };
}
