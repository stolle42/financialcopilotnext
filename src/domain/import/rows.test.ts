import { describe, expect, test } from "vitest";
import type { MappingProfile } from "../types";
import { parseRecords } from "./rows";

// contracts/csv-import.md, pipeline steps 3–6, cells and unparsable rows; FR-021, FR-028.

const myBank: MappingProfile = {
  id: "mybank",
  name: "MyBank",
  hasHeaderRow: true,
  dateColumn: "Date",
  descriptionColumn: "Purpose",
  counterpartyColumn: "Payee",
  amount: { mode: "signed", column: "Amount", invertSign: false },
  dateFormat: "DD.MM.YYYY",
  decimalSeparator: ",",
  encoding: "Windows-1252",
};

const header = ["Date", "Payee", "Purpose", "Amount"];

describe("parseRecords with a header row", () => {
  test("reads each data record into a parsed row, numbered as a spreadsheet shows it", () => {
    const rows = parseRecords(
      [header, ["01.08.2026", " Shop ", " Groceries ", "-45,20"], ["02.08.2026", "", "", "12,99"]],
      myBank,
    );
    expect(rows).toEqual([
      {
        status: "parsed",
        rowNumber: 2,
        date: "2026-08-01",
        amountCents: -4520,
        description: "Groceries",
        counterparty: "Shop",
      },
      {
        status: "parsed",
        rowNumber: 3,
        date: "2026-08-02",
        amountCents: 1299,
        description: "",
        counterparty: null,
      },
    ]);
  });

  test("finds mapped columns by header text, ignoring case, spaces and column order", () => {
    const rows = parseRecords(
      [
        [" amount", "PURPOSE", "date ", "payee"],
        ["-4,50", "Brötchen", "02.08.2026", "Bakery"],
      ],
      myBank,
    );
    expect(rows).toEqual([
      expect.objectContaining({
        amountCents: -450,
        description: "Brötchen",
        counterparty: "Bakery",
      }),
    ]);
  });

  test("gives a row no vendor when no counterparty column is mapped (FR-026)", () => {
    const rows = parseRecords([header, ["01.08.2026", "Shop", "Groceries", "-1,00"]], {
      ...myBank,
      counterpartyColumn: null,
    });
    expect(rows).toEqual([expect.objectContaining({ counterparty: null })]);
  });

  test("refuses a file that lacks mapped headers, naming every missing column (scenario 13)", () => {
    const records = [
      ["Date", "Name", "Purpose", "Value"],
      ["01.08.2026", "Shop", "x", "-1,00"],
    ];
    expect(parseRecords(records, myBank)).toEqual({
      code: "import-missing-columns",
      details: { columns: ["Amount", "Payee"] },
    });
  });

  test("refuses a file in which a mapped header appears twice, naming it", () => {
    const records = [
      [...header, "date"],
      ["01.08.2026", "Shop", "x", "-1,00", "02.08.2026"],
    ];
    expect(parseRecords(records, myBank)).toEqual({
      code: "import-duplicate-header",
      details: { column: "Date" },
    });
  });

  test("accepts a repeated header the profile does not map", () => {
    const records = [
      [...header, "Note", "Note"],
      ["01.08.2026", "Shop", "x", "-1,00", "", ""],
    ];
    expect(parseRecords(records, myBank)).toHaveLength(1);
  });

  test("refuses a header-only file, or one with only blank records, as holding no transactions", () => {
    expect(parseRecords([header], myBank)).toEqual({ code: "import-no-transactions" });
    expect(parseRecords([header, [""], ["  ", ""]], myBank)).toEqual({
      code: "import-no-transactions",
    });
  });

  test("refuses an empty file as holding no transactions", () => {
    expect(parseRecords([], myBank)).toEqual({ code: "import-no-transactions" });
    expect(parseRecords([[""]], myBank)).toEqual({ code: "import-no-transactions" });
  });

  test("skips blank records but keeps their place in the numbering", () => {
    const rows = parseRecords(
      [
        header,
        ["01.08.2026", "Shop", "a", "-1,00"],
        [""],
        [" ", " "],
        ["02.08.2026", "Shop", "b", "-2,00"],
      ],
      myBank,
    );
    expect(Array.isArray(rows) && rows.map((row) => row.rowNumber)).toEqual([2, 5]);
  });

  test("treats the missing cells of a short record as empty", () => {
    const rows = parseRecords([header, ["01.08.2026", "Shop"]], myBank);
    expect(rows).toEqual([
      {
        status: "unparsable",
        rowNumber: 2,
        cells: ["01.08.2026", "Shop"],
        failure: { code: "amount-missing" },
      },
    ]);
  });

  test("keeps unparsable rows with their raw cells and reason, and parses the rest (scenario 11)", () => {
    const rows = parseRecords(
      [
        header,
        ["32.08.2026", "Kiosk", "Newspaper", "-2,80"],
        ["22.08.2026", "Kiosk", "Magazine", ""],
        ["", "Kiosk", "Gum", "-1,00"],
        ["27.08.2026", "Streaming", "Monthly plan", "-9,99"],
      ],
      myBank,
    );
    expect(rows).toEqual([
      {
        status: "unparsable",
        rowNumber: 2,
        cells: ["32.08.2026", "Kiosk", "Newspaper", "-2,80"],
        failure: { code: "date-unreadable", details: { cell: "32.08.2026", format: "DD.MM.YYYY" } },
      },
      {
        status: "unparsable",
        rowNumber: 3,
        cells: ["22.08.2026", "Kiosk", "Magazine", ""],
        failure: { code: "amount-missing" },
      },
      {
        status: "unparsable",
        rowNumber: 4,
        cells: ["", "Kiosk", "Gum", "-1,00"],
        failure: { code: "date-missing" },
      },
      expect.objectContaining({ status: "parsed", rowNumber: 5, amountCents: -999 }),
    ]);
  });

  test("reports a broken date before a broken amount", () => {
    const rows = parseRecords([header, ["3.9.26", "Shop", "x", "1,2,3"]], myBank);
    expect(rows).toEqual([
      expect.objectContaining({ failure: expect.objectContaining({ code: "date-unreadable" }) }),
    ]);
  });

  test("proposes purchases listed as positive numbers as expenses when the sign is inverted (scenario 14)", () => {
    const profile: MappingProfile = {
      ...myBank,
      amount: { mode: "signed", column: "Amount", invertSign: true },
    };
    const rows = parseRecords([header, ["04.08.2026", "Bookshop", "Novel", "25,00"]], profile);
    expect(rows).toEqual([expect.objectContaining({ amountCents: -2500 })]);
  });

  test("reads debit and credit columns, with zero as empty, and fails rows with both or neither (scenario 3)", () => {
    const profile: MappingProfile = {
      ...myBank,
      descriptionColumn: "Description",
      counterpartyColumn: null,
      amount: { mode: "debit-credit", debitColumn: "Debit", creditColumn: "Credit" },
      dateFormat: "MM/DD/YYYY",
      decimalSeparator: ".",
      encoding: "UTF-8",
    };
    const rows = parseRecords(
      [
        ["Date", "Description", "Debit", "Credit"],
        ["08/03/2026", "Café Central", "12.50", ""],
        ["08/05/2026", "Refund from shop", "0.00", "25.00"],
        ["08/07/2026", "Rent, August", "1,250.00", "0.00"],
        ["08/12/2026", "Both columns", "10.00", "5.00"],
        ["08/14/2026", "Neither column", "", "0.00"],
      ],
      profile,
    );
    expect(
      Array.isArray(rows) &&
        rows.map((row) => (row.status === "parsed" ? row.amountCents : row.failure.code)),
    ).toEqual([-1250, 2500, -125000, "debit-and-credit", "no-debit-or-credit"]);
  });
});

