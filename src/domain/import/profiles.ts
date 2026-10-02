import type { Changes, Context } from "../changes";
import { isNameTaken, nameKey } from "../names";
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
  const roles = unassignedRoles(draft);
  if (roles.length > 0) return { code: "profile-columns-incomplete", details: { roles } };

  // Every required column is assigned now, which is all that separates a draft from a profile.
  const profile = {
    ...draft,
    id: draft.id ?? context.newId(),
    name: draft.name.trim(),
  } as MappingProfile;
  return { profiles: { put: [profile] } };
}

/** Removes a profile; a pending batch keeps its parsed rows (FR-021). */
export function deleteProfile(state: State, id: string): Changes {
  if (!state.profiles.some((p) => p.id === id)) throw new Error(`No profile ${id}`);
  return { profiles: { delete: [id] } };
}
