import { describe, expect, test } from "vitest";
import { messageFor, messages, type MessageCode } from "./messages";

describe("messages", () => {
  test.each(Object.keys(messages) as MessageCode[])(
    "words %s in plain language (FR-067)",
    (code) => {
      const message = messageFor({ code });
      expect(message.trim()).not.toBe("");
      expect(message).not.toContain(code);
    },
  );

  test("covers the start-up and storage failures", () => {
    expect(Object.keys(messages)).toEqual(
      expect.arrayContaining([
        "save-failed",
        "storage-unavailable",
        "open-in-another-tab",
        "unexpected-error",
      ]),
    );
  });
});
