import type { Changes, Context } from "../changes";
import type {
  Assignment,
  MappingProfile,
  PendingBatch,
  PendingRow,
  Refusal,
  Side,
  State,
} from "../types";
import { proposedSide } from "./direction";
import { flagDuplicates } from "./duplicates";
import { uncategorisedAssignment } from "./review";
import { parseRecords, type LayoutRefusalCode } from "./rows";
import { pairTransfers, type Pair } from "./transfers";
import { usualChoices, type UsualChoice } from "./usual";

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
 * What a parsed row starts with (data-model.md, creating a batch): its suggested transfer, which
 * keeps a usual category for turning the switch off, else its usual choice marked as such, else its
 * side's "Uncategorised" (FR-142, FR-146, FR-158).
 */
function startingAssignment(
  state: State,
  side: Side,
  pair: Pair | undefined,
  usual: UsualChoice | undefined,
): Assignment {
  if (pair) {
    return {
      type: "transfer",
      counterAccountId: pair.accountId,
      pairedTransactionId: pair.transactionId,
      ...(usual?.type === "category" ? { usualCategoryId: usual.categoryId } : {}),
    };
  }
  if (usual?.type === "category") return { ...usual, usual: true };
  if (usual?.type === "transfer") return { ...usual, usual: true };
  return uncategorisedAssignment(state.categories, side);
}

/**
 * The pending batch of a tokenised file (contracts/csv-import.md, pipeline steps 4–7). Any
 * other parsed row starts in its side's "Uncategorised" (FR-029), and a flagged row starts excluded
 * (FR-025). A row not flagged that has its other side in the ledger starts as the suggested
 * transfer to that side's account (FR-142); a row whose vendor was usually put somewhere starts
 * there, marked as from earlier (FR-146). The batch holds no reference to the profile (FR-021).
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
  const pairs = pairTransfers(
    parsed.map((row) =>
      row.status === "parsed" ? { ...row, duplicate: duplicates.has(row.rowNumber) } : row,
    ),
    accountId,
    state.transactions,
    state.categories,
  );
  const usual = usualChoices(parsed, accountId, state.transactions, state.categories);
  const rows = parsed.map((row): PendingRow => {
    if (row.status === "unparsable") return row;
    const duplicate = duplicates.has(row.rowNumber);
    return {
      ...row,
      duplicate,
      included: !duplicate,
      assignment: startingAssignment(
        state,
        proposedSide(row.amountCents),
        pairs.get(row.rowNumber),
        usual.get(row.rowNumber),
      ),
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
