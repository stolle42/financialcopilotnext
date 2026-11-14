import { describe, expect, test } from "vitest";
import type { MappingProfile } from "../types";
import { newProfileDraft } from "./profiles";
import { proposeProfile, suggestsInvertedSign } from "./propose";
import type { RecordRow } from "./rows";

// contracts/csv-import.md, proposing a format and sign hint; FR-133, FR-134, R-33, R-34.

describe("proposeProfile by column names", () => {
  test("proposes every setting of scenario 3's layout by name", () => {
    const records = [
      ["Date", "Payee", "Purpose", "Amount"],
      ["01.10.2026", "Bäckerei Kern", "Brötchen", "-4,50"],
      ["02.10.2026", "Employer Ltd", "Salary October", "2.500,00"],
      ["03.10.2026", "Supermarket", "Groceries", "-45,20"],
    ];
    expect(proposeProfile(records, "UTF-8")).toEqual({
      id: null,
      name: "",
      hasHeaderRow: true,
      dateColumn: "Date",
      descriptionColumn: "Purpose",
      counterpartyColumn: "Payee",
      amount: { mode: "signed", column: "Amount", invertSign: false },
      dateFormat: "DD.MM.YYYY",
      decimalSeparator: ",",
      encoding: "UTF-8",
    });
  });

  test("proposes debit and credit columns and the booking date over the value date (scenario 5)", () => {
    const records = [
      ["Buchungstag", "Valuta", "Verwendungszweck", "Soll", "Haben"],
      ["01.10.2026", "02.10.2026", "Miete Oktober", "850,00", ""],
      ["05.10.2026", "05.10.2026", "Gehalt", "", "2.500,00"],
      ["07.10.2026", "07.10.2026", "Strom", "62,10", ""],
    ];
    expect(proposeProfile(records, "Windows-1252")).toMatchObject({
      hasHeaderRow: true,
      dateColumn: "Buchungstag",
      descriptionColumn: "Verwendungszweck",
      counterpartyColumn: null,
      amount: { mode: "debit-credit", debitColumn: "Soll", creditColumn: "Haben" },
      decimalSeparator: ",",
    });
  });

  test("compares names by name key, keeping the header's text", () => {
    const records = [
      ["DATUM", "Empfänger ", "verwendungszweck", "Betrag"],
      ["01.10.2026", "Shop", "Groceries", "-12,00"],
    ];
    expect(proposeProfile(records, "UTF-8")).toMatchObject({
      dateColumn: "DATUM",
      counterpartyColumn: "Empfänger",
      descriptionColumn: "verwendungszweck",
      amount: { mode: "signed", column: "Betrag" },
    });
  });

  test("finds the column names below 12 lines of account details (scenario 18)", () => {
    const records = [
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
      [
        "Buchung",
        "Wertstellungsdatum",
        "Auftraggeber/Empfänger",
        "Buchungstext",
        "Verwendungszweck",
        "Betrag",
        "Währung",
      ],
      ["30.10.2026", "30.10.2026", "Bäckerei Kern", "Lastschrift", "Brötchen", "-4,50", "EUR"],
      ["28.10.2026", "28.10.2026", "Arbeitgeber GmbH", "Gehalt", "Gehalt", "2.500,00", "EUR"],
      ["27.10.2026", "27.10.2026", "Stadtwerke", "Lastschrift", "Strom", "-62,10", "EUR"],
    ];
    expect(proposeProfile(records, "Windows-1252")).toMatchObject({
      hasHeaderRow: true,
      dateColumn: "Buchung",
      descriptionColumn: "Verwendungszweck",
      counterpartyColumn: "Auftraggeber/Empfänger",
      amount: { mode: "signed", column: "Betrag", invertSign: false },
      dateFormat: "DD.MM.YYYY",
      decimalSeparator: ",",
    });
  });

  test("proposes the signed Betrag beside Soll and Haben that repeat it, as Deutsche Bank's", () => {
    const records = [
      [
        "Buchungstag",
        "Wert",
        "Begünstigter / Auftraggeber",
        "Verwendungszweck",
        "Betrag",
        "Soll",
        "Haben",
        "Währung",
      ],
      ["1.10.2026", "1.10.2026", "Vermieter", "Miete", "-850,00", "-850,00", "", "EUR"],
      ["15.10.2026", "15.10.2026", "Arbeitgeber", "Gehalt", "2.500,00", "", "2.500,00", "EUR"],
      ["20.10.2026", "20.10.2026", "Bäckerei", "Brötchen", "-4,50", "-4,50", "", "EUR"],
    ];
    expect(proposeProfile(records, "UTF-8")).toMatchObject({
      dateColumn: "Buchungstag",
      counterpartyColumn: "Begünstigter / Auftraggeber",
      amount: { mode: "signed", column: "Betrag", invertSign: false },
      dateFormat: "DD.MM.YYYY",
    });
  });

  test("proposes no counterparty for DKB's two direction-dependent name columns", () => {
    const records = [
      [
        "Buchungsdatum",
        "Wertstellung",
        "Status",
        "Zahlungspflichtige*r",
        "Zahlungsempfänger*in",
        "Verwendungszweck",
        "Betrag (€)",
      ],
      ["30.10.26", "30.10.26", "Gebucht", "Erika Mustermann", "Bäckerei Kern", "Brötchen", "-4,5"],
      [
        "28.10.26",
        "28.10.26",
        "Gebucht",
        "Arbeitgeber GmbH",
        "Erika Mustermann",
        "Gehalt",
        "1.000",
      ],
    ];
    expect(proposeProfile(records, "UTF-8")).toMatchObject({
      dateColumn: "Buchungsdatum",
      descriptionColumn: "Verwendungszweck",
      counterpartyColumn: null,
      amount: { mode: "signed", column: "Betrag (€)" },
      dateFormat: "DD.MM.YY",
      decimalSeparator: ",",
    });
  });

  test("takes Buchungstext as the description only without Verwendungszweck", () => {
    const both = [
      ["Buchungstag", "Buchungstext", "Verwendungszweck", "Betrag"],
      ["01.10.2026", "KARTENZAHLUNG", "Supermarkt", "-12,00"],
    ];
    expect(proposeProfile(both, "UTF-8").descriptionColumn).toBe("Verwendungszweck");
    const textOnly = [
      ["Buchungstag", "Wertstellung", "Umsatzart", "Buchungstext", "Betrag", "Währung"],
      ["01.10.2026", "01.10.2026", "Lastschrift", "Supermarkt Einkauf", "-10,7", "EUR"],
    ];
    expect(proposeProfile(textOnly, "UTF-8")).toMatchObject({
      dateColumn: "Buchungstag",
      descriptionColumn: "Buchungstext",
      counterpartyColumn: null,
    });
  });
});

