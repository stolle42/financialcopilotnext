import { describe, expect, test } from "vitest";
import type { AmountColumns } from "../types";
import { proposedSide, readAmount } from "./direction";

// contracts/csv-import.md, direction; FR-023, FR-028, R-12.

const signed: AmountColumns<number> = { mode: "signed", column: 1, invertSign: false };
const inverted: AmountColumns<number> = { mode: "signed", column: 1, invertSign: true };
const debitCredit: AmountColumns<number> = {
  mode: "debit-credit",
  debitColumn: 1,
  creditColumn: 2,
};

describe("readAmount in a signed column", () => {
  test("reads money out as negative and money in as positive", () => {
    expect(readAmount(["x", "-40,50"], signed, ",")).toBe(-4050);
    expect(readAmount(["x", "+2.450,00"], signed, ",")).toBe(245000);
    expect(readAmount(["x", "40"], signed, ".")).toBe(4000);
  });

  test("negates the value when the sign is inverted (scenario 14)", () => {
    expect(readAmount(["x", "25,00"], inverted, ",")).toBe(-2500);
    expect(readAmount(["x", "-10,00"], inverted, ",")).toBe(1000);
  });

  test("returns zero as 0, never -0, even inverted", () => {
    expect(Object.is(readAmount(["x", "0,00"], signed, ","), 0)).toBe(true);
    expect(Object.is(readAmount(["x", "-0,00"], signed, ","), 0)).toBe(true);
    expect(Object.is(readAmount(["x", "0,00"], inverted, ","), 0)).toBe(true);
  });

  test("trims the cell before reading it", () => {
    expect(readAmount(["x", " -4,50 "], signed, ",")).toBe(-450);
  });

  test("fails with amount-missing when the cell is empty or absent", () => {
    expect(readAmount(["x", "  "], signed, ",")).toEqual({ code: "amount-missing" });
    expect(readAmount(["x"], signed, ",")).toEqual({ code: "amount-missing" });
  });

  test("fails with amount-unreadable, naming the cell and the separator, outside the grammar", () => {
    expect(readAmount(["x", "-40,00 €"], signed, ",")).toEqual({
      code: "amount-unreadable",
      details: { cell: "-40,00 €", decimalSeparator: "," },
    });
    // A `,` decimal amount read with a `.` profile is refused, not read as 4,000.00.
    expect(readAmount(["x", "40,00"], signed, ".")).toMatchObject({ code: "amount-unreadable" });
  });
});

describe("readAmount in debit and credit columns (FR-028)", () => {
  test("reads a debit as money out and a credit as money in (scenario 3)", () => {
    expect(readAmount(["x", "12.50", ""], debitCredit, ".")).toBe(-1250);
    expect(readAmount(["x", "", "100.00"], debitCredit, ".")).toBe(10000);
    expect(readAmount(["x", "+12.50", ""], debitCredit, ".")).toBe(-1250);
  });

  test("counts a zero cell as empty", () => {
    expect(readAmount(["x", "0.00", "100.00"], debitCredit, ".")).toBe(10000);
    expect(readAmount(["x", "12.50", "0"], debitCredit, ".")).toBe(-1250);
  });

  test("treats missing cells as empty", () => {
    expect(readAmount(["x", "12.50"], debitCredit, ".")).toBe(-1250);
  });

  test("fails with debit-and-credit, naming both cells, when both hold an amount", () => {
    expect(readAmount(["x", "12.50", "3.00"], debitCredit, ".")).toEqual({
      code: "debit-and-credit",
      details: { debit: "12.50", credit: "3.00" },
    });
  });

  test("fails with no-debit-or-credit when both cells are blank or zero", () => {
    expect(readAmount(["x", "", ""], debitCredit, ".")).toEqual({ code: "no-debit-or-credit" });
    expect(readAmount(["x", "0.00", ""], debitCredit, ".")).toEqual({ code: "no-debit-or-credit" });
    expect(readAmount(["x", "0.00", "0.00"], debitCredit, ".")).toEqual({
      code: "no-debit-or-credit",
    });
  });

  test("fails with negative-debit-credit, naming the cell, for a negative value", () => {
    expect(readAmount(["x", "", "-5.00"], debitCredit, ".")).toEqual({
      code: "negative-debit-credit",
      details: { cell: "-5.00" },
    });
  });

  test("fails with amount-unreadable for a cell outside the grammar", () => {
    expect(readAmount(["x", "12,50", ""], debitCredit, ".")).toEqual({
      code: "amount-unreadable",
      details: { cell: "12,50", decimalSeparator: "." },
    });
  });

  test("reports the first failure in the contract's order", () => {
    // amount-unreadable comes before negative-debit-credit, whichever cell holds it.
    expect(readAmount(["x", "-1.00", "abc"], debitCredit, ".")).toMatchObject({
      code: "amount-unreadable",
      details: { cell: "abc" },
    });
    // negative-debit-credit comes before debit-and-credit.
    expect(readAmount(["x", "12.50", "-1.00"], debitCredit, ".")).toMatchObject({
      code: "negative-debit-credit",
    });
  });
});

describe("proposedSide (FR-023)", () => {
  test("proposes money out and zero as an expense, and money in as an income", () => {
    expect(proposedSide(-1)).toBe("expense");
    expect(proposedSide(0)).toBe("expense");
    expect(proposedSide(1)).toBe("income");
  });
});
