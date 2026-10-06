import type { ComponentProps } from "react";
import { parseAmount } from "@/domain/amounts";
import { Input } from "@/ui/components/ui/input";
import { localeDecimalSeparator } from "@/ui/format";

// The amount input of contracts/ui.md, shared patterns: the browser's decimal separator and the
// amount grammar of CSV import, so at most two decimals.

/** Cents as editable text, such as `1250.00` or `1250,00`, without thousands separators. */
export function amountText(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const whole = Math.floor(Math.abs(cents) / 100);
  const fraction = String(Math.abs(cents) % 100).padStart(2, "0");
  return `${sign}${whole}${localeDecimalSeparator()}${fraction}`;
}

/** The cents of typed text, or `null` when it is not an amount or is negative where not allowed. */
export function parseAmountText(text: string, allowNegative: boolean): number | null {
  const cents = parseAmount(text.trim(), localeDecimalSeparator());
  return cents === null || (!allowNegative && cents < 0) ? null : cents;
}

type AmountFieldProps = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (text: string) => void;
};

/** A text field for an amount. It selects its content on focus, so typing replaces it (SC-002). */
export function AmountField({ value, onValueChange, onFocus, ...props }: AmountFieldProps) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      onFocus={(event) => {
        event.currentTarget.select();
        onFocus?.(event);
      }}
    />
  );
}
