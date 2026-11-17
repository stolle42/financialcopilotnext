import { describe, expect, test } from "vitest";
import { protectedCategory } from "../categories";
import { seedState } from "../seed";
import { idCounter } from "../testing";
import type { Category, Transaction } from "../types";
import { usualChoices } from "./usual";

// FR-146, R-42, contracts/csv-import.md, usual choices. A row's usual choice is the choice held by
// more than half of the ledger's transactions of the same vendor that move money the same way:
// a category, or a transfer with one counter-account. The vendors of the ledger are a field of
// v1.8, so they are written through a cast, as the other tests of this feature do.

const checking = "checking";
const cash = "cash-account";
const savings = "savings";

const seeded: readonly Category[] = seedState(idCounter()).categories;
const refunds: Category = {
  id: "refunds",
  side: "income",
  name: "Refunds",
  color: "#228be6",
  role: null,
};
const categories: readonly Category[] = [...seeded, refunds];

const expenseNamed = (name: string) =>
  categories.find((c) => c.side === "expense" && c.name === name)!;
const groceries = expenseNamed("Groceries");
const household = expenseNamed("Housing");
const hobbies = expenseNamed("Leisure");
const salary = categories.find((c) => c.side === "income" && c.name === "Salary")!;
const uncategorisedExpense = protectedCategory(categories, "expense", "uncategorised");
const unaccountedExpense = protectedCategory(categories, "expense", "unaccounted");

interface UsualRow {
  status: "parsed";
  rowNumber: number;
  amountCents: number;
  counterparty: string | null;
  duplicate?: boolean;
}

function row(
  rowNumber: number,
  counterparty: string | null,
  amountCents = -1000,
  duplicate = false,
): UsualRow {
  return { status: "parsed", rowNumber, amountCents, counterparty, duplicate };
}

let seq = 0;
interface Counted {
  vendor?: string;
  destinationVendor?: string;
}

function spend(vendor: string | undefined, categoryId: string, accountId = checking): Transaction {
  return {
    id: `t${(seq += 1)}`,
    seq,
    date: "2026-03-10",
    amountCents: 1000,
    accountId,
    description: "Earlier",
    kind: "expense",
    categoryId,
    ...(vendor === undefined ? {} : { vendor }),
  } as Transaction & Counted;
}

function earn(vendor: string | undefined, categoryId: string, accountId = checking): Transaction {
  return { ...spend(vendor, categoryId, accountId), kind: "income" };
}

function move(from: string, to: string, fields: Counted): Transaction {
  return {
    id: `t${(seq += 1)}`,
    seq,
    date: "2026-03-10",
    amountCents: 4000,
    accountId: from,
    description: "Earlier",
    kind: "transfer",
    destinationAccountId: to,
    ...fields,
  } as Transaction & Counted;
}

/** `n` transactions made by `make`, so a test reads as the proportions it describes. */
const times = (n: number, make: () => Transaction): Transaction[] =>
  Array.from({ length: n }, make);

/** The usual choices of `rows` as `row number → choice`, which is what these tests compare. */
function usual(
  rows: readonly UsualRow[],
  ledger: readonly Transaction[],
  accountId = checking,
): Record<number, unknown> {
  return Object.fromEntries(usualChoices(rows, accountId, ledger, categories));
}

