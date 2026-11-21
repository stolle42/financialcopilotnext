import { describe, expect, test } from "vitest";
import type { PendingBatch, ParsedRow, PendingRow, Transaction, UnparsableRow } from "../types";
import { reviewView, sharedAssignment } from "./groups";

// FR-025, FR-026, FR-028; contracts/csv-import.md, vendor groups; contracts/ui.md, review.

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

function unparsable(): UnparsableRow {
  return {
    rowNumber: nextRowNumber++,
    status: "unparsable",
    cells: ["31.02.2026", "Shop", "Broken", "-1,00"],
    failure: { code: "date-unreadable" },
  };
}

function batchOf(rows: PendingRow[]): PendingBatch {
  return { id: "batch", accountId: "checking", fileName: "bank.csv", createdAt: "", rows };
}

const shop = (amountCents: number, date = "2026-08-01") =>
  parsed({ amountCents, date, counterparty: "Shop" });

describe("reviewView", () => {
  test("counts rows to review, duplicates and unparsable rows (FR-025, FR-028)", () => {
    const rows = [
      shop(-100),
      shop(-200),
      parsed({ amountCents: -300, duplicate: true, included: false }),
      parsed({ amountCents: -400, duplicate: true, included: true }),
      unparsable(),
    ];
    const view = reviewView(batchOf(rows));
    expect(view.counts).toMatchObject({
      review: 3,
      suggestedTransfers: 0,
      duplicates: 2,
      unparsable: 1,
    });
    expect(view.duplicates).toEqual([rows[2], rows[3]]);
    expect(view.unparsable).toEqual([rows[4]]);
  });

  test("groups three purchases from Shop and shows its refund and rows without a counterparty as plain rows (scenario 16)", () => {
    const purchases = [
      shop(-4520, "2026-08-01"),
      shop(-1299, "2026-08-03"),
      shop(-3000, "2026-08-08"),
    ];
    const refund = shop(1299, "2026-08-05");
    const cash = parsed({ amountCents: -10000, date: "2026-08-20" });
    const fee = parsed({ amountCents: -350, date: "2026-08-02", counterparty: null });
    const view = reviewView(batchOf([...purchases, refund, cash, fee]));

    expect(view.groups).toEqual([
      {
        key: "shop",
        side: "expense",
        counterparty: "Shop",
        count: 3,
        totalCents: -8819,
        rows: purchases,
      },
    ]);
    expect(view.plainRows).toEqual([fee, refund, cash]);
  });

  test("shows every row as a plain row, by date, when no counterparty is mapped (scenario 6)", () => {
    const rows = [
      parsed({ amountCents: -100, date: "2026-08-03" }),
      parsed({ amountCents: 200, date: "2026-08-01" }),
      parsed({ amountCents: -300, date: "2026-08-03" }),
    ];
    const view = reviewView(batchOf(rows));
    expect(view.groups).toEqual([]);
    expect(view.plainRows).toEqual([rows[1], rows[0], rows[2]]);
  });

  test("groups each vendor's rows by side, largest group first, and shows a group of one as a plain row (scenario 4)", () => {
    const rows = [
      parsed({ amountCents: -100, counterparty: "Bakery" }),
      parsed({ amountCents: -100, counterparty: "Bakery" }),
      parsed({ amountCents: 500, counterparty: "Bakery" }),
      parsed({ amountCents: 500, counterparty: "Bakery" }),
      parsed({ amountCents: -100, counterparty: "Market" }),
      parsed({ amountCents: -100, counterparty: "Market" }),
      parsed({ amountCents: -100, counterparty: "Market" }),
      parsed({ amountCents: -100, counterparty: "Kiosk" }),
    ];
    const view = reviewView(batchOf(rows));
    expect(view.groups.map((g) => [g.counterparty, g.side, g.count])).toEqual([
      ["Market", "expense", 3],
      ["Bakery", "income", 2],
      ["Bakery", "expense", 2],
    ]);
    expect(view.plainRows).toEqual([rows[7]]);
  });

  test("puts a zero amount on the expense side", () => {
    const rows = [shop(0), shop(-100)];
    expect(reviewView(batchOf(rows)).groups[0]).toMatchObject({ side: "expense", count: 2 });
  });

  test("treats counterparties that differ only in case and surrounding spaces as one vendor", () => {
    const rows = [
      parsed({ amountCents: -100, counterparty: "Shop" }),
      parsed({ amountCents: -200, counterparty: " SHOP " }),
      parsed({ amountCents: -300, counterparty: "S hop" }),
    ];
    const view = reviewView(batchOf(rows));
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]).toMatchObject({ key: "shop", counterparty: "Shop", count: 2 });
    expect(view.plainRows).toEqual([rows[2]]);
  });

  test("leaves excluded duplicates and unparsable rows out of groups and plain rows", () => {
    const rows = [
      shop(-100),
      { ...shop(-100), duplicate: true, included: false },
      unparsable(),
      parsed({ amountCents: -500, duplicate: true, included: false }),
    ];
    const view = reviewView(batchOf(rows));
    expect(view.groups).toEqual([]);
    expect(view.plainRows).toEqual([rows[0]]);
  });

  test("lets an included duplicate join its group with its own assignment (R-12)", () => {
    const transfer = { type: "transfer" as const, counterAccountId: "card" };
    const rows = [shop(-100), { ...shop(-100), duplicate: true, assignment: transfer }];
    const view = reviewView(batchOf(rows));
    expect(view.groups[0]?.rows).toEqual(rows);
    expect(view.groups[0]?.rows[1]?.assignment).toEqual(transfer);
  });
});

