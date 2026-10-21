import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";

// Names each build and writes its service worker (contracts/app-updates.md, the build; R-30).

/** A build as the header of its sw.js names it. */
export interface Build {
  id: string;
  /** MAJOR.MINOR, as the header shows it (FR-088). */
  version: string;
  /** Every emitted file but sw.js, in path order. */
  files: string[];
}

/**
 * The version of package.json, or TEST_APP_VERSION, with which e2e/support/versions.ts builds the
 * newer versions its tests publish. Vercel refuses it, so every published build names the version
 * its commit holds (constitution IX).
 */
export function appVersion(): string {
  const testVersion = process.env.TEST_APP_VERSION;
  if (testVersion) {
    if (process.env.VERCEL) throw new Error("TEST_APP_VERSION is for local test builds only");
    return testVersion;
  }
  // Read when asked, so a test that changes nothing but the environment sees package.json.
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  };
  return pkg.version;
}

/** MAJOR.MINOR of a version, as the app shows it. */
export function majorMinor(version: string): string {
  return version.split(".").slice(0, 2).join(".");
}

/** The paths of every file under `dir`, relative to it with "/" between folders, in path order. */
async function filesIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .sort();
}

const appBuildMeta = /\s*<meta name="app-build" content="[^"]*"\s*\/?>/g;

/**
 * Names the build in `outDir` and writes its sw.js: the header line, then the worker's code. The
 * id leaves out index.html, which holds it and the commit (R-18), so a push that changes no other
 * file gives a byte-identical sw.js. index.html then names the id in `app-build`.
 */
export async function writeBuild(outDir: string, version: string): Promise<Build> {
  const files = (await filesIn(outDir)).filter((path) => path !== "sw.js");
  const hash = createHash("sha256");
  for (const path of files) {
    if (path === "index.html") continue;
    const content = await readFile(join(outDir, ...path.split("/")));
    // Lengths first, so no path and content can run into the next file's.
    hash.update(`${path.length}:${path}${content.length}:`).update(content);
  }
  const build: Build = { id: hash.digest("hex").slice(0, 12), version, files };

  const workerCode = await readFile(new URL("./serviceWorker.js", import.meta.url), "utf8");
  await writeFile(
    join(outDir, "sw.js"),
    `self.BUILD = ${JSON.stringify({ id: build.id, version: build.version, files: build.files })};\n${workerCode}`,
  );

  const indexPath = join(outDir, "index.html");
  const index = (await readFile(indexPath, "utf8")).replace(appBuildMeta, "");
  await writeFile(
    indexPath,
    index.replace("</head>", `  <meta name="app-build" content="${build.id}">\n  </head>`),
  );
  return build;
}

/** Writes sw.js and the build's id once Vite has written every other file. */
export function serviceWorkerBuild(): Plugin {
  let outDir = "";
  return {
    name: "service-worker-build",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      await writeBuild(outDir, majorMinor(appVersion()));
    },
  };
}
