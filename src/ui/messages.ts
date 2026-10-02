import type { Refusal } from "@/domain/types";
import type { StoreRefusalCode } from "@/store/store";

// The one message catalogue: every refusal and failure code, worded for the user (R-15,
// contracts/ui.md). No wording lives anywhere else.

/** Failures the app shell raises while starting or running (R-07, R-15). */
export type ShellFailureCode = "storage-unavailable" | "open-in-another-tab" | "unexpected-error";

export type MessageCode = StoreRefusalCode | ShellFailureCode;

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
};

/** The plain-language message for a refusal or failure (FR-067). */
export function messageFor(refusal: Refusal<MessageCode>): string {
  return messages[refusal.code];
}
