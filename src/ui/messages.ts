import type { AiRefusalCode } from "@/ai/openai";
import type { AccountRefusalCode, ReconcileRefusalCode } from "@/domain/accounts";
import type { BudgetRefusalCode } from "@/domain/budgets";
import type { CategoryRefusalCode } from "@/domain/categories";
import type { BatchRefusalCode } from "@/domain/import/batch";
import type { ProfileRefusalCode } from "@/domain/import/profiles";
import type { SuggestionRefusalCode } from "@/domain/import/suggestions";
import type { DraftFieldCode } from "@/domain/transactions";
import type { Refusal, RefusalDetails, RowFailureCode, Side } from "@/domain/types";
import type { InvariantCode } from "@/domain/invariants";
import type { BackupRefusalCode } from "@/files/backup";
import type { DecodingRefusal } from "@/files/csv";
import type { SuggestRefusalCode } from "@/store/import";
import type { StoreRefusalCode } from "@/store/store";
import { formatAmount } from "./format";

// The one message catalogue: every refusal and failure code, worded for the user (R-15,
// contracts/ui.md). No wording lives anywhere else.

/** Failures the app shell raises while starting or running (R-07, R-15). */
export type ShellFailureCode = "storage-unavailable" | "open-in-another-tab" | "unexpected-error";

/** The worker did not confirm Update (contracts/app-updates.md, messages). */
export type UpdateFailureCode = "update-failed";

/** Input the form itself cannot read, before any rule is checked. */
export type FieldInputCode =
  "balance-invalid" | "import-file-unreadable" | "period-invalid" | "date-range-invalid";

export type MessageCode =
  | StoreRefusalCode
  | ShellFailureCode
  | UpdateFailureCode
  | AccountRefusalCode
  | DraftFieldCode
  | FieldInputCode
  | ProfileRefusalCode
  | RowFailureCode
  | DecodingRefusal["code"]
  | BatchRefusalCode
  | SuggestionRefusalCode
  | AiRefusalCode
  | SuggestRefusalCode
  | BudgetRefusalCode
  | ReconcileRefusalCode
  | CategoryRefusalCode
  | BackupRefusalCode;

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

/** Each rule of data-model.md, in the words of a backup that breaks it (FR-072, step 4). */
const brokenRules: Record<InvariantCode, string> = {
  "id-duplicate": "two records share the same id",
  "transaction-seq-duplicate": "two transactions share the same place in the order of entry",
  "transaction-seq-invalid": "a transaction has no valid place in the order of entry",
  "account-name-missing": "an account has no name",
  "account-name-duplicate": "two accounts have the same name",
  "category-role-count":
    "a side does not have exactly one Uncategorised and one Unaccounted category",
  "category-name-missing": "a category has no name",
  "category-name-duplicate": "two categories on one side have the same name",
  "category-color-invalid": "a category has a colour that is not a colour code",
  "transaction-date-invalid": "a transaction has a date that does not exist",
  "transaction-amount-invalid":
    "a transaction has an amount that is not a whole number of cents of zero or more",
  "transaction-account-missing": "a transaction refers to an account that is not in the backup",
  "transaction-category-invalid":
    "a transaction refers to a category that is not in the backup or is on the other side",
  "transaction-fields-mixed": "a transaction mixes the details of a transfer with those of a spend",
  "transaction-destination-invalid":
    "a transfer goes to an account that is not in the backup, or to the account it leaves",
  "budget-category-invalid": "a budget refers to a category that cannot carry one",
  "budget-limit-out-of-range": "a budget has a limit that is not an amount above 0.00",
  "profile-name-missing": "a mapping profile has no name",
  "profile-name-duplicate": "two mapping profiles have the same name",
  "profile-column-mismatch":
    "a mapping profile names its columns in a way its header row setting rules out",
  "profile-setting-unsupported":
    "a mapping profile uses a date format, encoding or decimal separator this version does not know",
  "pending-batch-account-missing":
    "the pending import refers to an account that is not in the backup",
  "pending-row-number-duplicate": "two rows of the pending import have the same number",
  "pending-row-date-invalid": "a row of the pending import has a date that does not exist",
  "pending-row-amount-invalid": "a row of the pending import has an amount that is not valid",
  "pending-row-category-invalid":
    "a row of the pending import refers to a category that is not in the backup or is on the other side",
  "pending-row-suggestion-invalid":
    "a row of the pending import holds a category the AI suggested that it cannot suggest",
  "pending-row-transfer-invalid":
    "a row of the pending import is a transfer to an account that is not in the backup, or to the import's own account",
  "pending-row-failure-unknown": "an unreadable row of the pending import has an unknown reason",
  "settings-account-missing": "the settings name an account that is not in the backup",
  "settings-model-invalid": "the settings name an empty model",
  "conversation-question-missing": "a question of the finance chat's conversation is empty",
  "conversation-turn-invalid":
    "an answer of the finance chat's conversation does not fit its marks, such as stopped or out of scope",
  "conversation-source-invalid":
    "a source of an answer in the finance chat's conversation has no name or no valid dates",
};

