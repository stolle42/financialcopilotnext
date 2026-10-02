import type { Changes, Context } from "../changes";
import type { ParsedRow, State, Transaction } from "../types";
import { proposedSide } from "./direction";

/** A row under review as a ledger transaction, by the confirmation table of data-model.md. */
function toTransaction(
  row: ParsedRow,
  batchAccountId: string,
  seq: number,
  id: string,
): Transaction {
  const fields = {
    id,
    seq,
    date: row.date,
    amountCents: Math.abs(row.amountCents),
    description: row.description,
  };
  const assignment = row.assignment;
  if (assignment.type === "category") {
    return {
      ...fields,
      accountId: batchAccountId,
      kind: proposedSide(row.amountCents),
      categoryId: assignment.categoryId,
    };
  }
  // Money out goes to the counter-account; money in comes from it.
  const moneyOut = row.amountCents <= 0;
  return {
    ...fields,
    kind: "transfer",
    accountId: moneyOut ? batchAccountId : assignment.counterAccountId,
    destinationAccountId: moneyOut ? assignment.counterAccountId : batchAccountId,
  };
}

/**
 * Books every row under review into the ledger, in file order with consecutive `seq` values, and
 * removes the batch, all in one change (FR-027). The settings stay as they are (FR-006). With no
 * batch pending there is nothing to do, so a repeated confirmation changes nothing.
 */
export function confirmBatch(state: State, context: Context): Changes {
  const batch = state.pendingBatch;
  if (!batch) return {};
  let seq = state.transactions.reduce((max, t) => Math.max(max, t.seq), 0);
  const transactions = batch.rows
    .filter((row): row is ParsedRow => row.status === "parsed" && row.included)
    .map((row) => toTransaction(row, batch.accountId, ++seq, context.newId()));
  return { transactions: { put: transactions }, pendingBatch: { delete: [batch.id] } };
}

/** Removes the batch; nothing enters the ledger (FR-027). */
export function discardBatch(state: State): Changes {
  return state.pendingBatch ? { pendingBatch: { delete: [state.pendingBatch.id] } } : {};
}
