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

  test("names the details of a refusal, such as every column a file lacks", () => {
    expect(
      messageFor({ code: "import-missing-columns", details: { columns: ["Amount", "Payee"] } }),
    ).toContain('"Amount" and "Payee"');
    expect(
      messageFor({
        code: "profile-columns-incomplete",
        details: { roles: ["date", "amount", "description"] },
      }),
    ).toContain("date, amount and description");
    expect(
      messageFor({
        code: "date-unreadable",
        details: { cell: "32.08.2026", format: "DD.MM.YYYY" },
      }),
    ).toBe('"32.08.2026" is not a date in the format DD.MM.YYYY.');
  });
});
