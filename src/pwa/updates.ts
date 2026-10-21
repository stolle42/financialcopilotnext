import { useEffect, useState } from "react";
import type { Refusal } from "@/domain/types";
import type { UpdateFailureCode } from "@/ui/messages";

// The page's side of the service worker (contracts/app-updates.md, the page's side; R-30).

/** A build as the worker names it. */
export interface BuildName {
  id: string;
  /** MAJOR.MINOR. */
  version: string;
}

/** The worker's answer to `versions`: the build that runs, and the worker's own. */
export interface WorkerVersions {
  inUse: BuildName;
  own: BuildName;
}

/** What the page needs of the worker: something to post a message to, with a port. */
interface Worker {
  postMessage(message: unknown, transfer: Transferable[]): void;
}

/** The longest the page waits for an answer before it treats the worker as absent. */
const ANSWER_WAIT_MS = 5000;

/**
 * Registers sw.js in the production build only, so the dev server runs without a worker. A browser
 * that refuses a worker still runs the app, only not offline.
 */
export function registerWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
}

/** Posts `message` to `worker` with a port, and gives its answer, or nothing after 5 seconds. */
function ask(worker: Worker | null | undefined, message: unknown): Promise<unknown> {
  if (!worker) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (answer: unknown) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(answer);
    };
    const timer = setTimeout(() => finish(undefined), ANSWER_WAIT_MS);
    channel.port1.onmessage = (event) => finish(event.data);
    worker.postMessage(message, [channel.port2]);
  });
}

/** The worker's versions, or nothing when no worker answers. */
export async function workerVersions(
  worker: Worker | null | undefined,
): Promise<WorkerVersions | undefined> {
  return (await ask(worker, { type: "versions" })) as WorkerVersions | undefined;
}

/** Whether MAJOR.MINOR `own` is newer than `running`, so 1.10 is newer than 1.9. */
export function isNewer(own: string, running: string): boolean {
  const [ownMajor = 0, ownMinor = 0] = own.split(".").map(Number);
  const [major = 0, minor = 0] = running.split(".").map(Number);
  return ownMajor !== major ? ownMajor > major : ownMinor > minor;
}

/**
 * Asks the worker to make its own build the one in use, and reloads the page onto it once the
 * worker is done. Without an answer the page runs on as it was.
 */
export async function applyUpdate(
  worker: Worker | null | undefined,
  reload: () => void,
): Promise<Refusal<UpdateFailureCode> | undefined> {
  const answer = (await ask(worker, { type: "update" })) as { done?: boolean } | undefined;
  if (!answer?.done) return { code: "update-failed" };
  reload();
  return undefined;
}

/**
 * The version this page runs, as the header shows it: package.json writes MAJOR.MINOR.0, as npm
 * needs three parts, and the app shows MAJOR.MINOR (constitution IX, FR-088).
 */
export const runningVersion = __APP_VERSION__.split(".").slice(0, 2).join(".");

/**
 * The newer version the worker has downloaded, or nothing: asked when the caller mounts, after
 * looking for a newer sw.js, and again whenever another worker takes control (FR-124).
 */
export function useNewerVersion(): string | undefined {
  const [newer, setNewer] = useState<string>();
  useEffect(() => {
    const workers = navigator.serviceWorker;
    if (!workers) return;
    let current = true;
    const check = async () => {
      const versions = await workerVersions(workers.controller);
      if (!current) return;
      const own = versions?.own.version;
      setNewer(own && isNewer(own, runningVersion) ? own : undefined);
    };
    void check();
    workers.addEventListener("controllerchange", check);
    // The browser looks for a new sw.js only on some openings; Settings looks every time, and the
    // worker it finds takes control, which asks again. Offline the look fails, and nothing changes.
    void workers
      .getRegistration()
      .then((registration) => registration?.update())
      .catch(() => {});
    return () => {
      current = false;
      workers.removeEventListener("controllerchange", check);
    };
  }, []);
  return newer;
}