describe("usualChoices: a category (FR-146)", () => {
  test("3 of 5 REWE expenses in Groceries give Groceries", () => {
    const ledger = [
      ...times(3, () => spend("REWE", groceries.id)),
      spend("REWE", household.id),
      spend("REWE", hobbies.id),
    ];
    expect(usual([row(2, "REWE")], ledger)).toEqual({
      2: { type: "category", categoryId: groceries.id },
    });
  });

  test("2 of 4 Amazon expenses in Housing and 2 in Leisure give none: half is not more than half", () => {
    const ledger = [
      ...times(2, () => spend("Amazon", household.id)),
      ...times(2, () => spend("Amazon", hobbies.id)),
    ];
    expect(usual([row(2, "Amazon")], ledger)).toEqual({});
  });

  test("3 of 5 in Uncategorised give none, as do 3 of 5 in Unaccounted", () => {
    const uncategorised = [
      ...times(3, () => spend("Kiosk", uncategorisedExpense.id)),
      ...times(2, () => spend("Kiosk", groceries.id)),
    ];
    expect(usual([row(2, "Kiosk")], uncategorised)).toEqual({});
    const unaccounted = [
      ...times(3, () => spend("Kiosk", unaccountedExpense.id)),
      ...times(2, () => spend("Kiosk", groceries.id)),
    ];
    expect(usual([row(2, "Kiosk")], unaccounted)).toEqual({});
  });

  test("a single earlier transaction is more than half of one", () => {
    expect(usual([row(2, "REWE")], [spend("REWE", groceries.id)])).toEqual({
      2: { type: "category", categoryId: groceries.id },
    });
  });

  test("a vendor the ledger does not know has none", () => {
    expect(usual([row(2, "Aldi")], [spend("REWE", groceries.id)])).toEqual({});
    expect(usual([row(2, "Aldi")], [])).toEqual({});
  });

  test("the transactions of every account count for a category, the batch's account or not", () => {
    const ledger = [
      spend("REWE", groceries.id, checking),
      spend("REWE", groceries.id, cash),
      spend("REWE", groceries.id, savings),
    ];
    expect(usual([row(2, "REWE")], ledger)).toEqual({
      2: { type: "category", categoryId: groceries.id },
    });
  });

  test("each row gets its own, by its own vendor", () => {
    const ledger = [spend("REWE", groceries.id), spend("Amazon", hobbies.id)];
    expect(usual([row(2, "REWE"), row(3, "Amazon"), row(4, "Aldi")], ledger)).toEqual({
      2: { type: "category", categoryId: groceries.id },
      3: { type: "category", categoryId: hobbies.id },
    });
  });
});

describe("usualChoices: money in and money out are kept apart (FR-146)", () => {
  test("a REWE refund gets Refunds from REWE's one income, ignoring REWE's expenses", () => {
    const ledger = [...times(4, () => spend("REWE", groceries.id)), earn("REWE", refunds.id)];
    expect(usual([row(2, "REWE", 1250)], ledger)).toEqual({
      2: { type: "category", categoryId: refunds.id },
    });
    // The same ledger still gives the expenses their own choice.
    expect(usual([row(2, "REWE", -1250)], ledger)).toEqual({
      2: { type: "category", categoryId: groceries.id },
    });
  });

  test("a vendor that only ever took money has none for money in", () => {
    expect(usual([row(2, "REWE", 1250)], [spend("REWE", groceries.id)])).toEqual({});
  });

  test("a vendor that only ever paid has none for money out", () => {
    expect(usual([row(2, "Employer", -500)], [earn("Employer", salary.id)])).toEqual({});
    expect(usual([row(2, "Employer", 500)], [earn("Employer", salary.id)])).toEqual({
      2: { type: "category", categoryId: salary.id },
    });
  });

  test("a row of 0.00 reads as money out, as it is proposed as an expense", () => {
    expect(usual([row(2, "REWE", 0)], [spend("REWE", groceries.id)])).toEqual({
      2: { type: "category", categoryId: groceries.id },
    });
  });
});