describe("proposeProfile by content", () => {
  test("proposes no header row, the date and the amount by position (scenario 6)", () => {
    const records = [
      ["01.10.2026", "Bäckerei Kern Brötchen", "-4,50"],
      ["02.10.2026", "Gehalt Oktober", "2.500,00"],
      ["03.10.2026", "Miete", "-850,00"],
    ];
    expect(proposeProfile(records, "UTF-8")).toEqual({
      ...newProfileDraft(),
      hasHeaderRow: false,
      dateColumn: 0,
      descriptionColumn: null,
      counterpartyColumn: null,
      amount: { mode: "signed", column: 2, invertSign: false },
    });
  });

  test("takes record 1 for column names it does not know when the rows under it read as dates", () => {
    const records = [
      ["Day", "Note", "Sum"],
      ["01.10.2026", "Coffee", "-3,20"],
      ["02.10.2026", "Lunch", "-9,80"],
    ];
    expect(proposeProfile(records, "UTF-8")).toMatchObject({
      hasHeaderRow: true,
      dateColumn: "Day",
      descriptionColumn: null,
      counterpartyColumn: null,
      amount: { mode: "signed", column: "Sum" },
    });
  });

  test("proposes the first column in which more than half of the cells read as a date", () => {
    const records = [
      ["Ref 1", "01.10.2026", "x", "-1,00"],
      ["02.10.2026", "02.10.2026", "y", "-2,00"],
      ["Ref 3", "03.10.2026", "z", "-3,00"],
    ];
    expect(proposeProfile(records, "UTF-8")).toMatchObject({
      hasHeaderRow: false,
      dateColumn: 1,
      amount: { mode: "signed", column: 3 },
    });
  });

  test("does not let a closing balance under the rows keep its column from being the amount", () => {
    const records = [
      ["Day", "Note", "Sum"],
      ["01.10.2026", "Coffee", "-3,20"],
      ["02.10.2026", "Lunch", "-9,80"],
      ["03.10.2026", "Book", "-14,00"],
      ["Neuer Kontostand", "", "1.234,56 EUR"],
    ];
    expect(proposeProfile(records, "UTF-8")).toMatchObject({
      dateColumn: "Day",
      amount: { mode: "signed", column: "Sum" },
      decimalSeparator: ",",
    });
  });

  test("proposes nothing but the encoding for a file of one column", () => {
    const records = [["Note"], ["Coffee"], ["Lunch"]];
    expect(proposeProfile(records, "UTF-16LE")).toMatchObject({
      name: "",
      dateColumn: null,
      descriptionColumn: null,
      counterpartyColumn: null,
      amount: { mode: "signed", column: null, invertSign: false },
      dateFormat: "DD.MM.YYYY",
      decimalSeparator: ",",
      encoding: "UTF-16LE",
    });
  });
});

