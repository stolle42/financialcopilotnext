import type { AccountRefusalCode, ReconcileRefusalCode } from "@/domain/accounts";
import type { BudgetRefusalCode } from "@/domain/budgets";
import type { CategoryRefusalCode } from "@/domain/categories";
import type { BatchRefusalCode } from "@/domain/import/batch";
import type { ProfileRefusalCode } from "@/domain/import/profiles";
import type { DraftFieldCode } from "@/domain/transactions";
import type { Refusal, RefusalDetails, RowFailureCode, Side } from "@/domain/types";
import type { DecodingRefusal } from "@/files/csv";
import type { StoreRefusalCode } from "@/store/store";
import { formatAmount } from "./format";

// The one message catalogue: every refusal and failure code, worded for the user (R-15,
// contracts/ui.md). No wording lives anywhere else.

/** Failures the app shell raises while starting or running (R-07, R-15). */
export type ShellFailureCode = "storage-unavailable" | "open-in-another-tab" | "unexpected-error";

/** Input the form itself cannot read, before any rule is checked. */
export type FieldInputCode = "balance-invalid" | "import-file-unreadable" | "period-invalid";

export type MessageCode =
  | StoreRefusalCode
  | ShellFailureCode
  | AccountRefusalCode
  | DraftFieldCode
  | FieldInputCode
  | ProfileRefusalCode
  | RowFailureCode
  | DecodingRefusal["code"]
  | BatchRefusalCode
  | BudgetRefusalCode
  | ReconcileRefusalCode
  | CategoryRefusalCode;

/** Plain wording, or wording built from the refusal's details, which may be absent. */
type Wording = string | ((details: RefusalDetails) => string);

const text = (value: RefusalDetails[string] | undefined) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

/** "a", "a and b", "a, b and c", each quoted when `quoted`. */
function list(value: RefusalDetails[string] | undefined, quoted = false): string {
  const items = (Array.isArray(value) ? value : [text(value as string)]).filter(Boolean);
  const shown = quoted ? items.map((item) => `"${item}"`) : items;
  return shown.length < 2
    ? (shown[0] ?? "")
    : `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
}

export const messages: Record<MessageCode, Wording> = {
  "save-failed":
    "Your change was not saved, and nothing has changed. Free up some disk space, then try again.",
  "storage-unavailable":
    "This browser does not let Financial Copilot store data, which happens in a private window or " +
    "when site data is blocked. Open the app in a normal window, or allow site data for this " +
    "site, then reload the page.",
  "open-in-another-tab":
    "Financial Copilot is already open in another tab or window. Use that one, or close it and " +
    "reload this page.",
  "unexpected-error": "Something went wrong. Your saved data is safe. Reload the page to continue.",
  "account-name-empty": "The account needs a name.",
  "account-name-taken": "An account with this name already exists. Choose another name.",
  "balance-invalid": "The balance must be a number with at most two decimals.",
  "period-invalid":
    "Enter a start date and an end date that exist, with the end on or after the start.",
  "amount-invalid": "The amount must be a number of zero or more, with at most two decimals.",
  "date-invalid": "Enter a date that exists, such as today.",
  "transfer-destination-missing": "Choose the account the money goes to.",
  "transfer-needs-second-account":
    "A transfer needs a second account to move money to. Create one under Accounts first.",
  "profile-name-empty": "The profile needs a name.",
  "profile-name-taken": "A profile with this name already exists. Choose another name.",
  "profile-columns-incomplete": (details) =>
    details.roles
      ? `Choose a column for the ${list(details.roles)}.`
      : "Choose a column for the date, the amount and the description.",
  "date-missing": "The date is empty.",
  "date-unreadable": (details) =>
    details.cell
      ? `"${text(details.cell)}" is not a date in the format ${text(details.format)}.`
      : "The date does not match the profile's date format, or does not exist.",
  "amount-missing": "The amount is empty.",
  "amount-unreadable": (details) =>
    details.cell
      ? `"${text(details.cell)}" is not an amount with "${text(details.decimalSeparator)}" ` +
        "as the decimal separator."
      : "The amount is not a number with the profile's decimal separator.",
  "negative-debit-credit": (details) =>
    `${details.cell ? `"${text(details.cell)}" is negative, but` : "A negative amount, but"} ` +
    "debit and credit amounts are written without a sign: the column says which way the money went.",
  "debit-and-credit": (details) =>
    details.debit
      ? `Both the debit (${text(details.debit)}) and the credit (${text(details.credit)}) hold ` +
        "an amount, so it is unclear which way the money went."
      : "Both the debit and the credit hold an amount, so it is unclear which way the money went.",
  "no-debit-or-credit": "Neither the debit nor the credit column holds an amount.",
  "import-decoding-failed": (details) =>
    `The file is not valid ${text(details.encoding) || "text in the profile's encoding"}. ` +
    "Choose another encoding in the profile; many banks use Windows-1252.",
  "import-missing-columns": (details) =>
    `The file has no column named ${list(details.columns, true) || "as the profile expects"}, ` +
    "which the profile expects. Check that this is the right file, or edit the profile.",
  "import-duplicate-header": (details) =>
    `The file has more than one column named ${list(details.column, true) || "the same"}, so ` +
    "the profile cannot tell which one to read.",
  "import-no-transactions": "The file contains no transactions.",
  "import-file-unreadable": "The file could not be read. Choose it again.",
  "import-account-missing": "Choose the account to import into.",
  "import-batch-pending":
    "An import is waiting for review. Confirm or discard it before you import another file.",
  "budget-limit-invalid": "The limit must be an amount above 0.00, with at most two decimals.",
  "category-name-empty": "The category needs a name.",
  "category-name-taken": (details) =>
    `There is already ${details.side === "income" ? "an income" : "an expense"} category with this ` +
    "name. Choose another name.",
  "category-color-invalid": "Choose one of the colours offered.",
  "category-protected": (details) =>
    (details.role === "unaccounted"
      ? "This category is where the app files the difference when you reconcile an account, so it "
      : "This category is where the app files imported rows you have not categorised and the " +
        "transactions of a category you delete, so it ") +
    "cannot be deleted. You can still rename it or change its colour.",
  "reconcile-already-matches":
    "This account already holds that amount, so nothing was booked. Enter a different amount to reconcile.",
};

const transactions = (count: number) => `${count} transaction${count === 1 ? "" : "s"}`;

/** Brief success messages after a write that leaves the screen (contracts/ui.md, shared patterns). */
export const notifications = {
  importConfirmed: (count: number, accountName: string) =>
    `Added ${transactions(count)} to ${accountName}.`,
  importDiscarded: (fileName: string) =>
    `Discarded the import of ${fileName}. Nothing entered the ledger.`,
  reconciled: (kind: Side, cents: number, categoryName: string) =>
    `Booked an ${kind} of ${formatAmount(cents)} to ${categoryName}.`,
};

/** The plain-language message for a refusal or failure (FR-067). */
export function messageFor(refusal: Refusal<MessageCode>): string {
  const wording = messages[refusal.code];
  return typeof wording === "string" ? wording : wording(refusal.details ?? {});
}
