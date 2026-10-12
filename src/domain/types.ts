// The entities of data-model.md. Money is integer euro cents and dates are local `YYYY-MM-DD`
// strings (R-08); ids are created by the store and passed in (R-05).

export type AccountType = "checking" | "savings" | "credit-card" | "cash" | "other";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  openingBalanceCents: number;
}

export type Side = "expense" | "income";

/** A non-null role marks a protected category, which is found by role because it can be renamed. */
export type CategoryRole = "uncategorised" | "unaccounted";

export interface Category {
  id: string;
  side: Side;
  name: string;
  color: string;
  role: CategoryRole | null;
}

interface TransactionFields {
  id: string;
  /** Creation order; breaks ties between equal dates in the list (FR-016). */
  seq: number;
  date: string;
  amountCents: number;
  /** For a transfer, the account the money leaves. */
  accountId: string;
  description: string;
}

export interface CategorisedTransaction extends TransactionFields {
  kind: Side;
  categoryId: string;
}

export interface Transfer extends TransactionFields {
  kind: "transfer";
  destinationAccountId: string;
}

export type Transaction = CategorisedTransaction | Transfer;

export interface Budget {
  /** The key: at most one budget per category. */
  categoryId: string;
  limitCents: number;
}

export const DATE_FORMATS = [
  "DD.MM.YYYY",
  "DD.MM.YY",
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "YYYY-MM-DD",
  "DD-MM-YYYY",
] as const;

export type DateFormat = (typeof DATE_FORMATS)[number];

export const ENCODINGS = ["UTF-8", "Windows-1252", "ISO-8859-15", "UTF-16LE"] as const;

export type Encoding = (typeof ENCODINGS)[number];

export type DecimalSeparator = "," | ".";

/** `Column` is header text with a header row, and a 0-based position without one. */
export type AmountColumns<Column> =
  | { mode: "signed"; column: Column; invertSign: boolean }
  | { mode: "debit-credit"; debitColumn: Column; creditColumn: Column };

interface ProfileFields<Column> {
  id: string;
  name: string;
  dateColumn: Column;
  descriptionColumn: Column;
  /** `null`: review is ungrouped (FR-026). */
  counterpartyColumn: Column | null;
  amount: AmountColumns<Column>;
  dateFormat: DateFormat;
  decimalSeparator: DecimalSeparator;
  encoding: Encoding;
}

/** Every column ref in one profile is the same variant, chosen by `hasHeaderRow`. */
export type MappingProfile =
  | (ProfileFields<string> & { hasHeaderRow: true })
  | (ProfileFields<number> & { hasHeaderRow: false });

/** Lists name several records or columns at once, such as every column a file lacks. */
export type RefusalDetails = Readonly<Record<string, string | number | readonly string[]>>;

/** An expected outcome that is not a change, such as a broken rule (R-15). The UI words the code. */
export interface Refusal<Code extends string = string> {
  code: Code;
  details?: RefusalDetails;
}

export const ROW_FAILURE_CODES = [
  "date-missing",
  "date-unreadable",
  "amount-missing",
  "amount-unreadable",
  "negative-debit-credit",
  "debit-and-credit",
  "no-debit-or-credit",
] as const;

export type RowFailureCode = (typeof ROW_FAILURE_CODES)[number];

/** `suggested` marks a category Claude suggested, until the user assigns the row (FR-093). */
export type Assignment =
  | { type: "category"; categoryId: string; suggested?: true }
  | { type: "transfer"; counterAccountId: string };

interface RowFields {
  /** The record number in the file, counting a header row as 1, as a spreadsheet shows it. */
  rowNumber: number;
}

export interface UnparsableRow extends RowFields {
  status: "unparsable";
  cells: string[];
  failure: Refusal<RowFailureCode>;
}

export interface ParsedRow extends RowFields {
  status: "parsed";
  date: string;
  /** Signed effect on the batch account after sign inversion: negative is money out. */
  amountCents: number;
  description: string;
  /** `null` when unmapped or empty, so the row has no vendor (FR-026). */
  counterparty: string | null;
  duplicate: boolean;
  included: boolean;
  assignment: Assignment;
}

export type PendingRow = ParsedRow | UnparsableRow;

export interface PendingBatch {
  id: string;
  accountId: string;
  fileName: string;
  createdAt: string;
  /** In file order. */
  rows: PendingRow[];
}

export interface Settings {
  manualEntryAccountId: string;
}

/** The seven stores of the storage layout, held in memory (R-05). */
export interface State {
  accounts: readonly Account[];
  categories: readonly Category[];
  transactions: readonly Transaction[];
  budgets: readonly Budget[];
  profiles: readonly MappingProfile[];
  pendingBatch: PendingBatch | null;
  settings: Settings;
}
