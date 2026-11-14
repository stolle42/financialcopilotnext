// The column names banks give each role, in order of preference (contracts/csv-import.md, column
// names; R-34). The proposal of a new bank CSV format and the search for the header below a
// bank's account details both read this one table. Names compare by name key.

export const COLUMN_NAMES = {
  date: [
    "Buchungstag",
    "Buchungsdatum",
    "Buchung",
    "Booking date",
    "Transaction date",
    "Date",
    "Datum",
    "Valutadatum",
    "Valuta",
    "Wertstellungsdatum",
    "Wertstellung",
    "Wertstellung (Valuta)",
    "Wert",
    "Value date",
  ],
  debit: ["Soll", "Debit", "Ausgang", "Belastung", "Money out", "Paid out"],
  credit: ["Haben", "Credit", "Eingang", "Gutschrift", "Money in", "Paid in"],
  amount: [
    "Betrag",
    "Betrag (EUR)",
    "Betrag (€)",
    "Betrag in EUR",
    "Umsatz",
    "Umsatz in EUR",
    "Amount",
    "Amount (EUR)",
  ],
  description: [
    "Verwendungszweck",
    "Purpose",
    "Payment reference",
    "Reference",
    "Description",
    "Memo",
    "Details",
    "Buchungstext",
    "Text",
  ],
  // DKB fills a payer and a payee column by direction, so neither is listed (R-34).
  counterparty: [
    "Beguenstigter/Zahlungspflichtiger",
    "Begünstigter/Zahlungspflichtiger",
    "Begünstigter / Auftraggeber",
    "Beguenstigter / Auftraggeber",
    "Auftraggeber / Begünstigter",
    "Name Zahlungsbeteiligter",
    "Auftraggeber/Empfänger",
    "Auftraggeber/Empfaenger",
    "Zahlungsempfänger",
    "Zahlungsempfaenger",
    "Empfänger",
    "Empfaenger",
    "Auftraggeber",
    "Payee",
    "Partner name",
    "Counterparty",
    "Merchant",
    "Name",
  ],
} as const satisfies Record<string, readonly string[]>;

export type ColumnRole = keyof typeof COLUMN_NAMES;
