import { describe, expect, test } from "vitest";
import type { ParsedRow, PendingBatch, Transaction } from "../types";
import { reviewView } from "./groups";
import { firstNotSeen, groupItemId, itemSeen, notSeenCount, reviewItems } from "./items";

// FR-150, FR-151; data-model.md, derived values; R-44; contracts/ui.md, review: the items of review
// in the order Tab goes through them, and which of them the user has seen. The marks `seen` and
// `groupSeen` and the suggested transfers are v1.8 fields the types do not carry yet, so they are
// written through casts.

let nextRowNumber = 2;

function parsed(fields: Partial<ParsedRow> & Pick<ParsedRow, "amountCents">): ParsedRow {
  return {
    rowNumber: nextRowNumber++,
    status: "parsed",
    date: "2026-08-01",
    description: "",
    counterparty: null,
    duplicate: false,
    included: true,
    assignment: { type: "category", categoryId: fields.amountCents > 0 ? "inc-unc" : "exp-unc" },
    ...fields,
  };
}

const withMarks = (row: ParsedRow, marks: { seen?: boolean; groupSeen?: boolean }): ParsedRow =>
  ({ ...row, ...marks }) as ParsedRow;

const vendor = (name: string, amountCents: number, date = "2026-08-01") =>
  parsed({ amountCents, date, counterparty: name });

/** A row holding a suggested transfer paired with the transaction `pairedId`. */
function transferRow(amountCents: number, date: string, pairedId: string): ParsedRow {
  return parsed({
    amountCents,
    date,
    assignment: {
      type: "transfer",
      counterAccountId: "card",
      pairedTransactionId: pairedId,
    } as unknown as ParsedRow["assignment"],
  });
}

const pair = (id: string, amountCents: number): Transaction => ({
  id,
  seq: 1,
  date: "2026-08-01",
  amountCents,
  accountId: "card",
  description: "Payment received",
  kind: "income",
  categoryId: "salary",
});

function viewOf(rows: ParsedRow[], transactions: Transaction[] = []) {
  const batch: PendingBatch = {
    id: "batch",
    accountId: "checking",
    fileName: "bank.csv",
    createdAt: "",
    rows,
  };
  return reviewView(batch, transactions);
}

/** The ids of the items, in order. */
const idsOf = (items: ReturnType<typeof reviewItems>) => items.map((item) => item.id);

describe("reviewItems: the order of Tab (FR-150)", () => {
  // Two groups of different size, two plain rows and one suggested transfer.
  const coffee = [vendor("Coffee", -300), vendor("Coffee", -350)];
  const shop = [vendor("Shop", -100), vendor("Shop", -200), vendor("Shop", -400)];
  const lateRow = parsed({ amountCents: -500, date: "2026-08-09" });
  const earlyRow = parsed({ amountCents: -700, date: "2026-08-03" });
  const transfer = transferRow(-4000, "2026-08-05", "p1");
  const view = viewOf([...coffee, lateRow, ...shop, earlyRow, transfer], [pair("p1", 4000)]);

  test("lists the suggested transfers, then the groups largest first, then the plain rows by date", () => {
    const items = reviewItems(view, new Set());
    expect(items.map((item) => item.kind)).toEqual(["transfer", "group", "group", "row", "row"]);
    expect(idsOf(items)).toEqual([
      `row ${transfer.rowNumber}`,
      groupItemId(view.groups[0]!),
      groupItemId(view.groups[1]!),
      `row ${earlyRow.rowNumber}`,
      `row ${lateRow.rowNumber}`,
    ]);
    expect(view.groups.map((group) => group.counterparty)).toEqual(["Shop", "Coffee"]);
  });

  test("an item id says what the item is, so the screen can keep refs and unfolded groups by it", () => {
    expect(groupItemId(view.groups[0]!)).toBe("group expense shop");
  });

  test("an unfolded group is followed by its rows, in file order, and no other group is", () => {
    const items = reviewItems(view, new Set([groupItemId(view.groups[0]!)]));
    expect(idsOf(items)).toEqual([
      `row ${transfer.rowNumber}`,
      "group expense shop",
      ...shop.map((row) => `row ${row.rowNumber}`),
      "group expense coffee",
      `row ${earlyRow.rowNumber}`,
      `row ${lateRow.rowNumber}`,
    ]);
    // The rows of a group are items of the group, which a plain row is not.
    const inGroup = items.flatMap((item) => (item.kind === "row" ? [item.inGroup] : []));
    expect(inGroup).toEqual([true, true, true, false, false]);
  });

  test("a group that is not in the batch any more, and so cannot be unfolded, is ignored", () => {
    const items = reviewItems(view, new Set(["group expense gone"]));
    expect(items).toHaveLength(5);
  });

  test("lists nothing for a batch with nothing under review", () => {
    expect(reviewItems(viewOf([]), new Set())).toEqual([]);
  });

  test("the suggested transfers are listed by date, then row number", () => {
    const later = transferRow(-100, "2026-08-09", "p2");
    const earlier = transferRow(-200, "2026-08-02", "p3");
    const items = reviewItems(
      viewOf([later, earlier], [pair("p2", 100), pair("p3", 200)]),
      new Set(),
    );
    expect(idsOf(items)).toEqual([`row ${earlier.rowNumber}`, `row ${later.rowNumber}`]);
  });
});