describe("proposeProfile's date format and decimal separator", () => {
  const dated = (dates: string[], amounts: string[]) => [
    ["Date", "Purpose", "Amount"],
    ...dates.map((date, index) => [date, `Row ${index + 1}`, amounts[index] ?? "-1,00"]),
  ];

  test("proposes the day-first format when no day is above 12", () => {
    const records = dated(["01/10/2026", "05/10/2026", "12/10/2026"], []);
    expect(proposeProfile(records, "UTF-8").dateFormat).toBe("DD/MM/YYYY");
  });

  test("proposes the format under which the most cells parse", () => {
    expect(proposeProfile(dated(["10/01/2026", "10/25/2026"], []), "UTF-8").dateFormat).toBe(
      "MM/DD/YYYY",
    );
    expect(proposeProfile(dated(["2026-10-01", "2026-10-02"], []), "UTF-8").dateFormat).toBe(
      "YYYY-MM-DD",
    );
    expect(proposeProfile(dated(["01.10.26", "02.10.26"], []), "UTF-8").dateFormat).toBe(
      "DD.MM.YY",
    );
  });

  test("proposes the comma when amounts such as 40 and 1250 read under both", () => {
    const records = dated(["01.10.2026", "02.10.2026"], ["40", "-1250"]);
    expect(proposeProfile(records, "UTF-8").decimalSeparator).toBe(",");
  });

  test("proposes the point when more amounts read under it", () => {
    const records = dated(["01.10.2026", "02.10.2026", "03.10.2026"], ["-4.50", "1,250.00", "40"]);
    expect(proposeProfile(records, "UTF-8").decimalSeparator).toBe(".");
  });

  test("leaves the name empty and sign inversion off, with the encoding passed in", () => {
    const records = dated(["01.10.2026"], ["12,00"]);
    expect(proposeProfile(records, "Windows-1252")).toMatchObject({
      name: "",
      id: null,
      amount: { invertSign: false },
      encoding: "Windows-1252",
    });
  });
});

describe("suggestsInvertedSign", () => {
  const signed: MappingProfile = {
    id: "notebook",
    name: "Notebook",
    hasHeaderRow: true,
    dateColumn: "Date",
    descriptionColumn: "Purpose",
    counterpartyColumn: null,
    amount: { mode: "signed", column: "Amount", invertSign: false },
    dateFormat: "DD.MM.YYYY",
    decimalSeparator: ",",
    encoding: "UTF-8",
  };

  const parsed = (amountCents: number, rowNumber = 2): RecordRow => ({
    status: "parsed",
    rowNumber,
    date: "2026-10-01",
    amountCents,
    description: "Coffee",
    counterparty: null,
  });

  const unparsable: RecordRow = {
    status: "unparsable",
    rowNumber: 9,
    cells: ["Total", "-17,70"],
    failure: { code: "date-unreadable", details: { cell: "Total", format: "DD.MM.YYYY" } },
  };

  test("is true when every parsed amount is positive, unparsable rows not counted", () => {
    expect(suggestsInvertedSign(signed, [parsed(320), parsed(980, 3)])).toBe(true);
    expect(suggestsInvertedSign(signed, [parsed(320), unparsable])).toBe(true);
  });

  test("is false with one negative amount", () => {
    expect(suggestsInvertedSign(signed, [parsed(320), parsed(-980, 3)])).toBe(false);
  });

  test("is false with no parsed amount", () => {
    expect(suggestsInvertedSign(signed, [])).toBe(false);
    expect(suggestsInvertedSign(signed, [unparsable])).toBe(false);
  });

  test("is false while the sign is inverted", () => {
    const inverted: MappingProfile = {
      ...signed,
      amount: { mode: "signed", column: "Amount", invertSign: true },
    };
    expect(suggestsInvertedSign(inverted, [parsed(-320)])).toBe(false);
    expect(suggestsInvertedSign(inverted, [parsed(320)])).toBe(false);
  });

  test("is false with debit and credit columns", () => {
    const debitCredit: MappingProfile = {
      ...signed,
      amount: { mode: "debit-credit", debitColumn: "Soll", creditColumn: "Haben" },
    };
    expect(suggestsInvertedSign(debitCredit, [parsed(320)])).toBe(false);
  });
});
