import { describe, expect, test } from "vitest";
import type { MappingProfile } from "../types";
import { newProfileDraft } from "./profiles";
import { headerIndex, parseRecords } from "./rows";

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

// R-34: some banks write lines of account details above the column names (FR-021, pipeline step 4).

/** ING's 12 lines above its column names, blank ones included, with made-up details. */
const ingDetails = [
  ["Umsatzanzeige", "Datei erstellt am: 01.11.2026 09:12"],
  [""],
  ["IBAN", "DE00 1234 5678 9012 3456 78"],
  ["Kontoname", "Girokonto"],
  ["Bank", "ING"],
  ["Kunde", "Erika Mustermann"],
  ["Zeitraum", "01.10.2026 - 31.10.2026"],
  ["Saldo", "1.234,56", "EUR"],
  [""],
  ["Sortierung", "Datum absteigend"],
  [""],
  ["In der CSV-Datei finden Sie alle bereits gebuchten Umsätze."],
];

const ingHeader = [
  "Buchung",
  "Wertstellungsdatum",
  "Auftraggeber/Empfänger",
  "Buchungstext",
  "Verwendungszweck",
  "Saldo",
  "Währung",
  "Betrag",
  "Währung",
];

const ingRows = [
  [
    "30.10.2026",
    "30.10.2026",
    "Bäckerei Kern",
    "Lastschrift",
    "Brötchen",
    "1.234,56",
    "EUR",
    "-4,50",
    "EUR",
  ],
  [
    "28.10.2026",
    "28.10.2026",
    "Arbeitgeber GmbH",
    "Gehalt",
    "Gehalt Oktober",
    "1.239,06",
    "EUR",
    "2.500,00",
    "EUR",
  ],
];

const ing: MappingProfile = {
  id: "ing",
  name: "ING",
  hasHeaderRow: true,
  dateColumn: "Buchung",
  descriptionColumn: "Verwendungszweck",
  counterpartyColumn: "Auftraggeber/Empfänger",
  amount: { mode: "signed", column: "Betrag", invertSign: false },
  dateFormat: "DD.MM.YYYY",
  decimalSeparator: ",",
  encoding: "Windows-1252",
};

const rowNumbers = (rows: ReturnType<typeof parseRecords>) =>
  Array.isArray(rows) ? rows.map((row) => [row.rowNumber, row.status]) : rows;

describe("headerIndex for a profile that maps columns", () => {
  test("gives record 0 for a file whose first record holds the column names", () => {
    expect(headerIndex([header, ["01.08.2026", "Shop", "x", "-1,00"]], myBank)).toBe(0);
  });

  test("finds the column names below 12 or 14 records of account details, blank ones counted", () => {
    expect(headerIndex([...ingDetails, ingHeader, ...ingRows], ing)).toBe(12);
    const longer = [...ingDetails, [""], ["Kontostand", "1.234,56"], ingHeader, ...ingRows];
    expect(headerIndex(longer, ing)).toBe(14);
  });

  test("does not take a record of account details that holds one mapped name for the header", () => {
    const records = [["Datum", "01.11.2026"], [""], ["Datum", "Name", "Text", "Betrag"]];
    const profile: MappingProfile = {
      ...myBank,
      dateColumn: "Datum",
      counterpartyColumn: "Name",
      descriptionColumn: "Text",
      amount: { mode: "signed", column: "Betrag", invertSign: false },
    };
    expect(headerIndex(records, profile)).toBe(2);
  });

  test("looks no further than the first 20 records", () => {
    const details = Array.from({ length: 20 }, (_, index) => [`Line ${index + 1}`]);
    expect(headerIndex([...details.slice(0, 19), header], myBank)).toBe(19);
    expect(headerIndex([...details, header], myBank)).toEqual({
      code: "import-missing-columns",
      details: { columns: ["Date", "Amount", "Purpose", "Payee"] },
    });
  });

  test("with no record holding every name, names what the record holding most of them lacks", () => {
    const records = [
      ["Date", "Note"],
      ["Date", "Amount", "Note"],
      ["Amount", "Purpose", "Note"],
      ["01.08.2026", "-1,00", "x"],
    ];
    // Records 1 and 2 both hold two names; the first of them counts.
    expect(headerIndex(records, myBank)).toEqual({
      code: "import-missing-columns",
      details: { columns: ["Purpose", "Payee"] },
    });
  });
});