// FR-143, contracts/csv-import.md, vendor groups: `reviewView` takes the ledger, leaves the rows
// that hold a suggested transfer out of every vendor group, and lists them by date with whether
// their pair still fits and the paired transaction. The fields of the suggestion are not typed
// yet, so those rows are written through a cast.
describe("reviewView: suggested transfers (FR-143)", () => {
  /** A row of money in or out of `checking` that holds its suggested transfer to `card`. */
  function suggested(
    fields: Partial<ParsedRow> & Pick<ParsedRow, "amountCents">,
    pairedTransactionId: string,
  ): ParsedRow {
    return parsed({
      ...fields,
      assignment: {
        type: "transfer",
        counterAccountId: "card",
        pairedTransactionId,
      } as unknown as ParsedRow["assignment"],
    });
  }

  const pair = (id: string, amountCents: number, accountId = "card"): Transaction => ({
    id,
    seq: 1,
    date: "2026-08-01",
    amountCents,
    accountId,
    description: "Payment received",
    kind: "expense",
    categoryId: "groceries",
  });

  test("leaves the rows that hold a suggested transfer out of every vendor group", () => {
    const first = suggested({ amountCents: -5000, counterparty: "Shop" }, "p1");
    const rows = [shop(-100), shop(-200), first];
    const view = reviewView(batchOf(rows), [pair("p1", 5000)]);

    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]).toMatchObject({ key: "shop", count: 2, totalCents: -300 });
    expect(view.groups[0]!.rows).toEqual([rows[0], rows[1]]);
    expect(view.plainRows).not.toContain(first);
  });

  test("a group of three whose one row is paired becomes a group of two", () => {
    const rows = [
      shop(-100),
      suggested({ amountCents: -4000, counterparty: "Shop" }, "p1"),
      shop(-300),
    ];
    const view = reviewView(batchOf(rows), [pair("p1", 4000)]);
    expect(view.groups[0]).toMatchObject({ count: 2, totalCents: -400 });
  });

  test("a group left with one row shows it as a plain row (FR-026)", () => {
    const rows = [shop(-100), suggested({ amountCents: -4000, counterparty: "Shop" }, "p1")];
    const view = reviewView(batchOf(rows), [pair("p1", 4000)]);
    expect(view.groups).toEqual([]);
    expect(view.plainRows).toEqual([rows[0]]);
  });

  test("lists the suggested transfers by date, then row number, each with its pair", () => {
    const later = suggested({ amountCents: -4000, date: "2026-08-09", counterparty: "A" }, "p1");
    const earlier = suggested({ amountCents: 7000, date: "2026-08-02", counterparty: null }, "p2");
    const sameDay = suggested({ amountCents: -100, date: "2026-08-02" }, "p3");
    const p1 = pair("p1", 4000);
    const p2 = { ...pair("p2", 7000), kind: "income" as const, categoryId: "salary" };
    const p3 = pair("p3", 100);

    const view = reviewView(batchOf([later, earlier, sameDay]), [p1, p2, p3]);

    expect(view.suggestedTransfers).toEqual([
      { row: earlier, fits: true, paired: p2 },
      { row: sameDay, fits: true, paired: p3 },
      { row: later, fits: true, paired: p1 },
    ]);
  });

  test("counts the suggested transfers, which are still rows under review", () => {
    const rows = [
      shop(-100),
      suggested({ amountCents: -4000 }, "p1"),
      suggested({ amountCents: -5000 }, "p2"),
    ];
    const view = reviewView(batchOf(rows), [pair("p1", 4000), pair("p2", 5000)]);
    expect(view.counts).toMatchObject({ review: 3, suggestedTransfers: 2 });
  });

  test("says a pair no longer fits when the transaction is gone, changed in amount or moved", () => {
    const rows = [
      suggested({ amountCents: -4000, date: "2026-08-01" }, "gone"),
      suggested({ amountCents: -5000, date: "2026-08-02" }, "changed"),
      suggested({ amountCents: -6000, date: "2026-08-03" }, "moved"),
    ];
    const changed = pair("changed", 5001);
    const moved = pair("moved", 6000, "savings");

    const view = reviewView(batchOf(rows), [changed, moved]);

    expect(view.suggestedTransfers.map(({ fits, paired }) => [fits, paired])).toEqual([
      [false, null],
      [false, changed],
      [false, moved],
    ]);
  });

  test("a batch without suggested transfers has none, whatever the ledger", () => {
    const view = reviewView(batchOf([shop(-100), shop(-200)]), [pair("p1", 100)]);
    expect(view.suggestedTransfers).toEqual([]);
    expect(view.counts.suggestedTransfers).toBe(0);
  });
});

