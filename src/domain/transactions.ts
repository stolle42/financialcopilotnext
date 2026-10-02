import { protectedCategory } from "./categories";
import type { Category, Side, State, Transaction } from "./types";

interface DraftFields {
  /** The transaction being edited, or `null` for a new one. */
  id: string | null;
  /** `null` while the amount text does not parse. */
  amountCents: number | null;
  accountId: string;
  date: string;
  description: string;
}

/**
 * The transaction form's values. An expense or income always holds a category of its side, and a
 * transfer a destination, which may still be unchosen (FR-011).
 */
export type Draft =
  | (DraftFields & { kind: Side; categoryId: string })
  | (DraftFields & { kind: "transfer"; destinationAccountId: string | null });

/** The defaults of FR-014, on the account of the last manual entry (FR-006). */
export function newDraft(state: State, today: string): Draft {
  return {
    id: null,
    kind: "expense",
    amountCents: 0,
    accountId: state.settings.manualEntryAccountId,
    categoryId: protectedCategory(state.categories, "expense", "uncategorised").id,
    date: today,
    description: "",
  };
}

/** A kind change never leaves a category from the other side, nor an empty one (FR-015). */
export function changeKind(
  draft: Draft,
  kind: Transaction["kind"],
  categories: readonly Category[],
): Draft {
  if (kind === draft.kind) return draft;
  const fields: DraftFields = {
    id: draft.id,
    amountCents: draft.amountCents,
    accountId: draft.accountId,
    date: draft.date,
    description: draft.description,
  };
  if (kind === "transfer") return { ...fields, kind, destinationAccountId: null };
  return { ...fields, kind, categoryId: protectedCategory(categories, kind, "uncategorised").id };
}

/** A transfer cannot go to its own account, so a destination equal to the new account is cleared. */
export function changeAccount(draft: Draft, accountId: string): Draft {
  if (draft.kind === "transfer" && draft.destinationAccountId === accountId) {
    return { ...draft, accountId, destinationAccountId: null };
  }
  return { ...draft, accountId };
}
