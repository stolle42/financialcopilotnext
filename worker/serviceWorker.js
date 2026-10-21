// The service worker (contracts/app-updates.md, the worker's lifecycle). worker/plugin.ts writes it
// into sw.js after the line that names the build, `self.BUILD`. The caches and messages below are a
// contract kept from version to version: a later worker serves the build a user still runs.

const own = { id: self.BUILD.id, version: self.BUILD.version };
const ownCache = `build-${own.id}`;
const STATE = "app-state";

/** The address of `path`, relative to the app's address. */
const at = (path) => new URL(path, self.registration.scope).href;

async function readInUse() {
  const entry = await (await caches.open(STATE)).match(at("in-use"));
  return entry ? entry.json() : undefined;
}

async function writeInUse(build) {
  await (await caches.open(STATE)).put(at("in-use"), Response.json(build));
}

/**
 * The build in use. When its cache is gone, as after the browser cleared storage, this worker's
 * own build is in use from now on, since the old one's files no longer exist.
 */
async function buildInUse() {
  const inUse = await readInUse();
  if (inUse && (await caches.has(`build-${inUse.id}`))) return inUse;
  await writeInUse(own);
  return own;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(ownCache);
      try {
        await Promise.all(
          self.BUILD.files.map(async (path) => {
            const response = await fetch(at(path), { cache: "reload" });
            if (!response.ok) throw new Error(`${path}: ${response.status}`);
            await cache.put(at(path), response);
          }),
        );
        // A newer build published during the download leaves files of two builds.
        const index = await (await cache.match(at("index.html"))).text();
        if (!index.includes(`<meta name="app-build" content="${own.id}"`)) {
          throw new Error("index.html names another build");
        }
      } catch (error) {
        await caches.delete(ownCache);
        throw error;
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const inUse = await buildInUse();
      await self.clients.claim();
      const keep = [ownCache, `build-${inUse.id}`];
      for (const name of await caches.keys()) {
        if (name.startsWith("build-") && !keep.includes(name)) await caches.delete(name);
      }
    })(),
  );
});

async function respond(request) {
  const inUse = await buildInUse();
  const cache = await caches.open(`build-${inUse.id}`);
  const key = request.mode === "navigate" ? at("index.html") : request.url;
  return (await cache.match(key, { ignoreSearch: true })) ?? fetch(request);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Every other request, among them those to OpenAI, stays the browser's.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(respond(request));
});

self.addEventListener("message", (event) => {
  const [port] = event.ports;
  if (!port) return;
  switch (event.data?.type) {
    case "versions":
      event.waitUntil(buildInUse().then((inUse) => port.postMessage({ inUse, own })));
      break;
    case "update":
      event.waitUntil(
        (async () => {
          const old = await buildInUse();
          await writeInUse(own);
          if (old.id !== own.id) await caches.delete(`build-${old.id}`);
          port.postMessage({ done: true });
        })(),
      );
      break;
    // An unknown type gets no answer.
  }
});
