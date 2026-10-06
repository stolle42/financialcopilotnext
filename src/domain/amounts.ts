import type { DecimalSeparator } from "./types";

const MAX_INTEGER_DIGITS = 12;

const grammars: Record<DecimalSeparator, RegExp> = {
  ",": /^([+-]?)(\d+|\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/,
  ".": /^([+-]?)(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/,
};

/**
 * Reads an amount as integer cents, or `null` when the text breaks the amount grammar of
 * contracts/csv-import.md. The other separator groups thousands, in groups of exactly three, so a
 * file read with the wrong decimal separator fails instead of being off by a factor of 100.
 * The text is expected to be trimmed already.
 */
export function parseAmount(text: string, decimalSeparator: DecimalSeparator): number | null {
  const match = grammars[decimalSeparator].exec(text);
  if (!match) return null;

  const [, sign, integerPart = "", fraction = ""] = match;
  const digits = integerPart.replace(/\D/g, "");
  if (digits.length > MAX_INTEGER_DIGITS) return null;

  // Whole cents from the digits alone, so no value passes through floating point.
  const cents = Number(digits) * 100 + Number(fraction.padEnd(2, "0"));
  return sign === "-" && cents !== 0 ? -cents : cents;
}
