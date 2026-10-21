import { describe, expect, test, vi } from "vitest";
import { watchInstall } from "./install";

// contracts/app-updates.md, the page's side; FR-122. An EventTarget stands in for the window.

/** A `beforeinstallprompt` as Chrome and Edge fire it, with a stand-in `prompt()`. */
function installPrompt() {
  const prompt = vi.fn(() => Promise.resolve());
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
  });
  return { event, prompt };
}

describe("watchInstall", () => {
  test("without an event, the app is not installable", () => {
    const install = watchInstall(new EventTarget());
    expect(install.installable()).toBe(false);
  });

  test("keeps the event, preventing the browser's own offer, and the app becomes installable", () => {
    const target = new EventTarget();
    const install = watchInstall(target);
    const { event } = installPrompt();
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(install.installable()).toBe(true);
  });

  test("install() calls the event's prompt() once, and forgets it", async () => {
    const target = new EventTarget();
    const install = watchInstall(target);
    const { event, prompt } = installPrompt();
    target.dispatchEvent(event);

    await install.install();
    expect(prompt).toHaveBeenCalledOnce();
    expect(install.installable()).toBe(false);

    await install.install();
    expect(prompt).toHaveBeenCalledOnce();
  });

  test("forgets the event once appinstalled fires", () => {
    const target = new EventTarget();
    const install = watchInstall(target);
    target.dispatchEvent(installPrompt().event);
    target.dispatchEvent(new Event("appinstalled"));
    expect(install.installable()).toBe(false);
  });

  test("tells subscribers each time, until they unsubscribe", async () => {
    const target = new EventTarget();
    const install = watchInstall(target);
    const heard: boolean[] = [];
    const unsubscribe = install.subscribe(() => heard.push(install.installable()));

    target.dispatchEvent(installPrompt().event);
    await install.install();
    target.dispatchEvent(installPrompt().event);
    target.dispatchEvent(new Event("appinstalled"));
    expect(heard).toEqual([true, false, true, false]);

    unsubscribe();
    target.dispatchEvent(installPrompt().event);
    expect(heard).toHaveLength(4);
  });
});
