# Contract: The installable app and its updates

**Spec**: [FR-121 – FR-125](../spec.md#fr-121), [FR-075](../spec.md#fr-075),
[SC-018](../spec.md#sc-018), [SC-019](../spec.md#sc-019) · **Decisions**:
[R-30](../research.md#r-30), [R-20](../research.md#r-20), [R-07](../research.md#r-07)

This contract fixes what the build emits for installing the app, and the interface between the
page and its service worker. Every later version's worker serves the build a user still runs, and
answers that build's page. So the caches and messages below are a contract kept from version to
version, like the backup file ([backup-file.md](backup-file.md)).

## Files the build emits

| File | Content |
|---|---|
| `index.html` | Links `manifest.webmanifest`, and names its build in `<meta name="app-build" content="<id>">` |
| `manifest.webmanifest` | `name` and `short_name` "Financial Copilot", `start_url` and `scope` `./`, `display` `standalone`, `background_color` the canvas, `theme_color` the primary colour ([R-27](../research.md#r-27)), and the icons |
| `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png` | The app's icon; the last with `purpose` `maskable` |
| `assets/*` | The bundled scripts and styles, as before, each name holding its content's hash |
| `sw.js` | The service worker: a header naming the build, then the code of `worker/serviceWorker.js` |

All paths are relative to the app's address, as the rest of the build ([R-20](../research.md#r-20)).

## The build

The worker's header is one line that the plugin `worker/plugin.ts` writes before the worker's code:

```js
self.BUILD = {"id":"3f9a0c1e2b7d","version":"1.5","files":["index.html","manifest.webmanifest","icons/icon-192.png","assets/index-B1x2.js"]};
```

| Field | Value |
|---|---|
| `id` | The first 12 hexadecimal characters of a SHA-256 over the path and content of each emitted file other than `index.html` and `sw.js`, in path order |
| `version` | MAJOR.MINOR of `package.json`, as the header shows it ([FR-088](../spec.md#fr-088)) |
| `files` | Every emitted file other than `sw.js`, `index.html` included |

`index.html` is left out of the id because it holds the id, and because it also names the commit
([R-18](../research.md#r-18)): a push that changes no other file gives a byte-identical `sw.js`, so
the browser installs no new worker. Any change to code, styles, manifest or icons gives a new id.

## Caches

| Cache | Entries |
|---|---|
| `build-<id>` | Every file of build `<id>`, keyed by its path relative to the app's address |
| `app-state` | One entry, `in-use`, a JSON response `{"id": "<id>", "version": "<MAJOR.MINOR>"}` naming the build that runs |

The data stays in IndexedDB, which no step below touches ([data-model.md](../data-model.md)).

## The worker's lifecycle

1. **Install**: download every file of `files` with `cache: "reload"` into `build-<id>`. Then
   check that the downloaded `index.html` names `<id>` in `app-build`; if it does not, a newer build
   was published during the download: delete `build-<id>` and fail the install. Otherwise call
   `skipWaiting()`.
2. **Activate**: when `app-state` has no `in-use`, write this build there. Claim every open window.
   Delete every `build-` cache other than the one in use and this worker's own.
3. **Fetch**, for a GET to the app's own origin:
   - a navigation: the `index.html` of the build in use;
   - any other request: the entry of the build in use with the same path;
   - anything that cache does not hold: the network.

   The worker leaves every other request to the browser, among them those to OpenAI
   ([contracts/ai.md](ai.md)).
4. **Missing cache**: when the cache of the build in use is gone, as after the browser cleared
   storage, the worker writes its own build as in use. That is the one case where a version changes
   without Update, because the old one's files no longer exist.

## Messages

The page posts a message to the active worker, with a `MessagePort` of a `MessageChannel` as its
transfer. The worker answers on that port.

| Message | Answer |
|---|---|
| `{"type": "versions"}` | `{"inUse": {"id", "version"}, "own": {"id", "version"}}` |
| `{"type": "update"}` | `{"done": true}`, once `in-use` names the worker's own build and the old build's cache is deleted |

An unknown `type` gets no answer. The page waits 5 seconds at most and then treats the worker as
absent.

## The page's side

- `src/pwa/updates.ts` registers `./sw.js` with scope `./` in the production build only; the dev
  server and every Playwright spec but `e2e/us9-installable.spec.ts` run without a worker.
- It posts `versions` when Settings opens, and again on `controllerchange`. The notice of
  [FR-124](../spec.md#fr-124) shows while `own.version` differs from the version the page runs, as
  MAJOR.MINOR strings. `own.id` differing alone shows nothing.
- Update posts `update` and, on `done`, reloads the page.
- `src/pwa/install.ts` keeps `beforeinstallprompt`, calling `preventDefault()`, and forgets it on
  `appinstalled` and once its `prompt()` was used. Install app shows while an event is kept
  ([FR-122](../spec.md#fr-122)).

## Compatibility

- The cache names, the `in-use` entry and the messages above never change meaning. A later version
  may add fields, and a page or worker ignores fields it does not know.
- Every later worker must serve a `build-` cache written by any earlier one, so its files keep the
  layout above.
- A change that cannot keep this, for example a different layout of the caches, needs its worker to
  migrate the older caches at activation, or a MAJOR version (constitution IX).
- v1.4 and earlier have no worker. The first opening after v1.5 is published loads it from the
  network, and its worker makes v1.5 the build in use.