describe("parseRecords without a header row", () => {
  const byPosition: MappingProfile = {
    ...myBank,
    hasHeaderRow: false,
    dateColumn: 0,
    counterpartyColumn: 1,
    descriptionColumn: 2,
    amount: { mode: "signed", column: 3, invertSign: false },
  };

  test("reads every record as data, by position, starting at row 1", () => {
    const rows = parseRecords(
      [
        ["01.08.2026", "Shop", "Groceries", "-45,20"],
        ["02.08.2026", "Bakery", "Bread", "-4,50"],
      ],
      byPosition,
    );
    expect(Array.isArray(rows) && rows.map((row) => [row.rowNumber, row.status])).toEqual([
      [1, "parsed"],
      [2, "parsed"],
    ]);
  });

  test("makes no layout check, so a record without the mapped columns becomes unparsable", () => {
    const rows = parseRecords(
      [
        ["Date", "Payee"],
        ["01.08.2026", "Shop", "Groceries", "-1,00"],
      ],
      byPosition,
    );
    expect(rows).toEqual([
      expect.objectContaining({
        status: "unparsable",
        rowNumber: 1,
        failure: expect.objectContaining({ code: "date-unreadable" }),
      }),
      expect.objectContaining({ status: "parsed", rowNumber: 2 }),
    ]);
  });
});
