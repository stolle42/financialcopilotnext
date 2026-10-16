import { describe, expect, test } from "vitest";
import { parseRoute, transactionsPath, type ListFilters } from "./router";

describe("parseRoute", () => {
  // Every route of contracts/ui.md, shell and navigation.
  test.each([
    ["#/", { name: "transactions" }],
    ["#/insights", { name: "insights" }],
    ["#/import", { name: "import" }],
    ["#/import/review", { name: "review" }],
    ["#/import/profiles/new", { name: "profile-new" }],
    ["#/budgets", { name: "budgets" }],
    ["#/categories", { name: "categories" }],
    ["#/accounts", { name: "accounts" }],
    ["#/backup", { name: "backup" }],
  ])("reads %s", (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });

  test("carries the profile id", () => {
    expect(parseRoute("#/import/profiles/3f2a-91")).toEqual({ name: "profile", id: "3f2a-91" });
  });

  test("decodes an encoded profile id", () => {
    expect(parseRoute("#/import/profiles/a%20b")).toEqual({ name: "profile", id: "a b" });
  });

  test.each<[string, ListFilters]>([
    ["#/?category=c-1", { category: "c-1" }],
    ["#/?account=a-1", { account: "a-1" }],
    ["#/?from=2026-09-01", { from: "2026-09-01" }],
    ["#/?to=2026-09-30", { to: "2026-09-30" }],
    [
      "#/?category=c-1&account=a-1&from=2026-09-01&to=2026-09-30",
      { category: "c-1", account: "a-1", from: "2026-09-01", to: "2026-09-30" },
    ],
    ["#/?to=2026-09-30&category=c-1", { category: "c-1", to: "2026-09-30" }],
    ["#/?category=a%20b", { category: "a b" }],
  ])(
    "reads the transaction list's filters from the query of %s (FR-110, R-26)",
    (hash, filters) => {
      expect(parseRoute(hash)).toEqual({ name: "transactions", filters });
    },
  );

  test.each(["#/?", "#/?category=", "#/?unknown=1", "#/?category=&from="])(
    "opens Transactions without filters for the query %j, with no part that holds a value",
    (hash) => {
      expect(parseRoute(hash)).toEqual({ name: "transactions" });
    },
  );

  test("keeps the parts that hold a value, and drops the empty ones", () => {
    expect(parseRoute("#/?category=&from=2026-09-01&nope=x")).toEqual({
      name: "transactions",
      filters: { from: "2026-09-01" },
    });
  });

  test.each([
    ["#/insights?category=c-1", { name: "insights" }],
    ["#/import/profiles/p-1?from=2026-09-01", { name: "profile", id: "p-1" }],
  ])("leaves the route of another path as it is when it has a query: %s", (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });

  test.each<ListFilters>([
    { category: "c-1" },
    { account: "a b" },
    { category: "c-1", account: "a-1", from: "2026-09-01", to: "2026-09-30" },
    { from: "2026-09-01", to: "2026-09-01" },
  ])("transactionsPath gives the path whose route holds the filters %j", (filters) => {
    const path = transactionsPath(filters);
    expect(path.startsWith("/?")).toBe(true);
    expect(parseRoute(`#${path}`)).toEqual({ name: "transactions", filters });
  });

  test("transactionsPath without filters is the home path", () => {
    expect(transactionsPath({})).toBe("/");
  });

  test.each([
    "",
    "#",
    "#/nowhere",
    "#/import/profiles",
    "#/import/profiles/a/b",
    "#/import/profiles/%E0%A4%A",
  ])("opens Transactions for the empty or unknown hash %j (FR-063)", (hash) => {
    expect(parseRoute(hash)).toEqual({ name: "transactions" });
  });
});
