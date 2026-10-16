import { afterEach, describe, expect, test, vi } from "vitest";
import { servedLocally } from "./local";

// FR-106, R-24: AI features only where the local server can pass them on to OpenAI.

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("servedLocally (FR-106)", () => {
  test.each(["localhost", "127.0.0.1", "[::1]"])("counts %s as the user's own computer", (host) => {
    expect(servedLocally(host)).toBe(true);
  });

  test.each([
    "financialcopilot-three.vercel.app",
    "example.com",
    "localhost.example.com",
    "192.168.1.20",
    "",
  ])("does not count %j", (host) => {
    expect(servedLocally(host)).toBe(false);
  });

  test("reads the page's host name by default", () => {
    vi.stubGlobal("location", { hostname: "localhost" });
    expect(servedLocally()).toBe(true);

    vi.stubGlobal("location", { hostname: "financialcopilot-three.vercel.app" });
    expect(servedLocally()).toBe(false);
  });

  test("does not count a page without a location, as in Node", () => {
    vi.stubGlobal("location", undefined);
    expect(servedLocally()).toBe(false);
  });
});
