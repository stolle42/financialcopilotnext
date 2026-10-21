import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { applyUpdate, isNewer, workerVersions } from "./updates";

// contracts/app-updates.md, messages and the page's side; FR-124.

const OLD = { id: "aaaaaaaaaaaa", version: "1.5" };
const NEW = { id: "bbbbbbbbbbbb", version: "1.6" };

/**
 * A stand-in for the active worker: it records each message posted to it, and `answer` replies on
 * the port the page transferred, or stays silent.
 */
function standIn(answer: (message: unknown, port: MessagePort) => void) {
  const posted: unknown[] = [];
  const worker = {
    postMessage(message: unknown, transfer: Transferable[]) {
      posted.push(message);
      answer(message, transfer[0] as MessagePort);
    },
  };
  return { worker, posted };
}

const silent = () => standIn(() => {});

/** Whether `promise` has settled, without waiting for it. */
function settled(promise: Promise<unknown>): () => boolean {
  let done = false;
  void promise.then(() => (done = true));
  return () => done;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isNewer", () => {
  test("compares MAJOR.MINOR strings: 1.6 is newer than 1.5, and 1.10 than 1.9", () => {
    expect(isNewer("1.6", "1.5")).toBe(true);
    expect(isNewer("1.10", "1.9")).toBe(true);
  });

  test("a build of the same version with another id is not newer", () => {
    const sameVersion = { id: "cccccccccccc", version: OLD.version };
    expect(sameVersion.id).not.toBe(OLD.id);
    expect(isNewer(sameVersion.version, OLD.version)).toBe(false);
  });
});

describe("workerVersions", () => {
  test("posts versions and gives the worker's answer", async () => {
    const { worker, posted } = standIn((_message, port) =>
      port.postMessage({ inUse: OLD, own: NEW }),
    );
    await expect(workerVersions(worker)).resolves.toEqual({ inUse: OLD, own: NEW });
    expect(posted).toEqual([{ type: "versions" }]);
  });

  test("gives nothing after 5 seconds without an answer", async () => {
    const answer = workerVersions(silent().worker);
    const isSettled = settled(answer);
    await vi.advanceTimersByTimeAsync(4999);
    expect(isSettled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(answer).resolves.toBeUndefined();
  });

  test("gives nothing without a worker", async () => {
    await expect(workerVersions(null)).resolves.toBeUndefined();
  });
});

describe("applyUpdate", () => {
  test("posts update and reloads the page once the worker answers done", async () => {
    const reload = vi.fn();
    const { worker, posted } = standIn((_message, port) => port.postMessage({ done: true }));
    await expect(applyUpdate(worker, reload)).resolves.toBeUndefined();
    expect(posted).toEqual([{ type: "update" }]);
    expect(reload).toHaveBeenCalledOnce();
  });

  test("gives update-failed, and keeps the page, without an answer within 5 seconds", async () => {
    const reload = vi.fn();
    const result = applyUpdate(silent().worker, reload);
    const isSettled = settled(result);
    await vi.advanceTimersByTimeAsync(4999);
    expect(isSettled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ code: "update-failed" });
    expect(reload).not.toHaveBeenCalled();
  });
});