// FR-147, FR-148; contracts/ui.md, review: a group header shows a mark only when all its rows hold
// the same assignment with the same mark. The marks of v1.8 are fields the types do not carry yet,
// so the assignments are written through casts.
describe("sharedAssignment: the assignment and mark a group shows (FR-147)", () => {
  const category = (categoryId: string, marks: object = {}) =>
    ({ type: "category", categoryId, ...marks }) as unknown as ParsedRow["assignment"];
  const transfer = (counterAccountId: string, marks: object = {}) =>
    ({ type: "transfer", counterAccountId, ...marks }) as unknown as ParsedRow["assignment"];
  const rowsOf = (...assignments: ParsedRow["assignment"][]): ParsedRow[] =>
    assignments.map((assignment) => ({ ...shop(-100), assignment }));

  test("the shared assignment with its mark, when every row holds both", () => {
    const usual = category("groceries", { usual: true });
    expect(sharedAssignment(rowsOf(usual, usual, usual))).toStrictEqual(usual);

    const suggested = category("groceries", { suggested: true });
    expect(sharedAssignment(rowsOf(suggested, suggested))).toStrictEqual(suggested);

    const toCard = transfer("card", { usual: true });
    expect(sharedAssignment(rowsOf(toCard, toCard))).toStrictEqual(toCard);
  });

  test("the shared assignment without a mark, when only some rows hold the mark", () => {
    const usual = category("groceries", { usual: true });
    const plain = category("groceries");
    expect(sharedAssignment(rowsOf(usual, plain))).toStrictEqual(plain);
    expect(sharedAssignment(rowsOf(plain, usual, usual))).toStrictEqual(plain);
  });

  test("the shared assignment without a mark, when the rows hold different marks", () => {
    const usual = category("groceries", { usual: true });
    const suggested = category("groceries", { suggested: true });
    expect(sharedAssignment(rowsOf(usual, suggested))).toStrictEqual(category("groceries"));
  });

  test("the same counter-account is shared, whatever the marks", () => {
    const usual = transfer("card", { usual: true });
    const plain = transfer("card");
    expect(sharedAssignment(rowsOf(usual, plain))).toStrictEqual(plain);
  });

  test("nothing is shared when the rows hold different categories or kinds of assignment", () => {
    const groceries = category("groceries", { usual: true });
    expect(sharedAssignment(rowsOf(groceries, category("travel", { usual: true })))).toBeNull();
    expect(sharedAssignment(rowsOf(groceries, transfer("card", { usual: true })))).toBeNull();
    expect(sharedAssignment(rowsOf(transfer("card"), transfer("savings")))).toBeNull();
  });

  test("nothing is shared by a group without rows", () => {
    expect(sharedAssignment([])).toBeNull();
  });
});

