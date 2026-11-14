import { parseAmount } from "../amounts";
import { nameKey } from "../names";
import {
  DATE_FORMATS,
  type DateFormat,
  type DecimalSeparator,
  type Encoding,
  type MappingProfile,
} from "../types";
import { COLUMN_NAMES } from "./columnNames";
import { parseBankDate } from "./dates";
import { newProfileDraft, type ProfileDraft } from "./profiles";
import { headerIndex, namesDateAndAmount, type RecordRow } from "./rows";

// A new bank CSV format proposed from the file being imported, so the user only names it
// (contracts/csv-import.md, proposing a format, rules 2–8; FR-133, R-33).

const SEPARATORS: readonly DecimalSeparator[] = [",", "."];

const isBlank = (record: readonly string[]) => record.every((cell) => cell.trim() === "");
const cellOf = (record: readonly string[], column: number) => (record[column] ?? "").trim();

const readsAsDate = (text: string) =>
  DATE_FORMATS.some((format) => parseBankDate(text, format) !== null);
const readsAsAmount = (text: string) =>
  SEPARATORS.some((separator) => parseAmount(text, separator) !== null);

/** The first column, not yet taken, in which more than half of the data cells pass `test`. */
function columnByContent(
  rows: readonly string[][],
  width: number,
  taken: ReadonlySet<number>,
  test: (text: string) => boolean,
): number | null {
  if (rows.length === 0) return null;
  for (let column = 0; column < width; column++) {
    if (taken.has(column)) continue;
    const passing = rows.filter((row) => test(cellOf(row, column))).length;
    if (passing * 2 > rows.length) return column;
  }
  return null;
}

/** The format under which the most cells parse, the first of DATE_FORMATS on a tie (rule 6). */
function dateFormatOf(cells: readonly string[]): DateFormat | null {
  let best: { format: DateFormat; count: number } | null = null;
  for (const format of DATE_FORMATS) {
    const count = cells.filter((cell) => parseBankDate(cell, format) !== null).length;
    if (count > 0 && (best === null || count > best.count)) best = { format, count };
  }
  return best?.format ?? null;
}

/** The separator under which more cells follow the grammar, the comma on a tie (rule 7). */
function decimalSeparatorOf(cells: readonly string[]): DecimalSeparator {
  const count = (separator: DecimalSeparator) =>
    cells.filter((cell) => parseAmount(cell, separator) !== null).length;
  return count(".") > count(",") ? "." : ",";
}

/** Where the column names are, if anywhere (rule 3). */
function headerOf(records: readonly string[][]): number | null {
  // headerIndex gives record 0 both for column names there and for none found.
  const named = headerIndex(records, newProfileDraft()) as number;
  const first = records[0] ?? [];
  if (named > 0 || namesDateAndAmount(first)) return named;

  const others = records.slice(1).filter((record) => !isBlank(record));
  const width = Math.max(0, ...others.map((record) => record.length));
  const othersHaveDates = columnByContent(others, width, new Set(), readsAsDate) !== null;
  const firstHasDates = first.some((cell) => readsAsDate(cell.trim()));
  return othersHaveDates && !firstHasDates ? 0 : null;
}

/**
 * The draft a new bank CSV format starts with for a file's records: `newProfileDraft()` with
 * what the records tell, the name empty and sign inversion off (contracts/csv-import.md, proposing
 * a format, rules 2–8). `encoding` is the one the records were decoded with.
 */
export function proposeProfile(records: readonly string[][], encoding: Encoding): ProfileDraft {
  const header = headerOf(records);
  const rows = records.slice(header === null ? 0 : header + 1).filter((record) => !isBlank(record));
  const headerCells = header === null ? [] : records[header]!.map((cell) => cell.trim());
  const width = Math.max(headerCells.length, ...rows.map((record) => record.length));

  // Rule 4: each role takes the first of its names that is a column not taken yet.
  const taken = new Set<number>();
  const byName = (names: readonly string[]): number | null => {
    for (const name of names) {
      const column = headerCells.findIndex(
        (cell, index) => !taken.has(index) && nameKey(cell) === nameKey(name),
      );
      if (column !== -1) {
        taken.add(column);
        return column;
      }
    }
    return null;
  };
  let date = byName(COLUMN_NAMES.date);
  const debit = byName(COLUMN_NAMES.debit);
  const credit = byName(COLUMN_NAMES.credit);
  let amount = byName(COLUMN_NAMES.amount);
  const description = byName(COLUMN_NAMES.description);
  const counterparty = byName(COLUMN_NAMES.counterparty);
  const debitCredit = amount === null && debit !== null && credit !== null;
  if (!debitCredit) {
    if (debit !== null) taken.delete(debit);
    if (credit !== null) taken.delete(credit);
  }

  // Rule 5: the date, and a signed amount, by content.
  if (date === null) {
    date = columnByContent(rows, width, taken, readsAsDate);
    if (date !== null) taken.add(date);
  }
  if (!debitCredit && amount === null) {
    amount = columnByContent(rows, width, taken, readsAsAmount);
  }

  const cellsOf = (column: number | null) =>
    column === null ? [] : rows.map((row) => cellOf(row, column)).filter((cell) => cell !== "");
  const amountCells = debitCredit ? [...cellsOf(debit), ...cellsOf(credit)] : cellsOf(amount);
  const start = newProfileDraft();
  const settings = {
    id: start.id,
    name: start.name,
    dateFormat: dateFormatOf(cellsOf(date)) ?? start.dateFormat,
    decimalSeparator:
      amountCells.length > 0 ? decimalSeparatorOf(amountCells) : start.decimalSeparator,
    encoding,
  };

  if (header === null) {
    return {
      ...settings,
      hasHeaderRow: false,
      dateColumn: date,
      descriptionColumn: null,
      counterpartyColumn: null,
      amount: { mode: "signed", column: amount, invertSign: false },
    };
  }
  // With column names, a column is its header's text; one without a text cannot be mapped.
  const named = (column: number | null) =>
    column === null || headerCells[column] === "" ? null : headerCells[column]!;
  return {
    ...settings,
    hasHeaderRow: true,
    dateColumn: named(date),
    descriptionColumn: named(description),
    counterpartyColumn: named(counterparty),
    amount: debitCredit
      ? { mode: "debit-credit", debitColumn: named(debit), creditColumn: named(credit) }
      : { mode: "signed", column: named(amount), invertSign: false },
  };
}

/**
 * Whether the editor suggests Invert the sign: one signed column without inversion, and parsed
 * rows that hold at least one amount and none below zero (contracts/csv-import.md, sign hint;
 * FR-134). Unparsable rows do not count.
 */
export function suggestsInvertedSign(
  profile: MappingProfile | ProfileDraft,
  rows: readonly RecordRow[],
): boolean {
  if (profile.amount.mode !== "signed" || profile.amount.invertSign) return false;
  const amounts = rows.flatMap((row) => (row.status === "parsed" ? [row.amountCents] : []));
  return amounts.length > 0 && amounts.every((cents) => cents >= 0);
}
