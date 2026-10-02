import { describe, expect, test } from "vitest";
import { isCalendarDate, monthOf } from "./dates";

describe("isCalendarDate", () => {
  test.each(["2026-09-03", "2026-01-31", "2026-12-31", "2024-02-29", "2000-02-29"])(
    "accepts the real date %s",
    (text) => expect(isCalendarDate(text)).toBe(true),
  );

  test.each([
    ["2026-02-31", "a day past the end of the month"],
    ["2026-02-29", "29 February outside a leap year"],
    ["1900-02-29", "29 February in a century year that is not a leap year"],
    ["2026-04-31", "31 April"],
    ["2026-13-01", "month 13"],
    ["2026-00-10", "month 0"],
    ["2026-09-00", "day 0"],
    ["2026-9-3", "missing leading zeros"],
    ["03.09.2026", "another format"],
    ["2026-09-03T12:00", "a time"],
    ["", "an empty text"],
  ])("rejects %s: %s", (text) => expect(isCalendarDate(text)).toBe(false));
});

describe("monthOf", () => {
  test("is the year and month of a date", () => {
    expect(monthOf("2026-09-03")).toBe("2026-09");
  });
});
