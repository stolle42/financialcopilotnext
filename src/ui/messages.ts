import type { AccountRefusalCode } from "@/domain/accounts";
import type { DraftFieldCode } from "@/domain/transactions";
import type { Refusal } from "@/domain/types";
import type { StoreRefusalCode } from "@/store/store";

// The one message catalogue: every refusal and failure code, worded for the user (R-15,
// contracts/ui.md). No wording lives anywhere else.

/** Failures the app shell raises while starting or running (R-07, R-15). */
export type ShellFailureCode = "storage-unavailable" | "open-in-another-tab" | "unexpected-error";

/** Input the form itself cannot read, before any rule is checked. */
export type FieldInputCode = "balance-invalid";

export type MessageCode =
  StoreRefusalCode | ShellFailureCode | AccountRefusalCode | DraftFieldCode | FieldInputCode;

export const messages: Record<MessageCode, string> = {
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
  "amount-invalid": "The amount must be a number of zero or more, with at most two decimals.",
  "date-invalid": "Enter a date that exists, such as today.",
  "transfer-destination-missing": "Choose the account the money goes to.",
  "transfer-needs-second-account":
    "A transfer needs a second account to move money to. Create one under Accounts first.",
};

/** The plain-language message for a refusal or failure (FR-067). */
export function messageFor(refusal: Refusal<MessageCode>): string {
  return messages[refusal.code];
}
