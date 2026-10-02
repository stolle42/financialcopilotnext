import { describe, expect, test } from "vitest";
import { isNameTaken, nameKey } from "./names";

describe("nameKey", () => {
  test("trims surrounding spaces and ignores case (R-08)", () => {
    expect(nameKey("  Groceries ")).toBe("groceries");
    expect(nameKey("EATING out")).toBe("eating out");
  });

  test("keeps inner spaces", () => {
    expect(nameKey("Eating  out")).toBe("eating  out");
  });
});

describe("isNameTaken", () => {
  const items = [
    { id: "a", name: "Checking" },
    { id: "b", name: "Cash" },
  ];

  test("finds a name that differs only in case and surrounding spaces", () => {
    expect(isNameTaken(items, " checking ")).toBe(true);
  });

  test("allows a new name", () => {
    expect(isNameTaken(items, "Savings")).toBe(false);
  });

  test("ignores the item being renamed", () => {
    expect(isNameTaken(items, "CHECKING", "a")).toBe(false);
    expect(isNameTaken(items, "cash", "a")).toBe(true);
  });
});
