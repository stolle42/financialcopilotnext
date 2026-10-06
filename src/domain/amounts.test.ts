import { describe, expect, test } from "vitest";
import { parseAmount } from "./amounts";

// The example table of contracts/csv-import.md, amount grammar: [cell, cents with D = ",", with D = "."].
const contractTable: [string, number | null, number | null][] = [
  ["1.250,00", 125000, null],
  ["1,250.00", null, 125000],
  ["-40,5", -4050, null],
  ["40,00", 4000, null],
  ["40", 4000, 4000],
  ["40,123", null, 4012300],
  ["-40,00 €", null, null],
];

describe("parseAmount", () => {
  test.each(contractTable)(
    "reads %s as %s with D = ',' and %s with D = '.'",
    (cell, comma, dot) => {
      expect(parseAmount(cell, ",")).toBe(comma);
      expect(parseAmount(cell, ".")).toBe(dot);
    },
  );

  test("converts without floating point, so 0,29 is 29 cents", () => {
    expect(parseAmount("0,29", ",")).toBe(29);
    expect(parseAmount("1.005,07", ",")).toBe(100507);
  });

  test("accepts a leading plus sign and one decimal", () => {
    expect(parseAmount("+12.5", ".")).toBe(1250);
  });

  test("gives zero, never minus zero, for a negative zero", () => {
    expect(Object.is(parseAmount("-0,00", ","), 0)).toBe(true);
  });

  test("allows at most 12 integer digits, grouped or not", () => {
    expect(parseAmount("123456789012", ",")).toBe(12345678901200);
    expect(parseAmount("123.456.789.012,99", ",")).toBe(12345678901299);
    expect(parseAmount("1234567890123", ",")).toBeNull();
    expect(parseAmount("1.234.567.890.123", ",")).toBeNull();
  });

  test.each([
    ["", "an empty cell"],
    ["-", "a sign alone"],
    [",50", "no integer part"],
    ["40,", "a separator without decimals"],
    ["1.25,00", "a group of fewer than 3 digits"],
    ["1250.000,00", "a group of more than 3 digits"],
    ["40-", "a trailing sign"],
    ["4 000", "an inner space"],
    ["€40", "a currency symbol"],
    ["1e3", "an exponent"],
  ])("refuses %s: %s", (cell) => {
    expect(parseAmount(cell, ",")).toBeNull();
  });
});
