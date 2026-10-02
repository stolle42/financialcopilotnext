import { isCalendarDate } from "../dates";
import type { DateFormat } from "../types";

type Part = "day" | "month" | "year";

const D = "(\\d{1,2})";
const YYYY = "(\\d{4})";
const YY = "(\\d{2})";

// Each format's pattern and the order of its parts; `DD` and `MM` take one or two digits.
const formats: Record<DateFormat, { pattern: RegExp; parts: readonly Part[] }> = {
  "DD.MM.YYYY": { pattern: new RegExp(`^${D}\\.${D}\\.${YYYY}$`), parts: ["day", "month", "year"] },
  "DD.MM.YY": { pattern: new RegExp(`^${D}\\.${D}\\.${YY}$`), parts: ["day", "month", "year"] },
  "DD/MM/YYYY": { pattern: new RegExp(`^${D}/${D}/${YYYY}$`), parts: ["day", "month", "year"] },
  "MM/DD/YYYY": { pattern: new RegExp(`^${D}/${D}/${YYYY}$`), parts: ["month", "day", "year"] },
  "YYYY-MM-DD": { pattern: new RegExp(`^${YYYY}-${D}-${D}$`), parts: ["year", "month", "day"] },
  "DD-MM-YYYY": { pattern: new RegExp(`^${D}-${D}-${YYYY}$`), parts: ["day", "month", "year"] },
};

/**
 * A bank file's date as `YYYY-MM-DD`, or `null` unless the text matches `format` exactly and is a
 * real date (contracts/csv-import.md, date formats). `YY` means 20YY.
 */
export function parseBankDate(text: string, format: DateFormat): string | null {
  const { pattern, parts } = formats[format];
  const match = pattern.exec(text);
  if (!match) return null;

  const value = (part: Part) => match[parts.indexOf(part) + 1] ?? "";
  const year = value("year").length === 2 ? `20${value("year")}` : value("year");
  const date = `${year}-${value("month").padStart(2, "0")}-${value("day").padStart(2, "0")}`;
  return isCalendarDate(date) ? date : null;
}
