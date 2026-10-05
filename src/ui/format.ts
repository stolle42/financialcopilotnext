import type { DecimalSeparator } from "@/domain/types";

// The one amount formatter and the one date formatter (contracts/ui.md, shared patterns).
const amountFormat = new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" });
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const shareFormat = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 1,
});
const monthFormat = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });

/** Euros with the € sign and two decimals, in the browser's number format (FR-060). */
export function formatAmount(cents: number): string {
  return amountFormat.format(cents / 100);
}

/** A `YYYY-MM-DD` calendar date in the browser's medium date style. */
export function formatDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  // A local date: `new Date("2026-09-03")` would be UTC midnight, the day before in the Americas.
  return dateFormat.format(new Date(year, month - 1, day));
}

/** A `YYYY-MM` month in the browser's short style, such as "Sep 2026". */
export function formatMonth(month: string): string {
  const [year, number] = month.split("-").map(Number) as [number, number];
  // A local date, as in `formatDate`: the first of the month never falls into the month before.
  return monthFormat.format(new Date(year, number - 1, 1));
}

/** A share from 0 to 1 as a percentage with at most one decimal, such as "33.3%". */
export function formatShare(share: number): string {
  return shareFormat.format(share);
}

/** The decimal separator of the browser locale, which the amount field accepts. */
export function localeDecimalSeparator(): DecimalSeparator {
  const decimal = new Intl.NumberFormat()
    .formatToParts(1.5)
    .find((part) => part.type === "decimal");
  return decimal?.value === "," ? "," : ".";
}
