import { describe, expect, test } from "vitest";
import {
  datesInPeriod,
  daysInPeriod,
  isCalendarDate,
  monthOf,
  monthsInPeriod,
  periodPreset,
  type Period,
  type PeriodPreset,
} from "./dates";

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

// Periods include both their start and their end (R-14); presets as in contracts/ui.md, insights.

describe("periodPreset", () => {
  test.each<[PeriodPreset, string, Period]>([
    ["this-month", "2026-09-03", { start: "2026-09-01", end: "2026-09-30" }],
    ["this-month", "2026-12-31", { start: "2026-12-01", end: "2026-12-31" }],
    ["this-month", "2026-02-14", { start: "2026-02-01", end: "2026-02-28" }],
    ["this-month", "2024-02-01", { start: "2024-02-01", end: "2024-02-29" }],
    ["last-month", "2026-09-03", { start: "2026-08-01", end: "2026-08-31" }],
    ["last-month", "2026-01-15", { start: "2025-12-01", end: "2025-12-31" }],
    ["last-month", "2026-03-31", { start: "2026-02-01", end: "2026-02-28" }],
    ["last-month", "2024-03-31", { start: "2024-02-01", end: "2024-02-29" }],
    ["last-3-months", "2026-09-03", { start: "2026-07-01", end: "2026-09-30" }],
    ["last-3-months", "2026-01-31", { start: "2025-11-01", end: "2026-01-31" }],
    ["last-3-months", "2026-02-14", { start: "2025-12-01", end: "2026-02-28" }],
    ["last-3-months", "2024-02-29", { start: "2023-12-01", end: "2024-02-29" }],
    ["this-year", "2026-09-03", { start: "2026-01-01", end: "2026-12-31" }],
    ["this-year", "2026-12-31", { start: "2026-01-01", end: "2026-12-31" }],
    ["last-year", "2026-09-03", { start: "2025-01-01", end: "2025-12-31" }],
    ["last-year", "2026-01-01", { start: "2025-01-01", end: "2025-12-31" }],
  ])("%s on %s is %o", (name, today, period) => {
    expect(periodPreset(name, today)).toEqual(period);
  });
});

describe("daysInPeriod", () => {
  test.each<[Period, number, string]>([
    [{ start: "2026-09-03", end: "2026-09-03" }, 1, "a single day"],
    [{ start: "2026-09-01", end: "2026-09-30" }, 30, "a 30-day month"],
    [{ start: "2026-02-01", end: "2026-02-28" }, 28, "February"],
    [{ start: "2024-02-01", end: "2024-02-29" }, 29, "February in a leap year"],
    [{ start: "2026-02-28", end: "2026-03-01" }, 2, "the end of February"],
    [{ start: "2024-02-28", end: "2024-03-01" }, 3, "the end of February in a leap year"],
    [{ start: "2025-12-31", end: "2026-01-01" }, 2, "the turn of the year"],
    [{ start: "2026-03-01", end: "2026-03-31" }, 31, "a month with a clock change"],
    [{ start: "2026-07-01", end: "2026-09-30" }, 92, "July to September"],
    [{ start: "2026-01-01", end: "2026-12-31" }, 365, "a year"],
    [{ start: "2024-01-01", end: "2024-12-31" }, 366, "a leap year"],
    [{ start: "2023-06-15", end: "2026-06-14" }, 1096, "three years across a leap day"],
  ])("%o has %i days: %s", (period, days) => {
    expect(daysInPeriod(period)).toBe(days);
  });
});

describe("datesInPeriod", () => {
  test("is the period's one day when it starts and ends on it", () => {
    expect(datesInPeriod({ start: "2026-09-03", end: "2026-09-03" })).toEqual(["2026-09-03"]);
  });

  test("runs over the end of February in a leap year", () => {
    expect(datesInPeriod({ start: "2024-02-27", end: "2024-03-02" })).toEqual([
      "2024-02-27",
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
      "2024-03-02",
    ]);
  });

  test("runs over the end of a month and the turn of the year", () => {
    expect(datesInPeriod({ start: "2025-12-30", end: "2026-01-02" })).toEqual([
      "2025-12-30",
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
    ]);
  });

  test("has one real calendar date per day of the period, in order", () => {
    const period = { start: "2024-01-01", end: "2024-12-31" };
    const dates = datesInPeriod(period);
    expect(dates).toHaveLength(daysInPeriod(period));
    expect(dates.every(isCalendarDate)).toBe(true);
    expect(dates.slice(59, 61)).toEqual(["2024-02-29", "2024-03-01"]);
    expect(dates.at(-1)).toBe("2024-12-31");
    expect([...dates].sort()).toEqual(dates);
  });
});

describe("monthsInPeriod", () => {
  test("is one month for a period within it", () => {
    expect(monthsInPeriod({ start: "2026-09-03", end: "2026-09-05" })).toEqual(["2026-09"]);
  });

  test("includes the partial months at both ends, across the turn of the year", () => {
    expect(monthsInPeriod({ start: "2025-11-15", end: "2026-02-10" })).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  test("is the twelve months of a year", () => {
    expect(monthsInPeriod({ start: "2024-01-01", end: "2024-12-31" })).toEqual([
      "2024-01",
      "2024-02",
      "2024-03",
      "2024-04",
      "2024-05",
      "2024-06",
      "2024-07",
      "2024-08",
      "2024-09",
      "2024-10",
      "2024-11",
      "2024-12",
    ]);
  });
});