describe("itemSeen: when an item counts as seen (FR-151)", () => {
  test("a plain row and a suggested transfer are seen when they hold seen", () => {
    const seenRow = withMarks(parsed({ amountCents: -500 }), { seen: true });
    const newRow = parsed({ amountCents: -600 });
    const seenTransfer = withMarks(transferRow(-4000, "2026-08-05", "p1"), { seen: true });
    const items = reviewItems(
      viewOf([seenRow, newRow, seenTransfer], [pair("p1", 4000)]),
      new Set(),
    );
    expect(items.map(itemSeen)).toEqual([true, true, false]);
    expect(idsOf(items)).toEqual([
      `row ${seenTransfer.rowNumber}`,
      `row ${seenRow.rowNumber}`,
      `row ${newRow.rowNumber}`,
    ]);
  });

  test("a group is seen when all its rows hold groupSeen", () => {
    const view = viewOf([
      withMarks(vendor("Shop", -100), { groupSeen: true }),
      withMarks(vendor("Shop", -200), { groupSeen: true }),
    ]);
    expect(reviewItems(view, new Set()).map(itemSeen)).toEqual([true]);
  });

  test("a group is not seen when one of its rows lacks groupSeen", () => {
    const view = viewOf([
      withMarks(vendor("Shop", -100), { groupSeen: true }),
      vendor("Shop", -200),
    ]);
    expect(reviewItems(view, new Set()).map(itemSeen)).toEqual([false]);
  });

  test("a group whose rows were all seen one by one is not seen as a group", () => {
    const view = viewOf([
      withMarks(vendor("Shop", -100), { seen: true }),
      withMarks(vendor("Shop", -200), { seen: true }),
    ]);
    expect(reviewItems(view, new Set()).map(itemSeen)).toEqual([false]);
  });

  test("the rows of an unfolded group are seen by their own seen, not by groupSeen", () => {
    const view = viewOf([
      withMarks(vendor("Shop", -100), { groupSeen: true }),
      withMarks(vendor("Shop", -200), { groupSeen: true, seen: true }),
      withMarks(vendor("Shop", -300), { groupSeen: true }),
    ]);
    const items = reviewItems(view, new Set([groupItemId(view.groups[0]!)]));
    expect(items.map(itemSeen)).toEqual([true, false, true, false]);
  });
});

