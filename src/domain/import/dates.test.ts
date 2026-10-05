import { describe, expect, test } from "vitest";
import { DATE_FORMATS } from "../types";
import { parseBankDate } from "./dates";

// contracts/csv-import.md, date formats.

describe("parseBankDate", () => {
  test.each([
    ["DD.MM.YYYY", "03.09.2026"],
    ["DD.MM.YY", "03.09.26"],
    ["DD/MM/YYYY", "03/09/2026"],
    ["MM/DD/YYYY", "09/03/2026"],
    ["YYYY-MM-DD", "2026-09-03"],
    ["DD-MM-YYYY", "03-09-2026"],
  ] as const)("reads %s, such as %s, as 3 September 2026", (format, text) => {
    expect(parseBankDate(text, format)).toBe("2026-09-03");
  });

  test("covers every format of the contract", () => {
    expect(DATE_FORMATS).toHaveLength(6);
  });

  test.each([
    ["DD.MM.YYYY", "3.9.2026"],
    ["DD.MM.YY", "3.9.26"],
    ["DD/MM/YYYY", "3/09/2026"],
    ["MM/DD/YYYY", "9/3/2026"],
    ["YYYY-MM-DD", "2026-9-3"],
    ["DD-MM-YYYY", "03-9-2026"],
  ] as const)("accepts one-digit days and months in %s, such as %s", (format, text) => {
    expect(parseBankDate(text, format)).toBe("2026-09-03");
  });

  test("reads YY as 20YY", () => {
    expect(parseBankDate("31.12.99", "DD.MM.YY")).toBe("2099-12-31");
    expect(parseBankDate("01.01.00", "DD.MM.YY")).toBe("2000-01-01");
  });

  test.each([
    ["31.02.2026", "DD.MM.YYYY"],
    ["29.02.2026", "DD.MM.YYYY"],
    ["00.09.2026", "DD.MM.YYYY"],
    ["03.13.2026", "DD.MM.YYYY"],
    ["09/31/2026", "MM/DD/YYYY"],
  ] as const)("refuses %s, which is no real date", (text, format) => {
    expect(parseBankDate(text, format)).toBeNull();
  });

  test("accepts 29 February in a leap year", () => {
    expect(parseBankDate("29.02.2028", "DD.MM.YYYY")).toBe("2028-02-29");
  });

  test.each([
    ["03.09.2026 10:15", "DD.MM.YYYY"],
    ["03.09.2026.", "DD.MM.YYYY"],
    ["on 03.09.2026", "DD.MM.YYYY"],
    [" 03.09.2026", "DD.MM.YYYY"],
    ["2026-09-03T00:00", "YYYY-MM-DD"],
  ] as const)("refuses extra text, as in %j", (text, format) => {
    expect(parseBankDate(text, format)).toBeNull();
  });

  test.each([
    ["03.09.2026", "DD/MM/YYYY"],
    ["03.09.2026", "DD.MM.YY"],
    ["03.09.26", "DD.MM.YYYY"],
    ["003.09.2026", "DD.MM.YYYY"],
    ["2026-09-03", "DD-MM-YYYY"],
    ["", "YYYY-MM-DD"],
  ] as const)("refuses %j, which does not match %s", (text, format) => {
    expect(parseBankDate(text, format)).toBeNull();
  });

  test("reads the day and month the right way round in each order", () => {
    expect(parseBankDate("13/01/2026", "DD/MM/YYYY")).toBe("2026-01-13");
    expect(parseBankDate("01/13/2026", "MM/DD/YYYY")).toBe("2026-01-13");
    expect(parseBankDate("13/01/2026", "MM/DD/YYYY")).toBeNull();
  });
});