/** What a damaged backup's records are called, with their article. */
const recordWords: Record<string, string> = {
  account: "an account",
  category: "a category",
  transaction: "a transaction",
  budget: "a budget",
  profile: "a mapping profile",
  pendingBatch: "the pending import",
  pendingRow: "a row of the pending import",
  settings: "the settings",
  turn: "a question and answer of the finance chat's conversation",
  source: "a source of an answer in the finance chat's conversation",
};

/** A field name in words: `openingBalanceCents` is "opening balance". */
const fieldWords = (field: string) =>
  field
    .replace(/(Cents|Id)$/, "")
    .replace(/([A-Z])/g, " $1")
    .toLowerCase()
    .trim();

const BACKUP_UNCHANGED = "Your current data is unchanged.";

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
  "update-failed":
    "The update could not start; close the app, open it again and try again. Your data is unchanged.",
  "account-name-empty": "The account needs a name.",
  "account-name-taken": "An account with this name already exists. Choose another name.",
  "balance-invalid": "The balance must be a number with at most two decimals.",
  "period-invalid":
    "Enter a start date and an end date that exist, with the end on or after the start.",
  "date-range-invalid": "The From date must be on or before the To date.",
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
  "backup-not-a-backup": `This file is not a Financial Copilot backup. ${BACKUP_UNCHANGED}`,
  "backup-newer-version":
    "This backup was made by a newer version of Financial Copilot than this one, so it cannot be " +
    `read here. ${BACKUP_UNCHANGED}`,
  "backup-damaged": (details) => {
    const record = text(details.record);
    const field = text(details.field);
    let problem: string;
    if (details.rule !== undefined) {
      problem = brokenRules[details.rule as InvariantCode] ?? "its data breaks a rule";
    } else if (record === "" || record === "data" || record === "backup") {
      problem = field ? `the part "${field}" is missing or not valid` : "";
    } else if (field) {
      problem = `${recordWords[record] ?? "a record"} has a missing or invalid ${fieldWords(field)}`;
    } else {
      problem = `${recordWords[record] ?? "a record"} is not valid`;
    }
    return `The backup is incomplete or damaged${problem ? `: ${problem}` : ""}. ${BACKUP_UNCHANGED}`;
  },
  "import-account-missing": "Choose the account to import into.",
  "import-batch-pending":
    "An import is waiting for review. Confirm or discard it before you import another file.",
  "ai-features-off": "This needs AI features, which you turn on in Settings. Nothing was sent.",
  "ai-unreachable":
    "The AI could not be asked. AI features need the app started on this computer with an OpenAI " +
    "key in .env, and an internet connection; then try again. Nothing changed.",
  "ai-timeout":
    "The AI took too long to answer. Try again, with fewer rows or a shorter question. Nothing " +
    "changed.",
  "ai-failed":
    "OpenAI refused the request, for example because of the key or the project's credit. Check " +
    "them on OpenAI's platform, then try again. Nothing changed.",
  "ai-answer-invalid": "The AI's answer could not be read. Try again. Nothing changed.",
  "suggestions-outdated":
    "The import changed while the AI was answering, so no suggestion was used.",
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

