import type { Changes, Context } from "./changes";
import { compareNames, isNameTaken, nameKey } from "./names";
import type { Account, AccountType, Refusal, State, Transaction } from "./types";

export type AccountRefusalCode = "account-name-empty" | "account-name-taken";

export interface AccountInput {
  name: string;
  type: AccountType;
  /** What the account held before its earliest transaction, in cents, of any sign (FR-001). */
  openingBalanceCents: number;
}

/** How a transaction changes one account's balance (data-model.md, derived values). */
export function signedEffect(transaction: Transaction, accountId: string): number {
  if (transaction.accountId === accountId) {
    return transaction.kind === "income" ? transaction.amountCents : -transaction.amountCents;
  }
  if (transaction.kind === "transfer" && transaction.destinationAccountId === accountId) {
    return transaction.amountCents;
  }
  return 0;
}

/** The opening balance plus the net effect of the account's transactions; never stored (FR-002). */
export function accountBalance(state: State, accountId: string): number {
  const account = state.accounts.find((a) => a.id === accountId);
  if (!account) throw new Error(`No account ${accountId}`);
  return state.transactions.reduce(
    (balance, transaction) => balance + signedEffect(transaction, accountId),
    account.openingBalanceCents,
  );
}

function checkName(
  state: State,
  name: string,
  exceptId?: string,
): Refusal<AccountRefusalCode> | null {
  if (nameKey(name) === "") return { code: "account-name-empty" };
  if (isNameTaken(state.accounts, name, exceptId)) return { code: "account-name-taken" };
  return null;
}

export function createAccount(
  state: State,
  input: AccountInput,
  context: Context,
): Changes | Refusal<AccountRefusalCode> {
  const refusal = checkName(state, input.name);
  if (refusal) return refusal;
  const account: Account = { id: context.newId(), ...input, name: input.name.trim() };
  return { accounts: { put: [account] } };
}

/** Changing the opening balance creates no transaction; the UI warns first (FR-001). */
export function updateAccount(
  state: State,
  id: string,
  input: AccountInput,
): Changes | Refusal<AccountRefusalCode> {
  if (!state.accounts.some((a) => a.id === id)) throw new Error(`No account ${id}`);
  const refusal = checkName(state, input.name, id);
  if (refusal) return refusal;
  return { accounts: { put: [{ id, ...input, name: input.name.trim() }] } };
}

/** Accounts by name, ignoring case (contracts/ui.md, list order). */
export function sortAccounts(accounts: readonly Account[]): Account[] {
  return [...accounts].sort((a, b) => compareNames(a.name, b.name));
}
