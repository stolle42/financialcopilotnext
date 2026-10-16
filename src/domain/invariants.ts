import { isCalendarDate } from "./dates";
import { proposedSide } from "./import/direction";
import { nameKey } from "./names";
import {
  DATE_FORMATS,
  ENCODINGS,
  ROW_FAILURE_CODES,
  type Category,
  type ChatTurn,
  type MappingProfile,
  type PendingRow,
  type Refusal,
  type RefusalDetails,
  type State,
} from "./types";

/** One code per way a state can break the invariants of data-model.md. */
export type InvariantCode =
  | "id-duplicate"
  | "transaction-seq-duplicate"
  | "transaction-seq-invalid"
  | "account-name-missing"
  | "account-name-duplicate"
  | "category-role-count"
  | "category-name-missing"
  | "category-name-duplicate"
  | "category-color-invalid"
  | "transaction-date-invalid"
  | "transaction-amount-invalid"
  | "transaction-account-missing"
  | "transaction-category-invalid"
  | "transaction-fields-mixed"
  | "transaction-destination-invalid"
  | "budget-category-invalid"
  | "budget-limit-out-of-range"
  | "profile-name-missing"
  | "profile-name-duplicate"
  | "profile-column-mismatch"
  | "profile-setting-unsupported"
  | "pending-batch-account-missing"
  | "pending-row-number-duplicate"
  | "pending-row-date-invalid"
  | "pending-row-amount-invalid"
  | "pending-row-category-invalid"
  | "pending-row-suggestion-invalid"
  | "pending-row-transfer-invalid"
  | "pending-row-failure-unknown"
  | "settings-account-missing"
  | "conversation-question-missing"
  | "conversation-turn-invalid"
  | "conversation-source-invalid";

export type InvariantViolation = Refusal<InvariantCode>;

type Check = (state: State) => InvariantViolation | null;

function violation(code: InvariantCode, details: RefusalDetails): InvariantViolation {
  return { code, details };
}

/** The first key that appears twice, if any. */
function firstRepeat(keys: readonly (string | number)[]): string | number | undefined {
  const seen = new Set<string | number>();
  return keys.find((key) => (seen.has(key) ? true : (seen.add(key), false)));
}

/** The first item whose name is empty or repeats another's name key. */
function checkNames<Item extends { id: string; name: string }>(
  items: readonly Item[],
  codes: { missing: InvariantCode; duplicate: InvariantCode },
  idField: string,
): InvariantViolation | null {
  const seen = new Set<string>();
  for (const item of items) {
    const key = nameKey(item.name);
    if (key === "") return violation(codes.missing, { [idField]: item.id });
    if (seen.has(key)) return violation(codes.duplicate, { [idField]: item.id, name: item.name });
    seen.add(key);
  }
  return null;
}

const isSafeAmount = (cents: number) => Number.isSafeInteger(cents);

// 1. Ids are unique within each entity type; transaction seq values are unique.
const uniqueIds: Check = (state) => {
  const stores: [string, readonly string[]][] = [
    ["accounts", state.accounts.map((a) => a.id)],
    ["categories", state.categories.map((c) => c.id)],
    ["transactions", state.transactions.map((t) => t.id)],
    ["budgets", state.budgets.map((b) => b.categoryId)],
    ["profiles", state.profiles.map((p) => p.id)],
  ];
  for (const [store, ids] of stores) {
    const id = firstRepeat(ids);
    if (id !== undefined) return violation("id-duplicate", { store, id });
  }
  const invalid = state.transactions.find((t) => !Number.isSafeInteger(t.seq) || t.seq < 1);
  if (invalid) return violation("transaction-seq-invalid", { transactionId: invalid.id });
  const seq = firstRepeat(state.transactions.map((t) => t.seq));
  return seq === undefined ? null : violation("transaction-seq-duplicate", { seq });
};

// 2. Account names are non-empty and unique by name key.
const accountNames: Check = (state) =>
  checkNames(
    state.accounts,
    { missing: "account-name-missing", duplicate: "account-name-duplicate" },
    "accountId",
  );

