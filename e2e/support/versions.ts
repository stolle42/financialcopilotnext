import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// A static server of the build, standing in for the app's address while a test publishes newer
// versions to it (R-30, quickstart.md, US9). It serves `dist/` as Vercel would, and the next
// versions, built once with TEST_APP_VERSION into tmp/, when a test switches to them.

const root = fileURLToPath(new URL("../../", import.meta.url));

/** The first port of the server; each Playwright worker adds its parallel index, so two browsers' tests never share one. */
export const VERSIONS_PORT = 4174;

/** A build as the header of its sw.js names it (contracts/app-updates.md, the build). */
export interface Build {
  id: string;
  /** MAJOR.MINOR, as the header shows it. */
  version: string;
  files: string[];
}

/**
 * The builds a test can publish: `current` is `dist/`, the build every other spec tests; `next`
 * and `newest` are the next two MINOR versions; `sameVersion` has the MAJOR.MINOR of `current`
 * and other files, as a change published without a new number.
 */
export type VersionName = "current" | "sameVersion" | "next" | "newest";

export interface Version {
  dir: string;
  build: Build;
}

/** The build that sw.js in `dir` names in its first line. */
export function buildIn(dir: string): Build {
  const sw = join(dir, "sw.js");
  if (!existsSync(sw)) throw new Error(`${sw} is missing: build the app first`);
  const [header = ""] = readFileSync(sw, "utf8").split("\n");
  const match = /^self\.BUILD = (\{.*\});$/.exec(header);
  if (!match) throw new Error(`${sw} does not start with the build's header`);
  return JSON.parse(match[1]!) as Build;
}

/** The full versions of the test's builds, from the `version` of package.json. */
function testVersions(): Record<Exclude<VersionName, "current">, string> {
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    version: string;
  };
  const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
  return {
    sameVersion: `${major}.${minor}.${patch + 1}`,
    next: `${major}.${minor + 1}.0`,
    newest: `${major}.${minor + 2}.0`,
  };
}

/**
 * Builds the test's versions from the current code, once for each build of `dist/`, and returns
 * every version. Both browsers' workers may call it at once, so each builds into a folder of its
 * own and moves it into place; the second to arrive keeps the first one's.
 */
export function prepareVersions(): Record<VersionName, Version> {
  const dist = join(root, "dist");
  const current = buildIn(dist);
  const base = join(root, "tmp", "versions", current.id);
  const versions: Record<VersionName, Version> = {
    current: { dir: dist, build: current },
  } as Record<VersionName, Version>;
  for (const [name, version] of Object.entries(testVersions()) as [VersionName, string][]) {
    const dir = join(base, name);
    if (!existsSync(join(dir, "sw.js"))) {
      const own = `${dir}-${process.pid}`;
      mkdirSync(base, { recursive: true });
      execFileSync(
        process.execPath,
        [
          join(root, "node_modules", "vite", "bin", "vite.js"),
          "build",
          "--outDir",
          own,
          "--emptyOutDir",
        ],
        {
          cwd: root,
          env: { ...process.env, TEST_APP_VERSION: version, VERCEL: "" },
          stdio: "pipe",
        },
      );
      try {
        renameSync(own, dir);
      } catch {
        rmSync(own, { recursive: true, force: true });
      }
    }
    versions[name] = { dir, build: buildIn(dir) };
  }
  return versions;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

export interface VersionsServer {
  /** The app's address, ending in "/". */
  url: string;
  /**
   * Publishes `name` at the address. With `indexOf`, index.html comes from that other version, as
   * when a newer build is published while a worker downloads the files.
   */
  publish(name: VersionName, options?: { indexOf?: VersionName }): void;
  close(): Promise<void>;
}

/** Serves `versions` on `port`, publishing `current` first. */
export async function startVersionsServer(
  versions: Record<VersionName, Version>,
  port: number,
): Promise<VersionsServer> {
  let published: { dir: string; indexDir: string } = {
    dir: versions.current.dir,
    indexDir: versions.current.dir,
  };

  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const relative = path === "/" ? "index.html" : path.slice(1);
    const dir = relative === "index.html" ? published.indexDir : published.dir;
    const file = resolve(dir, relative);
    if (!file.startsWith(resolve(dir) + sep) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
      // As Vercel serves the app: the browser asks again every time.
      "Cache-Control": "public, max-age=0, must-revalidate",
    });
    response.end(readFileSync(file));
  });
  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(port, "localhost", done);
  });

  return {
    url: `http://localhost:${port}/`,
    publish(name, { indexOf = name } = {}) {
      published = { dir: versions[name].dir, indexDir: versions[indexOf].dir };
    },
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}
