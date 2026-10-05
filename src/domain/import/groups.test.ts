import { describe, expect, test } from "vitest";
import type { PendingBatch, ParsedRow, PendingRow, UnparsableRow } from "../types";
import { reviewView } from "./groups";

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
    expect(view.counts).toEqual({ review: 3, duplicates: 2, unparsable: 1 });
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
