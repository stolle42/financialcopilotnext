import { describe, expect, test } from "vitest";
import { pickerCategories, protectedCategory, sortCategories } from "./categories";
import { seedState } from "./seed";
import { idCounter } from "./testing";
import type { Category } from "./types";

const categories = seedState(idCounter()).categories;
const names = (list: readonly Category[]) => list.map((c) => c.name);

describe("protectedCategory", () => {
  test("finds a protected category by role, even after it is renamed", () => {
    const renamed = categories.map((c) =>
      c.side === "expense" && c.role === "uncategorised" ? { ...c, name: "To sort" } : c,
    );
    const found = protectedCategory(renamed, "expense", "uncategorised");
    expect(found).toMatchObject({ name: "To sort", side: "expense", role: "uncategorised" });
  });

  test("keeps the sides apart", () => {
    expect(protectedCategory(categories, "income", "unaccounted")).toMatchObject({
      side: "income",
      role: "unaccounted",
    });
  });
});

describe("sortCategories (list order)", () => {
  test("lists one side by name, ignoring case, with Uncategorised and Unaccounted last", () => {
    const withLowerCase = [...categories, { ...categories[0]!, id: "x", name: "atm fees" }];
    expect(names(sortCategories(withLowerCase, "expense"))).toEqual([
      "atm fees",
      "Eating out",
      "Groceries",
      "Health",
      "Housing",
      "Leisure",
      "Shopping",
      "Transport",
      "Travel",
      "Utilities",
      "Uncategorised",
      "Unaccounted",
    ]);
  });

  test("never mixes in the other side (FR-030)", () => {
    expect(names(sortCategories(categories, "income"))).toEqual([
      "Gifts",
      "Interest",
      "Salary",
      "Uncategorised",
      "Unaccounted",
    ]);
  });
});

describe("pickerCategories (FR-030)", () => {
  test("offers the side's categories without Unaccounted", () => {
    expect(names(pickerCategories(categories, "income"))).toEqual([
      "Gifts",
      "Interest",
      "Salary",
      "Uncategorised",
    ]);
  });
});