describe("notSeenCount and firstNotSeen (FR-151)", () => {
  const seenShop = [
    withMarks(vendor("Shop", -100), { groupSeen: true }),
    withMarks(vendor("Shop", -200), { groupSeen: true }),
  ];
  const seenRow = withMarks(parsed({ amountCents: -500, date: "2026-08-03" }), { seen: true });
  const newRow = parsed({ amountCents: -600, date: "2026-08-04" });
  const newCoffee = [vendor("Coffee", -300), vendor("Coffee", -350), vendor("Coffee", -360)];
  const view = viewOf([...seenShop, seenRow, newRow, ...newCoffee]);

  test("counts the groups and plain rows not seen", () => {
    expect(notSeenCount(reviewItems(view, new Set()))).toBe(2);
  });

  test("counts the suggested transfers not seen as well", () => {
    const transfer = transferRow(-4000, "2026-08-05", "p1");
    const withTransfer = viewOf([...seenShop, seenRow, transfer], [pair("p1", 4000)]);
    expect(notSeenCount(reviewItems(withTransfer, new Set()))).toBe(1);
  });

  test("never counts the rows inside an unfolded group", () => {
    const unfolded = new Set([groupItemId(view.groups[0]!), groupItemId(view.groups[1]!)]);
    const items = reviewItems(view, unfolded);
    expect(items).toHaveLength(2 + 3 + 2 + 2);
    expect(notSeenCount(items)).toBe(2);
  });

  test("the group seen while folded counts as seen, but its rows are not seen once unfolded", () => {
    const shop = view.groups.find((group) => group.key === "shop")!;
    const folded = reviewItems(view, new Set());
    expect(itemSeen(folded.find((item) => item.id === groupItemId(shop))!)).toBe(true);
    const unfolded = reviewItems(view, new Set([groupItemId(shop)]));
    const rowsSeen = unfolded.flatMap((item) =>
      item.kind === "row" && item.inGroup ? [itemSeen(item)] : [],
    );
    expect(rowsSeen).toEqual([false, false]);
  });

  test("the first item not seen is the one Tab starts at", () => {
    const items = reviewItems(view, new Set());
    // The groups come first, largest first: Coffee has three rows and is not seen.
    expect(firstNotSeen(items)).toBe(items[0]);
    expect(firstNotSeen(items)!.id).toBe("group expense coffee");
  });

  test("skips the items seen before it", () => {
    const allButOne = viewOf([...seenShop, seenRow, newRow]);
    const items = reviewItems(allButOne, new Set());
    expect(firstNotSeen(items)!.id).toBe(`row ${newRow.rowNumber}`);
  });

  test("the first item when all are seen, and nothing when there are none", () => {
    const allSeen = viewOf([...seenShop, seenRow]);
    const items = reviewItems(allSeen, new Set());
    expect(notSeenCount(items)).toBe(0);
    expect(firstNotSeen(items)).toBe(items[0]);
    expect(firstNotSeen([])).toBeUndefined();
  });
});

describe("rows set aside are no item (FR-152, FR-151)", () => {
  const setAsideView = (rows: ParsedRow[], under = 100) => {
    const batch: PendingBatch = {
      id: "batch",
      accountId: "checking",
      fileName: "bank.csv",
      createdAt: "",
      rows,
    };
    return reviewView(batch, [], under);
  };

  test("are listed by no item, whether groups, plain rows or suggested transfers are", () => {
    const small = parsed({ amountCents: -50 });
    const large = parsed({ amountCents: -2500 });
    const items = reviewItems(setAsideView([small, large]), new Set());
    expect(idsOf(items)).toEqual([`row ${large.rowNumber}`]);
  });

  test("count as neither seen nor not seen, even when they carry seen", () => {
    const seenSmall = withMarks(parsed({ amountCents: -50 }), { seen: true });
    const newSmall = parsed({ amountCents: -60 });
    const newLarge = parsed({ amountCents: -2500 });
    const items = reviewItems(setAsideView([seenSmall, newSmall, newLarge]), new Set());
    expect(items).toHaveLength(1);
    expect(notSeenCount(items)).toBe(1);
    expect(items.map(itemSeen)).toEqual([false]);
  });

  test("a batch of rows set aside only has nothing to review: no item, nothing first, none not seen", () => {
    const items = reviewItems(
      setAsideView([parsed({ amountCents: -50 }), parsed({ amountCents: 20 })]),
      new Set(),
    );
    expect(items).toEqual([]);
    expect(notSeenCount(items)).toBe(0);
    expect(firstNotSeen(items)).toBeUndefined();
  });

  test("a group's rows set aside are not among its rows once unfolded", () => {
    const rows = [
      vendor("Shop", -100),
      vendor("Shop", -200),
      vendor("Shop", -300),
      vendor("Shop", -50),
    ];
    const view = setAsideView(rows);
    const items = reviewItems(view, new Set([groupItemId(view.groups[0]!)]));
    expect(idsOf(items)).toEqual([
      "group expense shop",
      ...rows.slice(0, 3).map((row) => `row ${row.rowNumber}`),
    ]);
  });
});
