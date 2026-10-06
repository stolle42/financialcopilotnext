import { messages } from "../../src/ui/messages";
import { expect, test } from "../support/test";

// R-07, R-15: start-up holds a lock so only one copy runs, and says so when storage is blocked.

test("a second tab shows that the app is already open, and no data", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();

  const second = await context.newPage();
  await second.goto("/");

  await expect(second.getByRole("alert")).toHaveText(messages["open-in-another-tab"]);
  await expect(second.getByRole("heading", { name: "Transactions" })).toHaveCount(0);
});

test("blocked storage shows storage-unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException("Storage is blocked", "SecurityError");
    };
  });

  await page.goto("/");

  await expect(page.getByRole("alert")).toHaveText(messages["storage-unavailable"]);
});

test.describe("an unexpected error", () => {
  async function expectUnexpectedErrorScreen(page: import("@playwright/test").Page) {
    await expect(page.getByRole("alert")).toHaveText(messages["unexpected-error"]);
    await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
  }

  test("an unhandled rejection after load shows the message and a Reload button", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.addEventListener("load", () =>
        setTimeout(() => void Promise.reject(new Error("Simulated failure")), 0),
      );
    });
    await page.goto("/");
    await expectUnexpectedErrorScreen(page);
  });

  test("an uncaught exception shows the message and a Reload button", async ({ page }) => {
    await page.addInitScript(() => {
      window.addEventListener("load", () =>
        setTimeout(() => {
          throw new Error("Simulated failure");
        }, 0),
      );
    });
    await page.goto("/");
    await expectUnexpectedErrorScreen(page);
  });

  test("an error while rendering the shell shows the message and a Reload button", async ({
    page,
  }) => {
    // The shell's router subscribes to hash changes as it mounts; make exactly that call fail.
    await page.addInitScript(() => {
      const addEventListener = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (
        this: EventTarget,
        ...args: Parameters<EventTarget["addEventListener"]>
      ) {
        if (args[0] === "hashchange") throw new Error("Simulated failure");
        addEventListener.apply(this, args);
      };
    });
    await page.goto("/");
    await expectUnexpectedErrorScreen(page);
  });
});