// 3. One uncategorised and one unaccounted category per side; names; colours.
const categories: Check = (state) => {
  for (const side of ["expense", "income"] as const) {
    for (const role of ["uncategorised", "unaccounted"] as const) {
      const count = state.categories.filter((c) => c.side === side && c.role === role).length;
      if (count !== 1) return violation("category-role-count", { side, role, count });
    }
    const named = checkNames(
      state.categories.filter((c) => c.side === side),
      { missing: "category-name-missing", duplicate: "category-name-duplicate" },
      "categoryId",
    );
    if (named) return named;
  }
  const badColour = state.categories.find((c) => !/^#[0-9a-f]{6}$/i.test(c.color));
  return badColour
    ? violation("category-color-invalid", { categoryId: badColour.id, color: badColour.color })
    : null;
};

// 4. Every transaction is well-formed and references existing records.
const transactions: Check = (state) => {
  const accountIds = new Set(state.accounts.map((a) => a.id));
  const categoriesById = new Map(state.categories.map((c) => [c.id, c]));
  for (const t of state.transactions) {
    const transactionId = t.id;
    if (!isCalendarDate(t.date)) {
      return violation("transaction-date-invalid", { transactionId, date: t.date });
    }
    if (!isSafeAmount(t.amountCents) || t.amountCents < 0) {
      return violation("transaction-amount-invalid", { transactionId });
    }
    if (!accountIds.has(t.accountId)) {
      return violation("transaction-account-missing", { transactionId, accountId: t.accountId });
    }
    if (t.kind === "transfer") {
      if ("categoryId" in t) return violation("transaction-fields-mixed", { transactionId });
      if (!accountIds.has(t.destinationAccountId) || t.destinationAccountId === t.accountId) {
        return violation("transaction-destination-invalid", { transactionId });
      }
    } else {
      if ("destinationAccountId" in t) {
        return violation("transaction-fields-mixed", { transactionId });
      }
      if (categoriesById.get(t.categoryId)?.side !== t.kind) {
        return violation("transaction-category-invalid", { transactionId });
      }
    }
  }
  return null;
};

// 5. Every budget is on an unprotected expense category, with a limit above zero.
const budgets: Check = (state) => {
  const categoriesById = new Map(state.categories.map((c) => [c.id, c]));
  for (const budget of state.budgets) {
    const category = categoriesById.get(budget.categoryId);
    if (category?.side !== "expense" || category.role !== null) {
      return violation("budget-category-invalid", { categoryId: budget.categoryId });
    }
    if (!isSafeAmount(budget.limitCents) || budget.limitCents <= 0) {
      return violation("budget-limit-out-of-range", { categoryId: budget.categoryId });
    }
  }
  return null;
};

function columnRefs(profile: MappingProfile): unknown[] {
  const amount =
    profile.amount.mode === "signed"
      ? [profile.amount.column]
      : [profile.amount.debitColumn, profile.amount.creditColumn];
  const counterparty = profile.counterpartyColumn === null ? [] : [profile.counterpartyColumn];
  return [profile.dateColumn, profile.descriptionColumn, ...counterparty, ...amount];
}

// 6. Profile names; column refs of the profile's header variant; supported settings.
const profiles: Check = (state) => {
  const named = checkNames(
    state.profiles,
    { missing: "profile-name-missing", duplicate: "profile-name-duplicate" },
    "profileId",
  );
  if (named) return named;
  for (const profile of state.profiles) {
    const profileId = profile.id;
    const fits = (ref: unknown) =>
      profile.hasHeaderRow
        ? typeof ref === "string"
        : Number.isSafeInteger(ref) && Number(ref) >= 0;
    if (!columnRefs(profile).every(fits)) {
      return violation("profile-column-mismatch", { profileId });
    }
    const settings: [string, readonly string[], string][] = [
      ["dateFormat", DATE_FORMATS, profile.dateFormat],
      ["decimalSeparator", [",", "."], profile.decimalSeparator],
      ["encoding", ENCODINGS, profile.encoding],
    ];
    const unsupported = settings.find(([, supported, value]) => !supported.includes(value));
    if (unsupported) {
      return violation("profile-setting-unsupported", { profileId, setting: unsupported[0] });
    }
  }
  return null;
};

function checkRow(
  row: PendingRow,
  batchAccountId: string,
  accountIds: Set<string>,
  categoriesById: Map<string, Category>,
): InvariantViolation | null {
  const rowNumber = row.rowNumber;
  if (row.status === "unparsable") {
    const known = (ROW_FAILURE_CODES as readonly string[]).includes(row.failure.code);
    return known ? null : violation("pending-row-failure-unknown", { rowNumber });
  }
  if (!isCalendarDate(row.date)) return violation("pending-row-date-invalid", { rowNumber });
  if (!isSafeAmount(row.amountCents)) return violation("pending-row-amount-invalid", { rowNumber });
  const assignment = row.assignment;
  if (assignment.type === "category") {
    const category = categoriesById.get(assignment.categoryId);
    if (category?.side !== proposedSide(row.amountCents) || category.role === "unaccounted") {
      return violation("pending-row-category-invalid", { rowNumber });
    }
    // The AI suggests only ordinary categories (FR-092).
    if (assignment.suggested && category.role !== null) {
      return violation("pending-row-suggestion-invalid", { rowNumber });
    }
  } else if (
    !accountIds.has(assignment.counterAccountId) ||
    assignment.counterAccountId === batchAccountId
  ) {
    return violation("pending-row-transfer-invalid", { rowNumber });
  }
  return null;
}

// 7. The pending batch references an existing account, and its rows are well-formed.
const pendingBatch: Check = (state) => {
  const batch = state.pendingBatch;
  if (!batch) return null;
  const accountIds = new Set(state.accounts.map((a) => a.id));
  if (!accountIds.has(batch.accountId)) {
    return violation("pending-batch-account-missing", { accountId: batch.accountId });
  }
  const rowNumber = firstRepeat(batch.rows.map((row) => row.rowNumber));
  if (rowNumber !== undefined) return violation("pending-row-number-duplicate", { rowNumber });
  const categoriesById = new Map(state.categories.map((c) => [c.id, c]));
  for (const row of batch.rows) {
    const broken = checkRow(row, batch.accountId, accountIds, categoriesById);
    if (broken) return broken;
  }
  return null;
};

// 8. The manual-entry default account exists.
const settings: Check = (state) => {
  const accountId = state.settings.manualEntryAccountId;
  return state.accounts.some((a) => a.id === accountId)
    ? null
    : violation("settings-account-missing", { accountId });
};

/** Whether the turn's follow-ups, if it has any, fit its marks and are one to three questions. */
function followUpsFit(turn: ChatTurn): boolean {
  const { followUps } = turn;
  if (followUps === undefined) return true;
  return (
    !turn.outOfScope &&
    !turn.stopped &&
    followUps.length >= 1 &&
    followUps.length <= 3 &&
    followUps.every((followUp) => followUp.trim() !== "") &&
    firstRepeat(followUps) === undefined
  );
}

// 9. Every turn of the conversation has a question, and an answer that fits its marks; its
// follow-ups, when present, are one to three distinct questions on a turn neither out of scope nor
// stopped; every source has a name and valid dates. A source's category or account need not exist
// (FR-110, FR-111).
const conversation: Check = (state) => {
  for (const [index, turn] of state.conversation.entries()) {
    const details = { turn: index + 1 };
    if (turn.question.trim() === "") return violation("conversation-question-missing", details);
    const fits = turn.outOfScope
      ? turn.answer === "" && turn.sources.length === 0 && !turn.stopped
      : turn.stopped
        ? turn.sources.length === 0
        : turn.answer.trim() !== "";
    if (!fits || !followUpsFit(turn)) return violation("conversation-turn-invalid", details);
    const sourceBroken = turn.sources.some(
      (source) =>
        source.name.trim() === "" ||
        !isCalendarDate(source.from) ||
        !isCalendarDate(source.to) ||
        source.from > source.to,
    );
    if (sourceBroken) return violation("conversation-source-invalid", details);
  }
  return null;
};

const checks: readonly Check[] = [
  uniqueIds,
  accountNames,
  categories,
  transactions,
  budgets,
  profiles,
  pendingBatch,
  settings,
  conversation,
];

/**
 * `null` when the state satisfies every invariant of data-model.md, otherwise the first broken one,
 * with details that name the record. Restoring a backup reports it (FR-072).
 */
export function checkInvariants(state: State): InvariantViolation | null {
  for (const check of checks) {
    const broken = check(state);
    if (broken) return broken;
  }
  return null;
}
