import { describe, expect, test } from "vitest";
import { parseRoute } from "./router";

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