/** What AI features do and where their data goes, on the Settings screen (FR-095). */
export const aiFeaturesDescription =
  "Suggest categories in review, and the finance chat. AI features send data to OpenAI.";

/** The data-sharing warning, shown before AI features turn on (FR-095, FR-091). */
export const sharingWarning =
  "Data will now be shared with OpenAI. Suggest categories sends the payee and purpose of the " +
  "rows still to categorise, your category names and up to 100 earlier descriptions, and no " +
  "amounts, dates or account names. The finance chat sends each question with the conversation, " +
  "the expenses and incomes of this month and the 12 months before it with their dates, " +
  "descriptions, amounts and categories, their monthly totals, this month's budgets, and each " +
  "account's name, type and balance.";

/** Beside the AI features switch in a copy not served from the user's computer (FR-106). */
export const aiFeaturesLocalOnly =
  "AI features need the app running on your computer. Run it locally to use them.";

/** The finance chat's wording (contracts/ui.md, finance chat; FR-100 – FR-111). */
export const financeChat = {
  title: "Ask about your finances",
  examples: [
    "How can I reduce my spending?",
    "Which of my subscriptions have become more expensive?",
    "Am I on track with my budgets this month?",
    "Where did I spend more this month than last month?",
  ],
  /** The fixed answer to a question out of scope (FR-103). */
  outOfScope:
    "I can help with questions about your own finances, which I answer from your data in this " +
    "app, such as where your money goes, whether your budgets hold and where you could save; " +
    "with general questions about money and finance; and with questions about how this app " +
    "works. I cannot help with other topics.",
  /** The group of the example questions, or of the latest answer's follow-ups (FR-101, FR-111). */
  suggestions: "Suggested questions",
  needsAiFeatures: "The chat needs AI features, which you turn on in Settings.",
  thinking: "Thinking…",
  stop: "Stop",
  stopped: "Stopped",
  sources: "Sources",
  clear: "Clear conversation",
  clearWarning: "The conversation's questions and answers will be deleted.",
};

/** The notice on Settings while a newer version waits, with the versions as the header shows them (FR-124). */
export const updateNotice = (available: string, running: string) =>
  `Version ${available} is available (you have ${running}). Make a backup first.`;

/** Added to the Backup note on persistent storage while the header offers Install app (FR-075). */
export const installHint = "Installing the app helps the browser keep the data.";

/** Beside Suggest categories while AI features are off (FR-090). */
export const aiFeaturesNeeded = "Suggestions need AI features, which you turn on in Settings.";

/** Brief success messages after a write that leaves the screen (contracts/ui.md, shared patterns). */
export const notifications = {
  importConfirmed: (count: number, accountName: string) =>
    `Added ${transactions(count)} to ${accountName}.`,
  importDiscarded: (fileName: string) =>
    `Discarded the import of ${fileName}. Nothing entered the ledger.`,
  reconciled: (kind: Side, cents: number, categoryName: string) =>
    `Booked an ${kind} of ${formatAmount(cents)} to ${categoryName}.`,
  restored: (fileName: string) => `Restored all data from ${fileName}.`,
  /** The status line after an answer: how many of the rows sent got a category (FR-094). */
  categoriesSuggested: (filled: number, sent: number) =>
    filled === 0
      ? `The AI found no category for the ${sent} row${sent === 1 ? "" : "s"} sent.`
      : `The AI suggested ${filled === 1 ? "a category" : "categories"} for ${filled} of ${sent} ` +
        `row${sent === 1 ? "" : "s"}.`,
};

/** The plain-language message for a refusal or failure (FR-067). */
export function messageFor(refusal: Refusal<MessageCode>): string {
  const wording = messages[refusal.code];
  return typeof wording === "string" ? wording : wording(refusal.details ?? {});
}
