import type { Changes, Context } from "../changes";
import { protectedCategory } from "../categories";
import type { ParsedRow, State, Transaction } from "../types";
import { proposedSide } from "./direction";
import { isSetAside } from "./groups";
import { pairFits } from "./transfers";

/** The vendor fields a row's counterparty gives; none when the file named no counterparty. */
const vendorOf = (counterparty: string | null) =>
  counterparty === null ? {} : { vendor: counterparty };

/** A row under review as a ledger transaction, by the confirmation table of data-model.md. */
function toTransaction(
  row: ParsedRow,
  batchAccountId: string,
  seq: number,
  id: string,
  /** The category a row set aside enters with, whatever it holds: its side's Uncategorised. */
  uncategorisedId?: string,
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
      categoryId: uncategorisedId ?? assignment.categoryId,
      ...vendorOf(row.counterparty),
    };
  }
  // Money out goes to the counter-account; money in comes from it. The counterparty is the
  // batch account's side of the transfer: its vendor when money leaves, its destination vendor
  // when money arrives (FR-145).
  const moneyOut = row.amountCents <= 0;
  return {
    ...fields,
    kind: "transfer",
    accountId: moneyOut ? batchAccountId : assignment.counterAccountId,
    destinationAccountId: moneyOut ? assignment.counterAccountId : batchAccountId,
    ...(row.counterparty === null
      ? {}
      : moneyOut
        ? { vendor: row.counterparty }
        : { destinationVendor: row.counterparty }),
  };
}

/**
 * The paired transaction of `row` as the transfer it becomes (FR-144): an expense on the
 * counter-account is the money's way out of there into the batch account, an income is the way out
 * of the batch account into it. The transaction keeps its identity, date, amount and text; it loses
 * its category; its own vendor stays on its own side and the row's counterparty fills the other.
 */
function convertPaired(
  paired: Transaction & { kind: "expense" | "income" },
  row: ParsedRow,
  batchAccountId: string,
): Transaction {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the category does not survive
  const { categoryId, kind, vendor, ...rest } = paired;
  const toBatch = kind === "expense";
  const own = vendor === undefined ? {} : toBatch ? { vendor } : { destinationVendor: vendor };
  const theirs =
    row.counterparty === null
      ? {}
      : toBatch
        ? { destinationVendor: row.counterparty }
        : { vendor: row.counterparty };
  return {
    ...rest,
    kind: "transfer",
    accountId: toBatch ? paired.accountId : batchAccountId,
    destinationAccountId: toBatch ? batchAccountId : paired.accountId,
    ...own,
    ...theirs,
  };
}

/** The rows of the batch that enter the ledger on confirmation, in file order. */
function enteringRows(state: State): ParsedRow[] {
  return (state.pendingBatch?.rows ?? []).filter(
    (row): row is ParsedRow => row.status === "parsed" && row.included,
  );
}

/**
 * Books every row under review into the ledger, in file order with consecutive `seq` values, and
 * removes the batch, all in one change (FR-027). A row that holds a suggested transfer whose pair
 * still fits changes that transaction into the transfer and adds none; one whose pair no longer
 * fits is booked as an ordinary transfer (FR-144). A row set aside is booked in its side's
 * "Uncategorised", whatever it holds (FR-152). The settings stay as they are (FR-006). With no
 * batch pending there is nothing to do, so a repeated confirmation changes nothing.
 */
export function confirmBatch(state: State, context: Context): Changes {
  const batch = state.pendingBatch;
  if (!batch) return {};
  let seq = state.transactions.reduce((max, t) => Math.max(max, t.seq), 0);
  const converted = new Map<string, Transaction>();
  const added: Transaction[] = [];
  for (const row of enteringRows(state)) {
    const pairedId =
      row.assignment.type === "transfer" ? row.assignment.pairedTransactionId : undefined;
    const paired =
      pairedId === undefined ? undefined : state.transactions.find((t) => t.id === pairedId);
    if (paired && paired.kind !== "transfer" && !converted.has(paired.id) && pairFits(row, state)) {
      converted.set(paired.id, convertPaired(paired, row, batch.accountId));
    } else {
      const uncategorisedId = isSetAside(row, state.settings.setAsideUnderCents)
        ? protectedCategory(state.categories, proposedSide(row.amountCents), "uncategorised").id
        : undefined;
      added.push(toTransaction(row, batch.accountId, ++seq, context.newId(), uncategorisedId));
    }
  }
  const put = [...converted.values(), ...added];
  return {
    ...(put.length > 0 ? { transactions: { put } } : {}),
    pendingBatch: { delete: [batch.id] },
  };
}

/** What the confirmation states: the rows entering the ledger and those becoming transfers. */
export interface ConfirmationCounts {
  entering: number;
  setAside: number;
  becomingTransfers: number;
}

/** The counts the Confirm modal shows (FR-157); all zero with no batch pending. */
export function confirmationCounts(state: State): ConfirmationCounts {
  const rows = enteringRows(state);
  return {
    entering: rows.length,
    setAside: rows.filter((row) => isSetAside(row, state.settings.setAsideUnderCents)).length,
    becomingTransfers: rows.filter((row) => row.assignment.type === "transfer").length,
  };
}

/** Removes the batch; nothing enters the ledger (FR-027). */
export function discardBatch(state: State): Changes {
  return state.pendingBatch ? { pendingBatch: { delete: [state.pendingBatch.id] } } : {};
}
