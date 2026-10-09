import type { Changes, Context } from "./changes";
import { protectedCategory } from "./categories";
import { isCalendarDate } from "./dates";
import type { Category, Refusal, Side, State, Transaction } from "./types";

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

/** A form field that can be invalid, and the code shown under it (FR-068). */
export type DraftField = "amount" | "date" | "destination";
export type DraftFieldCode =
  | "amount-invalid"
  | "date-invalid"
  | "transfer-destination-missing"
  | "transfer-needs-second-account";

export interface DraftInvalid extends Refusal<"draft-invalid"> {
  details: Partial<Record<DraftField, DraftFieldCode>>;
}

/**
 * A category the form never offers, so this guards the rule rather than informing the user:
 * the other side, or "Unaccounted" outside an edited reconciliation entry (FR-030).
 */
export type CategoryNotAllowed = Refusal<"category-not-allowed">;

/** The form's values for editing an existing transaction. */
export function draftOf(transaction: Transaction): Draft {
  const fields: DraftFields = {
    id: transaction.id,
    amountCents: transaction.amountCents,
    accountId: transaction.accountId,
    date: transaction.date,
    description: transaction.description,
  };
  return transaction.kind === "transfer"
    ? { ...fields, kind: "transfer", destinationAccountId: transaction.destinationAccountId }
    : { ...fields, kind: transaction.kind, categoryId: transaction.categoryId };
}

function fieldErrors(state: State, draft: Draft): DraftInvalid["details"] {
  const errors: DraftInvalid["details"] = {};
  const amount = draft.amountCents;
  if (amount === null || !Number.isSafeInteger(amount) || amount < 0) {
    errors.amount = "amount-invalid";
  }
  if (!isCalendarDate(draft.date)) errors.date = "date-invalid";
  if (draft.kind === "transfer") {
    const destination = state.accounts.find(
      (a) => a.id === draft.destinationAccountId && a.id !== draft.accountId,
    );
    if (state.accounts.length < 2) errors.destination = "transfer-needs-second-account";
    else if (!destination) errors.destination = "transfer-destination-missing";
  }
  return errors;
}

function categoryAllowed(state: State, draft: Draft & { kind: Side }): boolean {
  const category = state.categories.find((c) => c.id === draft.categoryId);
  if (category?.side !== draft.kind) return false;
  if (category.role !== "unaccounted") return true;
  const edited = state.transactions.find((t) => t.id === draft.id);
  return edited !== undefined && edited.kind !== "transfer" && edited.categoryId === category.id;
}

/**
 * Validates the form (FR-010, FR-011) and books it. A new transaction gets the next `seq` and
 * becomes the manual-entry default account; an edit keeps both (data-model.md, state transitions).
 */
export function saveDraft(
  state: State,
  draft: Draft,
  context: Context,
): Changes | DraftInvalid | CategoryNotAllowed {
  if (!state.accounts.some((a) => a.id === draft.accountId)) {
    throw new Error(`No account ${draft.accountId}`);
  }
  const errors = fieldErrors(state, draft);
  if (Object.keys(errors).length > 0) return { code: "draft-invalid", details: errors };
  if (draft.kind !== "transfer" && !categoryAllowed(state, draft)) {
    return { code: "category-not-allowed" };
  }

  const edited = draft.id === null ? null : state.transactions.find((t) => t.id === draft.id);
  if (edited === undefined) throw new Error(`No transaction ${draft.id}`);
  const fields = {
    id: edited?.id ?? context.newId(),
    seq: edited?.seq ?? state.transactions.reduce((max, t) => Math.max(max, t.seq), 0) + 1,
    date: draft.date,
    amountCents: draft.amountCents as number,
    accountId: draft.accountId,
    description: draft.description.trim(),
  };
  const transaction: Transaction =
    draft.kind === "transfer"
      ? { ...fields, kind: "transfer", destinationAccountId: draft.destinationAccountId as string }
      : { ...fields, kind: draft.kind, categoryId: draft.categoryId };

  return edited
    ? { transactions: { put: [transaction] } }
    : {
        transactions: { put: [transaction] },
        settings: { put: { ...state.settings, manualEntryAccountId: draft.accountId } },
      };
}

export function deleteTransaction(state: State, id: string): Changes {
  if (!state.transactions.some((t) => t.id === id)) throw new Error(`No transaction ${id}`);
  return { transactions: { delete: [id] } };
}

export interface TransactionFilters {
  accountId?: string | null;
  categoryId?: string | null;
  /** The first and last date to list, each included (R-14). */
  from?: string | null;
  to?: string | null;
}

/** Whether a transaction touches the account, as its source or as a transfer's destination. */
function touches(transaction: Transaction, accountId: string): boolean {
  return (
    transaction.accountId === accountId ||
    (transaction.kind === "transfer" && transaction.destinationAccountId === accountId)
  );
}

/** Newest first, the later entry first on the same date, then filtered (FR-016). */
export function listTransactions(
  transactions: readonly Transaction[],
  filters: TransactionFilters,
): Transaction[] {
  const { accountId, categoryId, from, to } = filters;
  return transactions
    .filter((t) => !accountId || touches(t, accountId))
    .filter((t) => !categoryId || (t.kind !== "transfer" && t.categoryId === categoryId))
    .filter((t) => (!from || t.date >= from) && (!to || t.date <= to))
    .sort((a, b) => (a.date === b.date ? b.seq - a.seq : a.date < b.date ? 1 : -1));
}
