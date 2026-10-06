import type { Changes, Context } from "../changes";
import type { MappingProfile, PendingBatch, PendingRow, Refusal, State } from "../types";
import { proposedSide } from "./direction";
import { flagDuplicates } from "./duplicates";
import { uncategorisedAssignment } from "./review";
import { parseRecords, type LayoutRefusalCode } from "./rows";

export type BatchRefusalCode =
  "import-batch-pending" | "import-account-missing" | LayoutRefusalCode;

/** At most one batch may be pending, so an import is refused before the file is read (FR-022). */
export function canStartImport(state: State): Refusal<"import-batch-pending"> | null {
  return state.pendingBatch ? { code: "import-batch-pending" } : null;
}

export interface BatchInput {
  /** `null` until the user chooses one: the Import screen has no default account. */
  accountId: string | null;
  profile: MappingProfile;
  fileName: string;
  /** A timestamp, for display only. */
  createdAt: string;
  records: readonly string[][];
}

/**
 * The pending batch of a tokenised file (contracts/csv-import.md, pipeline steps 4–7). Every
 * parsed row starts in its side's "Uncategorised" (FR-029), and a flagged row starts excluded
 * (FR-025). The batch holds no reference to the profile (FR-021).
 */
export function createBatch(
  state: State,
  input: BatchInput,
  context: Context,
): Changes | Refusal<BatchRefusalCode> {
  const pending = canStartImport(state);
  if (pending) return pending;
  const accountId = input.accountId;
  if (accountId === null || !state.accounts.some((a) => a.id === accountId)) {
    return { code: "import-account-missing" };
  }
  const parsed = parseRecords(input.records, input.profile);
  if (!Array.isArray(parsed)) return parsed;

  const duplicates = flagDuplicates(parsed, accountId, state.transactions);
  const rows = parsed.map((row): PendingRow => {
    if (row.status === "unparsable") return row;
    const duplicate = duplicates.has(row.rowNumber);
    return {
      ...row,
      duplicate,
      included: !duplicate,
      assignment: uncategorisedAssignment(state.categories, proposedSide(row.amountCents)),
    };
  });
  const batch: PendingBatch = {
    id: context.newId(),
    accountId,
    fileName: input.fileName,
    createdAt: input.createdAt,
    rows,
  };
  return { pendingBatch: { put: [batch] } };
}