describe("headerIndex while nothing is mapped", () => {
  const unmapped = newProfileDraft();

  test("finds the first record naming a date and an amount below account details", () => {
    expect(headerIndex([...ingDetails, ingHeader, ...ingRows], unmapped)).toBe(12);
  });

  test("finds the first record naming a date, a debit and a credit", () => {
    const records = [
      ["Kontoauszug"],
      ["Buchungstag", "Valuta", "Verwendungszweck", "Soll", "Haben"],
      ["01.10.2026", "01.10.2026", "Miete", "850,00", ""],
    ];
    expect(headerIndex(records, unmapped)).toBe(1);
  });

  test("gives record 0 for a file naming no date and amount", () => {
    expect(headerIndex([["01.10.2026", "Miete", "-850,00"], ["Note"]], unmapped)).toBe(0);
    expect(
      headerIndex(
        [
          ["Date", "Note"],
          ["01.10.2026", "x"],
        ],
        unmapped,
      ),
    ).toBe(0);
  });
});

describe("parseRecords below account details", () => {
  test("reads the header as record 1 as before v1.7", () => {
    expect(
      rowNumbers(parseRecords([header, ["01.08.2026", "Shop", "x", "-1,00"]], myBank)),
    ).toEqual([[2, "parsed"]]);
  });

  test("reads every row below 12 or 14 records of account details with the same profile", () => {
    expect(rowNumbers(parseRecords([...ingDetails, ingHeader, ...ingRows], ing))).toEqual([
      [14, "parsed"],
      [15, "parsed"],
    ]);
    const longer = [...ingDetails, [""], ["Kontostand", "1.234,56"], ingHeader, ...ingRows];
    expect(rowNumbers(parseRecords(longer, ing))).toEqual([
      [16, "parsed"],
      [17, "parsed"],
    ]);
  });

  test("reads the rows' cells from the header's columns", () => {
    expect(parseRecords([...ingDetails, ingHeader, ingRows[0]!], ing)).toEqual([
      {
        status: "parsed",
        rowNumber: 14,
        date: "2026-10-30",
        amountCents: -450,
        description: "Brötchen",
        counterparty: "Bäckerei Kern",
      },
    ]);
  });

  test("refuses a header at record 21, naming the missing columns", () => {
    const details = Array.from({ length: 20 }, (_, index) => [`Line ${index + 1}`]);
    expect(
      parseRecords([...details, header, ["01.08.2026", "Shop", "x", "-1,00"]], myBank),
    ).toEqual({
      code: "import-missing-columns",
      details: { columns: ["Date", "Amount", "Purpose", "Payee"] },
    });
  });

  test("refuses a mapped name twice in the header below account details, naming it", () => {
    const records = [
      ["Konto", "Giro"],
      [...header, "Date"],
      ["01.08.2026", "Shop", "x", "-1,00", ""],
    ];
    expect(parseRecords(records, myBank)).toEqual({
      code: "import-duplicate-header",
      details: { column: "Date" },
    });
  });

  test("reads every record as data without a header row, account details giving unparsable rows", () => {
    const byPosition: MappingProfile = {
      ...myBank,
      hasHeaderRow: false,
      dateColumn: 0,
      counterpartyColumn: null,
      descriptionColumn: 1,
      amount: { mode: "signed", column: 2, invertSign: false },
    };
    const records = [["Konto", "Giro"], [""], ["01.08.2026", "Shop", "-1,00"]];
    expect(rowNumbers(parseRecords(records, byPosition))).toEqual([
      [1, "unparsable"],
      [3, "parsed"],
    ]);
  });
});
