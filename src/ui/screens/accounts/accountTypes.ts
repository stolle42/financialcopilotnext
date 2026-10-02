import type { AccountType } from "@/domain/types";

/** The account types with their labels, in the order the type select offers them. */
export const accountTypes: { value: AccountType; label: string }[] = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit-card", label: "Credit card" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

export function accountTypeLabel(type: AccountType): string {
  return accountTypes.find((option) => option.value === type)?.label ?? type;
}
