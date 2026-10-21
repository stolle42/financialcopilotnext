import type { Category, State } from "./types";

type SeedCategory = Omit<Category, "id">;

// The seed data of data-model.md (FR-031).
const seedCategories: readonly SeedCategory[] = [
  { side: "expense", name: "Groceries", color: "#40c057", role: null },
  { side: "expense", name: "Eating out", color: "#fd7e14", role: null },
  { side: "expense", name: "Housing", color: "#4c6ef5", role: null },
  { side: "expense", name: "Utilities", color: "#15aabf", role: null },
  { side: "expense", name: "Transport", color: "#228be6", role: null },
  { side: "expense", name: "Health", color: "#fa5252", role: null },
  { side: "expense", name: "Shopping", color: "#e64980", role: null },
  { side: "expense", name: "Leisure", color: "#be4bdb", role: null },
  { side: "expense", name: "Travel", color: "#12b886", role: null },
  { side: "expense", name: "Uncategorised", color: "#adb5bd", role: "uncategorised" },
  { side: "expense", name: "Unaccounted", color: "#495057", role: "unaccounted" },
  { side: "income", name: "Salary", color: "#37b24d", role: null },
  { side: "income", name: "Interest", color: "#fab005", role: null },
  { side: "income", name: "Gifts", color: "#7950f2", role: null },
  { side: "income", name: "Uncategorised", color: "#adb5bd", role: "uncategorised" },
  { side: "income", name: "Unaccounted", color: "#495057", role: "unaccounted" },
];

/** The state of a first launch: the account Cash as the default, and the predefined categories. */
export function seedState(newId: () => string): State {
  const cashId = newId();
  return {
    accounts: [{ id: cashId, name: "Cash", type: "cash", openingBalanceCents: 0 }],
    categories: seedCategories.map((category) => ({ id: newId(), ...category })),
    transactions: [],
    budgets: [],
    profiles: [],
    pendingBatch: null,
    settings: { manualEntryAccountId: cashId },
    apiKey: null,
    conversation: [],
  };
}
