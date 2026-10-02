import { createContext } from "react";
import type { Transaction } from "@/domain/types";

/**
 * Opens the one transaction form the shell holds: empty for a new transaction, or with
 * `transaction` for editing it. The header and the transaction list both use it.
 */
export const OpenTransactionFormContext = createContext<(transaction: Transaction | null) => void>(
  () => {
    throw new Error("OpenTransactionFormContext is used outside the shell");
  },
);
