import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { appVersion, writeBuild } from "./plugin";

// contracts/app-updates.md, the build; R-30, FR-088.

const INDEX = `<!doctype html><html><head><title>Financial Copilot</title></head><body></body></html>`;

/** A small build as Vite leaves it in `outDir`, with the copied public/ files. */
const FILES: Record<string, string> = {
  "index.html": INDEX,
  "manifest.webmanifest": `{"name":"Financial Copilot"}`,
  "icons/icon-192.png": "png 192",
  "icons/icon-512.png": "png 512",
  "assets/index-B1x2.js": "console.log(1);",
  "assets/index-C3y4.css": "body{}",
};

let outDir: string;

async function writeFiles(files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(outDir, ...path.split("/").slice(0, -1)), { recursive: true });
    await writeFile(join(outDir, ...path.split("/")), content);
  }
}

const read = (path: string) => readFile(join(outDir, ...path.split("/")), "utf8");

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), "financial-copilot-build-"));
  await writeFiles(FILES);
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("writeBuild", () => {
  test("writes sw.js as the header line naming the build, then the worker's code", async () => {
    const build = await writeBuild(outDir, "1.5");

    const workerCode = await readFile(new URL("./serviceWorker.js", import.meta.url), "utf8");
    const sw = await read("sw.js");
    const newline = sw.indexOf("\n");
    const header = sw.slice(0, newline);
    expect(header).toMatch(/^self\.BUILD = \{.*\};$/);
    const named = JSON.parse(header.slice("self.BUILD = ".length, -1)) as Record<string, unknown>;
    expect(Object.keys(named)).toEqual(["id", "version", "files"]);
    expect(named).toEqual(build);
    expect(sw.slice(newline + 1)).toBe(workerCode);
    expect(build.version).toBe("1.5");
  });

  test("lists every emitted file but sw.js, in path order, index.html and nested paths included", async () => {
    const build = await writeBuild(outDir, "1.5");
    expect(build.files).toEqual(Object.keys(FILES).sort());
    expect(build.files).toContain("index.html");
    expect(build.files).toContain("icons/icon-192.png");
    expect(build.files).not.toContain("sw.js");
  });

  test("names the build by 12 hexadecimal characters", async () => {
    const { id } = await writeBuild(outDir, "1.5");
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });

  test("keeps the id and a byte-identical sw.js when only index.html changes, as with a new commit", async () => {
    const first = await writeBuild(outDir, "1.5");
    const sw = await read("sw.js");

    await writeFiles({
      "index.html": INDEX.replace("<title>", '<meta name="app-commit" content="abc"><title>'),
    });
    const second = await writeBuild(outDir, "1.5");

    expect(second.id).toBe(first.id);
    expect(await read("sw.js")).toBe(sw);
  });

  test.each(Object.keys(FILES).filter((path) => path !== "index.html"))(
    "gives a new id when the content of %s changes",
    async (path) => {
      const first = await writeBuild(outDir, "1.5");
      await writeFiles({ [path]: `${FILES[path]} changed` });
      const second = await writeBuild(outDir, "1.5");
      expect(second.id).not.toBe(first.id);
    },
  );

  test("gives a new id when a file is renamed", async () => {
    const first = await writeBuild(outDir, "1.5");
    await rename(join(outDir, "assets", "index-B1x2.js"), join(outDir, "assets", "index-B1x3.js"));
    const second = await writeBuild(outDir, "1.5");
    expect(second.id).not.toBe(first.id);
    expect(second.files).toContain("assets/index-B1x3.js");
  });

  test("writes exactly one app-build meta naming the id into index.html", async () => {
    const { id } = await writeBuild(outDir, "1.5");
    const metas = [
      ...(await read("index.html")).matchAll(/<meta name="app-build" content="([^"]*)"\s*\/?>/g),
    ];
    expect(metas).toHaveLength(1);
    expect(metas[0]![1]).toBe(id);
  });
});

describe("appVersion", () => {
  test("is the version of package.json", async () => {
    vi.stubEnv("TEST_APP_VERSION", undefined);
    vi.stubEnv("VERCEL", undefined);
    const { version } = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(appVersion()).toBe(version);
  });

  test("is TEST_APP_VERSION when set, for the tests' second build", () => {
    vi.stubEnv("TEST_APP_VERSION", "9.8.0");
    vi.stubEnv("VERCEL", undefined);
    expect(appVersion()).toBe("9.8.0");
  });

  test("refuses TEST_APP_VERSION on Vercel, so every published build reads package.json (constitution IX)", () => {
    vi.stubEnv("TEST_APP_VERSION", "9.8.0");
    vi.stubEnv("VERCEL", "1");
    expect(() => appVersion()).toThrow();
  });
});
