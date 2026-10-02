import { describe, expect, test } from "vitest";
import { formatAmount, formatDate, localeDecimalSeparator } from "./format";

describe("formatAmount", () => {
  test("shows euros with two decimals in the browser's number format (FR-060)", () => {
    const expected = new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" });
    expect(formatAmount(125000)).toBe(expected.format(1250));
    expect(formatAmount(125000)).toContain("€");
    expect(formatAmount(125000)).toMatch(/1\D?250\D00/);
  });

  test("shows cents exactly", () => {
    expect(formatAmount(29)).toMatch(/0\D29/);
    expect(formatAmount(-4050)).toMatch(/40\D50/);
  });
});

describe("formatDate", () => {
  test("runs in a zone west of UTC, so the next test can catch a shifted day", () => {
    expect(new Date(2026, 8, 3).getTimezoneOffset()).toBeGreaterThan(0);
  });

  test("shows the calendar date itself, never the day before", () => {
    const utcMedium = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" });
    expect(formatDate("2026-09-03")).toBe(utcMedium.format(Date.UTC(2026, 8, 3)));
    expect(formatDate("2026-01-01")).toBe(utcMedium.format(Date.UTC(2026, 0, 1)));
  });
});

describe("localeDecimalSeparator", () => {
  test("is the separator the locale writes between whole and decimal part", () => {
    expect((1.5).toLocaleString()).toBe(`1${localeDecimalSeparator()}5`);
  });
});