describe("usualChoices: a transfer (FR-146)", () => {
  test("4 of 5 Geldautomat rows on Checking as transfers to Cash give a usual transfer to Cash", () => {
    const ledger = [
      ...times(4, () => move(checking, cash, { vendor: "Geldautomat" })),
      spend("Geldautomat", household.id),
    ];
    expect(usual([row(2, "Geldautomat", -4000)], ledger)).toEqual({
      2: { type: "transfer", counterAccountId: cash },
    });
  });

  test("2 transfers to Cash and 2 to Savings give none", () => {
    const ledger = [
      ...times(2, () => move(checking, cash, { vendor: "Geldautomat" })),
      ...times(2, () => move(checking, savings, { vendor: "Geldautomat" })),
    ];
    expect(usual([row(2, "Geldautomat", -4000)], ledger)).toEqual({});
  });

  test("a transfer from Checking to Cash with vendor Geldautomat counts for a Checking row, not a Cash row", () => {
    const ledger = [move(checking, cash, { vendor: "Geldautomat" })];
    expect(usual([row(2, "Geldautomat", -4000)], ledger, checking)).toEqual({
      2: { type: "transfer", counterAccountId: cash },
    });
    expect(usual([row(2, "Geldautomat", 4000)], ledger, cash)).toEqual({});
    expect(usual([row(2, "Geldautomat", -4000)], ledger, cash)).toEqual({});
  });

  test("a transfer with destinationVendor Geldautomat counts for a Cash row of money in only", () => {
    const ledger = [move(checking, cash, { destinationVendor: "Geldautomat" })];
    expect(usual([row(2, "Geldautomat", 4000)], ledger, cash)).toEqual({
      2: { type: "transfer", counterAccountId: checking },
    });
    expect(usual([row(2, "Geldautomat", -4000)], ledger, cash)).toEqual({});
    expect(usual([row(2, "Geldautomat", 4000)], ledger, checking)).toEqual({});
  });

  test("a transfer counts for the side that holds the vendor, not for the other side's vendor", () => {
    const ledger = [move(checking, cash, { vendor: "Bank", destinationVendor: "Geldautomat" })];
    expect(usual([row(2, "Bank", -4000)], ledger, checking)).toEqual({
      2: { type: "transfer", counterAccountId: cash },
    });
    expect(usual([row(2, "Geldautomat", -4000)], ledger, checking)).toEqual({});
    expect(usual([row(2, "Geldautomat", 4000)], ledger, cash)).toEqual({
      2: { type: "transfer", counterAccountId: checking },
    });
  });

  test("a category and a transfer of one vendor compete as choices, so a majority is needed", () => {
    const ledger = [
      ...times(2, () => move(checking, cash, { vendor: "Geldautomat" })),
      ...times(2, () => spend("Geldautomat", household.id)),
    ];
    expect(usual([row(2, "Geldautomat", -4000)], ledger)).toEqual({});
    const more = [...ledger, move(checking, cash, { vendor: "Geldautomat" })];
    expect(usual([row(2, "Geldautomat", -4000)], more)).toEqual({
      2: { type: "transfer", counterAccountId: cash },
    });
  });

  test("transfers of other accounts to the same vendor do not count for this batch's account", () => {
    const ledger = [
      move(cash, savings, { vendor: "Geldautomat" }),
      move(cash, savings, { vendor: "Geldautomat" }),
    ];
    expect(usual([row(2, "Geldautomat", -4000)], ledger, checking)).toEqual({});
  });
});

describe("usualChoices: which rows and vendors count", () => {
  test("' rewe ' matches 'REWE'", () => {
    const ledger = [spend("REWE", groceries.id), spend("  Rewe ", groceries.id)];
    expect(usual([row(2, " rewe ")], ledger)).toEqual({
      2: { type: "category", categoryId: groceries.id },
    });
  });

  test("a row without counterparty has none, and transactions without vendor count for nothing", () => {
    const ledger = times(5, () => spend(undefined, groceries.id));
    expect(usual([row(2, null)], ledger)).toEqual({});
    expect(usual([row(2, "REWE")], ledger)).toEqual({});
    expect(usual([row(2, null)], [spend("REWE", groceries.id)])).toEqual({});
  });

  test("a counterparty of only spaces has none", () => {
    expect(usual([row(2, "   ")], [spend("", groceries.id)])).toEqual({});
  });

  test("rows flagged as duplicates get their usual choice too", () => {
    const ledger = [spend("REWE", groceries.id)];
    expect(usual([row(2, "REWE", -1000, true)], ledger)).toEqual({
      2: { type: "category", categoryId: groceries.id },
    });
  });

  test("an unparsable row gets none", () => {
    const result = usualChoices(
      [{ status: "unparsable", rowNumber: 2 }],
      checking,
      [spend("REWE", groceries.id)],
      categories,
    );
    expect(result.size).toBe(0);
  });

  test("the result is keyed by row number and names a category or a counter-account", () => {
    const result = usualChoices(
      [row(7, "REWE")],
      checking,
      [spend("REWE", groceries.id)],
      categories,
    );
    expect(result.get(7)).toEqual({ type: "category", categoryId: groceries.id });
    expect(result.size).toBe(1);
  });

  test("the outcome does not depend on the order of the ledger", () => {
    const ledger = [
      ...times(3, () => spend("REWE", groceries.id)),
      spend("REWE", household.id),
      spend("REWE", hobbies.id),
    ];
    expect(usual([row(2, "REWE")], [...ledger].reverse())).toEqual(usual([row(2, "REWE")], ledger));
  });
});
