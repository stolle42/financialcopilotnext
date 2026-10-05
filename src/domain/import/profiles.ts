import type { Changes, Context } from "../changes";
import { compareNames, isNameTaken, nameKey } from "../names";
import type {
  AmountColumns,
  DateFormat,
  DecimalSeparator,
  Encoding,
  MappingProfile,
  Refusal,
  State,
} from "../types";

export type ProfileRefusalCode =
  "profile-name-empty" | "profile-name-taken" | "profile-columns-incomplete";

/** The columns a profile must assign before it can be saved (FR-021). */
export type RequiredRole = "date" | "amount" | "description";

interface ProfileDraftFields<Column> {
  /** The profile being edited, or `null` for a new one. */
  id: string | null;
  name: string;
  dateColumn: Column | null;
  descriptionColumn: Column | null;
  counterpartyColumn: Column | null;
  amount: AmountColumns<Column | null>;
  dateFormat: DateFormat;
  decimalSeparator: DecimalSeparator;
  encoding: Encoding;
}

/** The profile editor's values: a mapping profile whose columns may still be unassigned. */
export type ProfileDraft =
  | (ProfileDraftFields<string> & { hasHeaderRow: true })
  | (ProfileDraftFields<number> & { hasHeaderRow: false });

function unassignedRoles(draft: ProfileDraft): RequiredRole[] {
  const amount = draft.amount;
  const amountAssigned =
    amount.mode === "signed"
      ? amount.column !== null
      : amount.debitColumn !== null && amount.creditColumn !== null;
  const assigned: [RequiredRole, boolean][] = [
    ["date", draft.dateColumn !== null],
    ["amount", amountAssigned],
    ["description", draft.descriptionColumn !== null],
  ];
  return assigned.filter(([, isAssigned]) => !isAssigned).map(([role]) => role);
}

/** A new profile: a header row, one signed column, nothing assigned yet, and UTF-8 (csv-import.md). */
export function newProfileDraft(): ProfileDraft {
  return {
    id: null,
    name: "",
    hasHeaderRow: true,
    dateColumn: null,
    descriptionColumn: null,
    counterpartyColumn: null,
    amount: { mode: "signed", column: null, invertSign: false },
    dateFormat: "DD.MM.YYYY",
    decimalSeparator: ",",
    encoding: "UTF-8",
  };
}

/** A saved profile, opened for editing. */
export function draftOfProfile(profile: MappingProfile): ProfileDraft {
  return profile;
}

function clearedAmount(amount: ProfileDraft["amount"]): AmountColumns<null> {
  return amount.mode === "signed"
    ? { mode: "signed", column: null, invertSign: amount.invertSign }
    : { mode: "debit-credit", debitColumn: null, creditColumn: null };
}

/** Columns are header texts with a header row and positions without one, so a switch resets them. */
export function withHeaderRow(draft: ProfileDraft, hasHeaderRow: boolean): ProfileDraft {
  if (draft.hasHeaderRow === hasHeaderRow) return draft;
  const cleared = {
    dateColumn: null,
    descriptionColumn: null,
    counterpartyColumn: null,
    amount: clearedAmount(draft.amount),
  };
  return hasHeaderRow
    ? { ...draft, ...cleared, hasHeaderRow: true }
    : { ...draft, ...cleared, hasHeaderRow: false };
}

/** One signed column, or debit and credit columns; changing the mode unassigns the amount. */
export function withAmountMode(
  draft: ProfileDraft,
  mode: ProfileDraft["amount"]["mode"],
): ProfileDraft {
  if (draft.amount.mode === mode) return draft;
  const amount: AmountColumns<null> =
    mode === "signed"
      ? { mode, column: null, invertSign: false }
      : { mode, debitColumn: null, creditColumn: null };
  return { ...draft, amount };
}

/**
 * The draft as a profile with `id`, once the date, amount and description have a column. The
 * preview parses with it, and saving stores it.
 */
export function profileOf(
  draft: ProfileDraft,
  id: string,
): MappingProfile | Refusal<"profile-columns-incomplete"> {
  const roles = unassignedRoles(draft);
  if (roles.length > 0) return { code: "profile-columns-incomplete", details: { roles } };
  // Every required column is assigned now, which is all that separates a draft from a profile.
  return { ...draft, id } as MappingProfile;
}

/**
 * Saves a new profile, or the edited one. Names are unique by name key (FR-021), and the date,
 * amount and description need a column. A pending batch holds its own parsed rows, so it never
 * changes here (data-model.md, pending batch).
 */
export function saveProfile(
  state: State,
  draft: ProfileDraft,
  context: Context,
): Changes | Refusal<ProfileRefusalCode> {
  if (draft.id !== null && !state.profiles.some((p) => p.id === draft.id)) {
    throw new Error(`No profile ${draft.id}`);
  }
  if (nameKey(draft.name) === "") return { code: "profile-name-empty" };
  if (isNameTaken(state.profiles, draft.name, draft.id ?? undefined)) {
    return { code: "profile-name-taken" };
  }
  const profile = profileOf({ ...draft, name: draft.name.trim() }, draft.id ?? context.newId());
  if ("code" in profile) return profile;
  return { profiles: { put: [profile] } };
}

/** Removes a profile; a pending batch keeps its parsed rows (FR-021). */
export function deleteProfile(state: State, id: string): Changes {
  if (!state.profiles.some((p) => p.id === id)) throw new Error(`No profile ${id}`);
  return { profiles: { delete: [id] } };
}

/** Profiles by name, ignoring case (contracts/ui.md, list order). */
export function sortProfiles(profiles: readonly MappingProfile[]): MappingProfile[] {
  return [...profiles].sort((a, b) => compareNames(a.name, b.name));
}
