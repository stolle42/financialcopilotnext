import type { DecimalSeparator } from "@/domain/types";

// The one amount formatter and the one date formatter (contracts/ui.md, shared patterns).
const amountFormat = new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" });
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

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

/** The decimal separator of the browser locale, which the amount field accepts. */
export function localeDecimalSeparator(): DecimalSeparator {
  const decimal = new Intl.NumberFormat()
    .formatToParts(1.5)
    .find((part) => part.type === "decimal");
  return decimal?.value === "," ? "," : ".";
}
