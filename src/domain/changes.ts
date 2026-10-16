import type {
  Account,
  Budget,
  Category,
  ChatTurn,
  MappingProfile,
  PendingBatch,
  Refusal,
  Settings,
  State,
  Transaction,
} from "./types";

/** Records to put and keys to delete in one store. Deletes apply before puts. */
export interface StoreChanges<Item> {
  put?: readonly Item[];
  delete?: readonly string[];
}

/**
 * What a domain function decides to change, per store of `State`. The store writes it to storage
 * in one transaction, then applies it in memory with `applyChanges` (R-05, R-06).
 */
export interface Changes {
  accounts?: StoreChanges<Account>;
  categories?: StoreChanges<Category>;
  transactions?: StoreChanges<Transaction>;
  /** Keyed by `categoryId`. */
  budgets?: StoreChanges<Budget>;
  profiles?: StoreChanges<MappingProfile>;
  pendingBatch?: StoreChanges<PendingBatch>;
  settings?: { put: Settings };
  /** The whole conversation, which replaces the one before; an empty list clears it (R-26). */
  conversation?: { put: readonly ChatTurn[] };
}

/** The values a decision needs from outside, injected by the store so the domain stays pure (R-05). */
export interface Context {
  /** The local calendar date of the action. */
  today: string;
  newId: () => string;
}

/** A domain function returns either a refusal or the changes to make (R-15). */
export function isRefusal<Code extends string>(
  decision: Changes | Refusal<Code>,
): decision is Refusal<Code> {
  return "code" in decision;
}

function applyStore<Item>(
  items: readonly Item[],
  changes: StoreChanges<Item> | undefined,
  keyOf: (item: Item) => string,
): readonly Item[] {
  if (!changes) return items;
  const deleted = new Set(changes.delete);
  const put = new Map((changes.put ?? []).map((item) => [keyOf(item), item]));
  const kept = items
    .filter((item) => !deleted.has(keyOf(item)) || put.has(keyOf(item)))
    .map((item) => {
      const replacement = put.get(keyOf(item));
      put.delete(keyOf(item));
      return replacement ?? item;
    });
  return [...kept, ...put.values()];
}

const byId = (item: { id: string }) => item.id;

/** The state after `changes`; the input state is left untouched. */
export function applyChanges(state: State, changes: Changes): State {
  const batchList = applyStore(
    state.pendingBatch ? [state.pendingBatch] : [],
    changes.pendingBatch,
    byId,
  );
  return {
    accounts: applyStore(state.accounts, changes.accounts, byId),
    categories: applyStore(state.categories, changes.categories, byId),
    transactions: applyStore(state.transactions, changes.transactions, byId),
    budgets: applyStore(state.budgets, changes.budgets, (budget) => budget.categoryId),
    profiles: applyStore(state.profiles, changes.profiles, byId),
    pendingBatch: changes.pendingBatch ? (batchList.at(-1) ?? null) : state.pendingBatch,
    settings: changes.settings?.put ?? state.settings,
    conversation: changes.conversation?.put ?? state.conversation,
  };
}