describe("reviewView: rows set aside (FR-152, FR-153)", () => {
  // `setAsideUnderCents` and `keptInReview` are v1.8 fields the types do not carry yet.
  const kept = (row: ParsedRow): ParsedRow => ({ ...row, keptInReview: true }) as ParsedRow;
  const transfer = (amountCents: number, marks: Record<string, unknown>): ParsedRow =>
    parsed({
      amountCents,
      assignment: {
        type: "transfer",
        counterAccountId: "card",
        ...marks,
      } as unknown as ParsedRow["assignment"],
    });
  const rowNumbers = (rows: readonly ParsedRow[]) => rows.map((row) => row.rowNumber);

  test("sets aside expenses and income of an amount under the one set, and keeps the others under review", () => {
    const small = parsed({ amountCents: -50, date: "2026-08-03" });
    const smaller = parsed({ amountCents: -99, date: "2026-08-02" });
    const income = parsed({ amountCents: 12, date: "2026-08-01" });
    const exactly = parsed({ amountCents: -100 });
    const large = parsed({ amountCents: -2500 });
    const view = reviewView(batchOf([small, smaller, income, exactly, large]), [], 100);

    expect(view.setAside).toEqual([income, smaller, small]);
    expect(view.plainRows).toEqual([exactly, large]);
    expect(view.counts).toMatchObject({ review: 2, setAside: 3 });
  });

  test("adds up the amounts of the skipped rows without their sign, for the live line (FR-161)", () => {
    const rows = [
      parsed({ amountCents: -50 }),
      parsed({ amountCents: -99 }),
      parsed({ amountCents: 12 }),
      parsed({ amountCents: -100 }),
    ];
    expect(reviewView(batchOf(rows), [], 100).setAsideTotalCents).toBe(161);
    expect(reviewView(batchOf(rows), []).setAsideTotalCents).toBe(0);
    expect(reviewView(batchOf(rows), [], 50).setAsideTotalCents).toBe(12);
  });

  test("sets aside nothing while no amount is set", () => {
    const rows = [parsed({ amountCents: -1 }), parsed({ amountCents: 1 })];
    const view = reviewView(batchOf(rows), []);
    expect(view.setAside).toEqual([]);
    expect(view.counts).toMatchObject({ review: 2, setAside: 0 });
    expect(view.plainRows).toHaveLength(2);
  });

  test("lists the rows set aside by date, then row number", () => {
    const later = parsed({ amountCents: -10, date: "2026-08-09" });
    const sameDayFirst = parsed({ amountCents: -20, date: "2026-08-04" });
    const sameDayLast = parsed({ amountCents: -30, date: "2026-08-04" });
    const earlier = parsed({ amountCents: -40, date: "2026-08-01" });
    const view = reviewView(batchOf([later, sameDayLast, earlier, sameDayFirst]), [], 100);
    expect(rowNumbers(view.setAside)).toEqual(
      rowNumbers([earlier, sameDayFirst, sameDayLast, later].sort(byDateThenRow)),
    );
    expect(view.setAside[0]).toBe(earlier);
    expect(view.setAside.at(-1)).toBe(later);
  });

  test("keeps a row set aside out of every group and plain row", () => {
    const rows = [shop(-100), shop(-200), shop(-50), shop(-300), parsed({ amountCents: -40 })];
    const view = reviewView(batchOf(rows), [], 100);
    // Shop's 0.50 and the unnamed 0.40 are set aside; 1.00, 2.00 and 3.00 are a group of three.
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]).toMatchObject({ key: "shop", count: 3, totalCents: -600 });
    expect(view.groups[0]!.rows).not.toContain(rows[2]);
    expect(view.plainRows).toEqual([]);
    expect(view.setAside).toHaveLength(2);
  });

  test("a group left with one row becomes a plain row", () => {
    const rows = [shop(-100), shop(-50), shop(-20)];
    const view = reviewView(batchOf(rows), [], 100);
    expect(view.groups).toEqual([]);
    expect(view.plainRows).toEqual([rows[0]]);
    expect(view.setAside).toHaveLength(2);
  });

  test("a transfer stays under review, suggested, usual or marked", () => {
    const suggestedTransfer = transfer(-50, { pairedTransactionId: "p1" });
    const usualTransfer = transfer(-50, { usual: true });
    const marked = transfer(-50, {});
    const pairedWith: Transaction = {
      id: "p1",
      seq: 1,
      date: "2026-08-01",
      amountCents: 50,
      accountId: "card",
      description: "Payment received",
      kind: "income",
      categoryId: "salary",
    };
    const view = reviewView(batchOf([suggestedTransfer, usualTransfer, marked]), [pairedWith], 100);

    expect(view.setAside).toEqual([]);
    expect(view.suggestedTransfers.map((s) => s.row)).toEqual([suggestedTransfer]);
    expect(view.plainRows).toEqual([usualTransfer, marked]);
    expect(view.counts).toMatchObject({ setAside: 0, suggestedTransfers: 1, review: 3 });
  });

  test("a row with keptInReview stays under review, with whatever it holds", () => {
    const gave = kept(parsed({ amountCents: -50 }));
    const view = reviewView(batchOf([gave]), [], 100);
    expect(view.setAside).toEqual([]);
    expect(view.plainRows).toEqual([gave]);
  });

  test("an excluded duplicate is not set aside, and stays among the duplicates", () => {
    const excluded = parsed({ amountCents: -50, duplicate: true, included: false });
    const view = reviewView(batchOf([excluded]), [], 100);
    expect(view.setAside).toEqual([]);
    expect(view.duplicates).toEqual([excluded]);
    expect(view.counts).toMatchObject({ setAside: 0, duplicates: 1 });
  });

  test("a row holding a category of its own is set aside while it is not kept in review", () => {
    // A category from usual choices or the AI; the row was not given it by the user.
    const usualCategory = parsed({
      amountCents: -50,
      assignment: {
        type: "category",
        categoryId: "groceries",
        usual: true,
      } as unknown as ParsedRow["assignment"],
    });
    const view = reviewView(batchOf([usualCategory]), [], 100);
    expect(view.setAside).toEqual([usualCategory]);
    expect(view.plainRows).toEqual([]);
  });

  test("lowering or clearing the amount brings rows back holding what they held, their usual category included", () => {
    const usualCategory = parsed({
      amountCents: -50,
      assignment: {
        type: "category",
        categoryId: "groceries",
        usual: true,
      } as unknown as ParsedRow["assignment"],
    });
    const plain = parsed({ amountCents: -99 });
    const batch = batchOf([usualCategory, plain]);
    expect(reviewView(batch, [], 100).setAside).toHaveLength(2);

    const lowered = reviewView(batch, [], 60);
    expect(lowered.setAside).toEqual([usualCategory]);
    expect(lowered.plainRows).toEqual([plain]);

    const cleared = reviewView(batch, []);
    expect(cleared.setAside).toEqual([]);
    expect(cleared.plainRows).toEqual([usualCategory, plain].sort(byDateThenRow));
    // The very row object comes back, with its usual category and mark.
    expect(cleared.plainRows).toContain(usualCategory);
    expect(usualCategory.assignment).toMatchObject({ categoryId: "groceries", usual: true });
  });

  test("an unparsable row is not set aside", () => {
    const broken = unparsable();
    const view = reviewView(batchOf([broken]), [], 100);
    expect(view.setAside).toEqual([]);
    expect(view.unparsable).toEqual([broken]);
  });
});

function byDateThenRow(a: ParsedRow, b: ParsedRow): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : a.rowNumber - b.rowNumber;
}
