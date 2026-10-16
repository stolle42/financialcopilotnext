# Research: Financial Copilot v1

**Plan**: [plan.md](plan.md) · **Spec**: [spec.md](spec.md) · **Date**: 2026-10-01

This file records the technical decisions behind the plan. The spec fixes what the app must do but
names no technology, so every technical choice is made here, each with its rationale and the
alternatives rejected. Package versions were verified on the date above and are listed once, in
[plan.md](plan.md#technical-context).

Some entries are marked **Interpretation**. The spec does not decide that point, and the entry
fills the gap the way the plan will build it. These entries should be confirmed and then recorded
in the spec, so that the spec stays the single source of behaviour (constitution I).

## Platform and architecture

<a id="r-01"></a>
### R-01 · A client-only web app that keeps its data in the browser

- **Decision**: v1 is a single-page application that runs entirely in the browser and is served
  locally as static files. All data lives in IndexedDB in the user's browser profile. There is no
  backend and no network traffic, except the requests of the AI features the user starts with AI
  features on. Their one piece of server-side code is a route that the local server adds, which
  passes them on to OpenAI ([R-24](#r-24)).
- **Rationale**:
  - The spec describes this shape. v1 is "a local web app". Losing "the browser data" loses
    everything ([User Story 7](spec.md#user-story-7)). No capability may need a network
    ([FR-061](spec.md#fr-061)). The target is a desktop browser ([Out of Scope](spec.md#out-of-scope)).
  - A static client app meets all of this with the fewest moving parts: no API layer, no HTTP
    error paths, and no server process to start or secure.
  - A static bundle also leaves both later delivery options open. Any static server can run it in a
    Docker image, and a desktop shell can wrap it ([R-20](#r-20)).
- **Supported browsers**: current desktop Chrome, Edge and Firefox. Safari is not a v1 target.
  - Safari's tracking prevention deletes a site's script-written storage, IndexedDB included, after
    7 days of Safari use without any interaction with that site.
  - WebKit's source applies this to `localhost` as well. A finance ledger cannot accept that.
  - Only apps added to the Home Screen or Dock are exempt.
- **Alternatives considered**:
  - **A local server with SQLite** keeps the data in a file, but adds an API contract, a second
    process and HTTP error handling, with no v1 requirement that needs them.
  - **Next.js or another server-rendering framework** brings server rendering and hosting
    conventions, which serve hosted multi-user sites. Nothing here runs on a server.
    - Next.js is Vercel's own framework, and its static export would deploy there too. But its server
      features would go unused, and its export mode restricts routing and images.
    - A static Vite build deploys to Vercel just as well ([R-20](#r-20)).
  - **SQLite compiled to WebAssembly in the browser** offers SQL, which one person's ledger of a few
    thousand rows does not need. Durable storage would also need a worker and a large dependency.
  - **localStorage** holds about 5 MB and writes synchronously. A few years of transactions can
    outgrow it.

<a id="r-02"></a>
### R-02 · TypeScript, Vite and npm on Node.js LTS

- **Decision**:
  - TypeScript 6.0 in strict mode, with `noUncheckedIndexedAccess`.
    - Pinned as `~6.0.3`, as Vite's own template does.
    - `types` is listed explicitly and `baseUrl` is not used, so the config is ready for TypeScript 7.
  - Vite 8 for the dev server and the production build.
  - npm with a committed `package-lock.json`.
  - Node.js 24 LTS. `.nvmrc` holds `24`, and `package.json` declares `engines.node` as `24.x`, the
    form Vercel reads to choose its build image ([R-20](#r-20)). Locally, 24.13.1 or later is
    needed. Earlier Node 24 releases decode Windows-1252 wrongly, and the CSV tests would catch it
    ([R-09](#r-09)).
- **Rationale**:
  - The CI workflow stub already in the repo names a TypeScript linter.
  - **Why TypeScript 6, not 7**: TypeScript 7, the native Go compiler, has been npm's `latest` since
    July 2026, but the linting stack cannot use it yet.
    - typescript-eslint supports TypeScript below 6.1 only.
    - dependency-cruiser needs the TypeScript 6 API to resolve imports. Without it, it falls back to a
      looser parser and reports false positives, which would undermine the architecture gate
      ([R-16](#r-16)).
    - Moving to 7 is a separate change, to make once both tools support it.
  - Vite is the standard build tool for client-only apps: a fast dev loop and plain static output.
  - npm ships with Node, so a fresh machine needs no extra tool, which keeps the checkout portable.
  - **Node**: Node 24 is the Active LTS today. It moves to maintenance on 2026-10-20, and Node 26
    becomes LTS on 2026-10-28. Every tool here supports both. Starting on 24 matches the Node already
    installed on this machine; moving to 26 is a one-line change in `.nvmrc`.
  - `noUncheckedIndexedAccess` makes the compiler flag every CSV cell read that could be missing.
- **Alternatives considered**:
  - **TypeScript 7 with TypeScript 6 installed alongside for the linters** is a split setup that
    Microsoft documents. It means two compilers for one project.
  - **pnpm** is faster and stricter, but is one more tool to install. The pnpm already on this
    machine is a major version behind Node 24.
  - **Plain `tsc` without a bundler** gives no dev server, no hot reload and no asset pipeline.

<a id="r-03"></a>
### R-03 · React with shadcn/ui components, styled by Tailwind CSS

- **Decision** (the user chose shadcn/ui over Mantine on 2026-10-01):
  - React, with shadcn/ui components styled by Tailwind CSS v4.
    - shadcn/ui is not installed as a library. Its CLI copies each component's source into
      `src/ui/components/ui/`, where it becomes our own code.
    - Components are added one at a time, when a task first needs them (constitution II).
  - The components sit on **Base UI**, a library of unstyled, accessible components. Base UI has
    been shadcn's default since July 2026.
  - Icons come from `lucide-react`, shadcn's default.
  - Parts shadcn does not cover:
    - **Amount fields**: shadcn has no number input. An amount field of our own parses its text with
      the domain's amount parser, using the browser locale's decimal separator. That parser already
      serves CSV import ([contracts/csv-import.md](contracts/csv-import.md#amount-grammar)), so this
      is its second real use and sharing it is justified (constitution III). The field selects its
      content on focus ([SC-002](spec.md#sc-002)).
    - **Dates**: the browser's native date input, which already yields `YYYY-MM-DD`
      ([R-08](#r-08)). The period picker of [FR-050](spec.md#fr-050) is a row of preset buttons
      and two such inputs.
    - **Forms**: values live in React state, errors come from the domain's validation, and shadcn's
      `Field` component lays them out. No form library repeats the rules ([R-15](#r-15)).
    - **Notifications**: Base UI's toast, through shadcn's toast component.
- **Rationale**:
  - One component system gives every screen the same patterns ([FR-065](spec.md#fr-065)).
  - The components are our own code, so their markup can follow the spec exactly. Examples are the
    swatch in each category option and the hatched legend entry.
  - Tailwind compiles to one static stylesheet. With Base UI, that lets the production CSP forbid
    inline styles entirely ([R-19](#r-19)).
  - **Why Base UI rather than Radix**: Radix's dialogs and selects inject `<style>` elements, which a
    strict CSP blocks. Base UI injects them in only two places, and its `CSPProvider` turns both off.
  - **Framework count** (constitution II): React and Tailwind CSS. Base UI is a component library,
    and the shadcn components are our own source.
- **Findings that shape the build** (shadcn, Base UI and Recharts docs, verified 2026-10-01):
  - **Setup**: shadcn's Vite template matches this plan, with Vite 8 and TypeScript 6.
    - It declares the `@/*` import alias with `paths` alone, because TypeScript 6 deprecates
      `baseUrl`.
    - `components.json` points the aliases into `src/ui/`.
  - **Select values**: select items can hold a colour swatch next to the name. Base UI's select
    value takes a render function. When the form edits a reconciliation entry, the field can
    therefore show "Unaccounted" while the options leave it out ([FR-030](spec.md#fr-030),
    [contracts/ui.md](contracts/ui.md#transaction-form)).
  - **Charts**: shadcn's chart component wraps Recharts 3 and pins its version ([R-14](#r-14)).
  - **Injected styles**: three parts would inject `<style>` elements at run time. They are Base UI's
    select and scroll area, shadcn's chart component, and Sonner, the toast shadcn offers for Radix.
    [R-19](#r-19) handles each one.
- **Alternatives considered**:
  - **Mantine** was the previous choice. It ships ready-made number inputs, charts and
    notifications, which means less code of our own, and the user's decision for shadcn/ui replaced
    it. Its run-time styles also needed a looser CSP.
  - **Radix under shadcn** injects `<style>` elements that the strict CSP would block.
  - **React Aria under shadcn** would also work. Base UI is the default, so the copied components
    match shadcn's documentation.
  - **Sonner for notifications** always injects a style tag, with no way to turn it off.
  - **MUI** is heavier and brings the Material look.
  - **Svelte or Vue** would work, but offer this app no advantage.
  - **No component library**: building accessible selects, dialogs, toasts and charts ourselves
    would cost far more code, against the first sentence of constitution II.

<a id="r-04"></a>
### R-04 · Hash-based routing with a small router of our own

- **Decision**: a hash router of about 30 lines in `src/ui/app/`, with URLs in the hash, as in
  `#/insights` ([contracts/ui.md](contracts/ui.md#shell-and-navigation)).
  - A route table maps each route to its screen.
  - React's `useSyncExternalStore` reads the current route from the `hashchange` event.
  - Navigating means setting `location.hash`.
- **Rationale**:
  - Each screen has a URL, so the back button and reloads work.
  - Hash URLs need no server rewrite rules. The same build therefore works from `vite preview`,
    Vercel, any static server, or a desktop shell that loads local files ([R-20](#r-20)).
  - Opening the app's address still lands on the transaction list ([FR-063](spec.md#fr-063)).
  - The app has ten routes, only one of which takes a parameter (a profile id). A routing
    framework would be a large dependency for a small job, and constitution II asks for as few
    frameworks as possible.
- **Alternatives considered**:
  - **React Router 8's `HashRouter`** does the same job, but it is a framework, and its data
    loading, nested layouts and framework mode would go unused.
  - **History-API routing** needs fallback rules on every host.
  - **No router** loses the back button and links to individual screens.

## State and storage

<a id="r-05"></a>
### R-05 · The whole state in memory; write first, then apply

- **Decision**:
  - At start, every store is loaded into one in-memory state object, held by a store module of our
    own. The module exposes the state, a `subscribe` function and the actions. Screens read it
    through React's `useSyncExternalStore` with a selector.
  - Each action runs in three steps:
    1. It calls a pure domain function with the current state and the injected values the function
       needs: today's date and new ids. The result is either a refusal code or a set of changes.
    2. It writes the changes to IndexedDB in one transaction ([R-06](#r-06)).
    3. Only after the write succeeds does it apply the changes to the in-memory state.
  - Screens read the state through selectors and derive balances, lists and charts with pure
    domain functions.
  - Review edits on a pending batch are written at once, like every other change.
- **Rationale**:
  - A personal ledger is small. The design point is 10,000 transactions, a few megabytes. Deriving
    everything in memory is therefore fast, and every business rule can be a pure function over
    plain data, which is what constitution V and VII ask for.
  - Writing first means the screen never shows a change that is not stored.
  - Injecting the date and the ids keeps domain functions deterministic.
  - Writing review edits at once means review progress survives closing the app
    ([FR-022](spec.md#fr-022)) and appears in backups ([SC-014](spec.md#sc-014)).
  - Only the module's single hook touches React, so the store's tests run in Node
    ([R-17](#r-17)).
- **Alternatives considered**:
  - **Querying IndexedDB per screen** means more asynchronous code and loading states, which
    nothing at this size needs.
  - **Dexie live queries** provide reactive queries, which an in-memory state does not use.
  - **Zustand** would supply the subscribe-and-select part, about 30 lines, as one more
    framework-like dependency (constitution II).
  - **Redux Toolkit** needs more ceremony for the same store.
  - **React context with `useReducer`** re-renders the whole tree on every change and handles
    asynchronous actions awkwardly.

<a id="r-06"></a>
### R-06 · IndexedDB through `idb`, with atomic multi-store writes

- **Decision**:
  - IndexedDB through the `idb` promise wrapper, with schema version 1 holding the stores in
    [data-model.md](data-model.md#storage-layout).
  - The upgrade transaction that creates the database also writes the first-launch seed, so a first
    start is all-or-nothing.
  - Each action writes in a single read-write transaction across every store it touches. This is
    what makes these operations atomic: batch confirmation ([FR-027](spec.md#fr-027)), category
    deletion ([FR-034](spec.md#fr-034)) and restore ([FR-072](spec.md#fr-072)).
  - Storing a new pending batch re-checks, inside the same transaction, that none exists
    ([FR-022](spec.md#fr-022)).
  - Integration tests run the same code against `fake-indexeddb` in Node.
- **Rationale**:
  - IndexedDB is the only browser storage that holds structured data at this size with atomic
    transactions spanning several stores, which those three requirements depend on.
  - A transaction that fails, including on a quota error, leaves the stored data unchanged.
  - `idb` adds promises and types without hiding the model.
  - The tests run the production storage code against `fake-indexeddb`, so no repository interface
    is needed (constitution IV).
- **Alternatives considered**:
  - **Dexie** has a query builder and live queries, which the in-memory design never uses.
  - **The raw IndexedDB API** needs event-callback boilerplate for every operation.
  - **A repository interface with an in-memory fake** puts an interface at a boundary that
    production never swaps.

<a id="r-07"></a>
### R-07 · Durable storage and a single running copy

- **Decision**:
  - At start, the app asks for persistent storage with `navigator.storage.persist()`. The Backup
    screen shows whether the browser granted it ([contracts/ui.md](contracts/ui.md#backup)).
  - The app holds a Web Lock for as long as it runs. A second tab or window that cannot get the lock
    shows `open-in-another-tab` and loads no data.
- **Rationale**:
  - **Persistent storage**: by default, browsers keep site data as "best effort". When the disk
    runs low, they delete it by origin, least recently used first. Persistent storage removes that
    risk where the browser grants it, but each browser decides by its own rules:
    - **Chrome and Edge** never ask the user. They grant persistence only to installed web apps and
      frequently used sites. The browser source shows that a plain `localhost` tab does not
      qualify, so the request returns `false`.
    - **Firefox** asks the user once.
    - When storage is blocked, the request rejects. The app then treats the data as not persistent.

    Telling the user, and pointing at backups ([User Story 7](spec.md#user-story-7)), is therefore
    the real safeguard. That is the defensive part (constitution VIII).
  - **Single copy**: with the state in memory ([R-05](#r-05)), two tabs would each hold their own
    copy. A restore or a category deletion in one tab would leave the other writing references to
    records that no longer exist, and both tabs could create a pending batch
    ([FR-022](spec.md#fr-022)). A single lock call prevents that whole class of corruption.
  - Both APIs work on `http://localhost`, which browsers treat as a secure context. Web Locks are in
    every supported browser (Chrome 69, Edge 79, Firefox 96).
- **Alternatives considered**:
  - **Making the app installable**, as a web app manifest, so that Chrome and Edge would grant
    persistence. It is a delivery feature the spec does not ask for, and is noted for later
    ([R-22](#r-22)).
  - **Keeping tabs in sync with a `BroadcastChannel`**, by reloading on every write elsewhere, is
    more code and opens new races.
  - **Ignoring multiple tabs** risks silent corruption, against constitution VIII.

<a id="r-08"></a>
### R-08 · Representing money, dates and names

- **Decision**:
  - **Money**: integer euro cents. Amount text is parsed straight into cents without floating
    point, and display uses `Intl.NumberFormat` ([FR-060](spec.md#fr-060)).
    - Opening and stated balances may be negative.
    - A budget limit must be above zero, because removing the budget is how a user says "no limit".
  - **Dates**: `YYYY-MM-DD` strings in the user's local calendar.
    - "Today" comes from the local clock in the store layer and is passed into domain functions.
    - A month is the first seven characters, and a range check is a string comparison.
  - **Names** (confirmed 2026-10-02, now in [FR-001](spec.md#fr-001), [FR-021](spec.md#fr-021)
    and [FR-032](spec.md#fr-032)): account, category and profile names are unique by *name key*:
    the name trimmed and lower-cased. It is stricter than an exact match: "Groceries" next to
    "groceries " is the confusion that unique names are there to prevent.
- **Rationale**:
  - Every amount has exactly two decimals, so integer cents make arithmetic exact.
  - Calendar dates carry no time zone that could move a transaction into a different day or month.
- **Alternatives considered**:
  - **Floating-point euros** produce rounding errors.
  - **A decimal library** is unnecessary when every amount has exactly two decimals.
  - **`Date` objects or timestamps** shift with time zones.
  - **Exact-match names** allow near-duplicates.

## CSV import

<a id="r-09"></a>
### R-09 · Decoding and tokenising CSV files

- **Decision**:
  - The file is read as bytes and decoded with `TextDecoder(encoding, { fatal: true })`.
  - Papa Parse tokenises the text into records and detects the delimiter. It is passed
    `delimitersToGuess: [",", ";", "\t", "|"]`, so it tries exactly the delimiters the contract
    lists. If none fits, Papa Parse falls back to a comma, and the layout check or the preview shows
    the misreading.
  - The domain receives the records as a table of strings and does all mapping, parsing and
    flagging ([contracts/csv-import.md](contracts/csv-import.md)).
  - Parsing runs on the main thread.
- **Rationale**:
  - `TextDecoder` supports every encoding in the contract natively, in browsers and in Node, with no
    dependency. Node only decodes Windows-1252 correctly from 24.13.1, where `0x80` becomes "€".
    That is why [R-02](#r-02) sets 24.13.1 as the minimum.
  - Papa Parse is the established CSV tokeniser. It handles quoting, line breaks inside cells and
    delimiter detection.
  - The profile in [FR-021](spec.md#fr-021) has no delimiter setting, and detection keeps it that
    way. The preview shows the result before any batch exists.
  - Keeping tokenising outside the domain keeps the domain free of dependencies ([R-16](#r-16)).
  - Papa Parse 5.7 tokenised a file of 5,000 rows and 8 columns in about 15 ms, measured on Node
    24. That is far inside the 10 s of [SC-010](spec.md#sc-010), so a web worker would add
    complexity without benefit.
- **Alternatives considered**:
  - **Papa Parse's own encoding option** only works on `File` objects in a browser, cannot run in
    Node tests, and cannot decode strictly.
  - **A hand-written tokeniser** puts us in charge of the quoting edge cases, which is where CSV
    bugs live.
  - **A delimiter field in the profile** is not part of FR-021. It is worth revisiting if detection
    proves unreliable on real files.

<a id="r-10"></a>
### R-10 · Duplicates match on direction too (confirmed)

- **Decision**: duplicate matching includes the direction of the money, money out or money in. The
  user confirmed this on 2026-10-01, and [FR-024](spec.md#fr-024) now states it. The contract
  computes it as the *signed effect* on the account
  ([contracts/csv-import.md](contracts/csv-import.md#duplicate-matching)).
- **Rationale**:
  - A purchase and its refund of the same amount on the same day are different money movements.
    Comparing amounts without direction would flag the refund as a duplicate and keep it out of
    review by default.
  - The signed effect also covers FR-024's transfer clause directly. A transfer moves money *into*
    its destination account, and the destination account's own export shows exactly that.
  - Every case the spec names is still flagged:
    - the same file imported twice;
    - an overlapping date range;
    - the other leg of a transfer;
    - identical rows within one file.
- **Alternatives considered**:
  - **Amounts without direction**, the spec's earlier wording, would flag a refund as a duplicate of
    its purchase.

<a id="r-11"></a>
### R-11 · Vendor groups per side; an empty counterparty is no vendor (confirmed)

- **Decision** (confirmed 2026-10-01, now in [FR-026](spec.md#fr-026)):
  - Review groups rows by vendor *and side*: purchases from a shop and refunds from the same shop
    form two groups.
  - A row whose counterparty cell is empty has no vendor and is shown as a plain row.
- **Rationale**:
  - **Per side**: a group assignment gives every row in the group one category
    ([FR-026](spec.md#fr-026)). A category belongs to one side
    ([FR-015](spec.md#fr-015), [FR-030](spec.md#fr-030)), so a group that mixed purchases and
    refunds could not take one category at all.
  - **Empty counterparty**: treating empty text as a vendor would gather every row without a
    counterparty into one meaningless group.
- **Alternatives considered**:
  - **Mixed groups, with the group's category applied only to rows of one side**, would have a
    control labelled "the group" quietly skip some of its rows.

<a id="r-12"></a>
### R-12 · **Interpretation**: further import rules the spec leaves open

- **Decision**:
  1. **Zero amounts** (confirmed 2026-10-02, now in [FR-023](spec.md#fr-023)): a zero in a signed
     column is proposed as an expense. FR-023 defined only money out and money in, and expense is
     the manual-entry default kind ([FR-014](spec.md#fr-014)).
  2. **Debit and credit cells** (confirmed 2026-10-01, now in [FR-028](spec.md#fr-028)): a cell
     holding zero counts as empty, as a blank one does. Files from banks that fill the unused
     column with `0,00` therefore import.
  3. **Sign inversion** applies only to a single signed column. With separate debit and credit
     columns, the column decides the direction ([User Story 2](spec.md#user-story-2) scenario 3),
     so the profile has no inversion setting in that mode.
  4. **Deleting a category while a batch is pending** also moves the pending rows assigned to it to
     their side's "Uncategorised". This extends [FR-034](spec.md#fr-034) so that confirming the
     batch can never write a reference to a deleted category.
  5. **An included duplicate** ([FR-025](spec.md#fr-025)) becomes one of the rows under review and
     joins its vendor group, keeping its own assignment.
- **Rationale**: each rule is the smallest one that keeps the spec's stated rules consistent with
  one another. Item 1 is the one a user would notice.
- **Alternatives considered**:
  - **Zero amounts as unparsable** would contradict [FR-010](spec.md#fr-010), which allows zero.
  - **Treating `0,00` as a value**, the spec's earlier literal reading, would have made files from
    banks that fill the unused column with zero impossible to import.

## Backup

<a id="r-13"></a>
### R-13 · A JSON backup, validated before the user confirms

- **Decision**:
  - The backup is one JSON file ([contracts/backup-file.md](contracts/backup-file.md)).
  - zod checks the file's shape at the boundary. A pure domain function checks the state
    [invariants](data-model.md#invariants).
  - Restoring runs in four steps: validate, confirm, replace everything in one IndexedDB
    transaction, then reload the in-memory state.
- **Rationale**:
  - JSON maps one-to-one onto the stored records, is human-readable, and needs no dependency to
    write.
  - A file the user loads is untrusted input. zod states its shape briefly and reports readable
    errors.
  - The invariants are business rules, so they belong in the domain, where tests also use them to
    check that no operation breaks them.
  - One transaction makes a restore all-or-nothing ([FR-072](spec.md#fr-072)).
- **Alternatives considered**:
  - **A zip with one file per store** brings no benefit at this size and needs a zip library.
  - **Hand-written type guards** take more code to cover every field, with worse error messages.
  - **Validating after the user confirms** would have the user agree to replace their data for a
    file that is then refused.

## Insights and budgets

<a id="r-14"></a>
### R-14 · Aggregation, chart granularity and the budget month

- **Decision**:
  - **Aggregation**: pure domain functions over the in-memory transactions.
    - Transfers are excluded ([FR-012](spec.md#fr-012)).
    - A period includes both its start date and its end date.
  - **Spending line**: one point per day for periods up to 92 days, about a quarter, and one per
    calendar month beyond that. Empty buckets are zero. Each point also carries its own expense
    breakdown, summed in the same pass, so its tooltip needs no work of its own.
  - **Budget month**: the calendar month that contains the period's end date
    ([FR-051](spec.md#fr-051)). It is measured over that whole month, as FR-041 defines budgets by
    calendar month, and labelled with it.
  - **Budget limits** (confirmed 2026-10-01, now in [FR-041](spec.md#fr-041)): each category has
    one current limit, which applies to whichever month is shown. The Budget record therefore holds
    a single `limitCents`, and no history is stored ([data-model.md](data-model.md#budget)).
  - **Charts**: shadcn's chart component, which wraps Recharts 3 ([R-03](#r-03)). "Unaccounted" gets
    an SVG hatch pattern and a legend marker, so it stays distinguishable whatever colour the user
    gives it ([FR-052](spec.md#fr-052), [FR-033](spec.md#fr-033)).
    - The pattern is defined in `<defs>` inside the chart.
    - That one segment takes the pattern as its `fill` in the chart data. Recharts 3 deprecates the
      `Cell` component that older examples use.
    - A colour swatch cannot show a pattern, so the legend is a component of our own
      ([contracts/ui.md](contracts/ui.md#insights)).
- **Rationale**:
  - Daily points over a year are noise, and monthly points within one month collapse to a single dot.
  - Aggregating 5,000 transactions is a single pass that takes milliseconds. The 2 s of
    [SC-009](spec.md#sc-009) is therefore spent almost entirely on drawing charts of at most about
    100 points.
- **Alternatives considered**:
  - **Weekly buckets** depend on the locale's first day of the week, and add a third granularity
    for little gain.
  - **A limit history per month**: the user chose one current limit for every month
    ([FR-041](spec.md#fr-041)).

## Quality

<a id="r-15"></a>
### R-15 · Errors as codes, wording in one place

- **Decision**:
  - Domain and store functions return typed results: either changes, or a refusal code with
    details.
  - The UI turns codes into plain language in a single module, `src/ui/messages.ts`, and places
    each message as [FR-068](spec.md#fr-068) requires
    ([contracts/ui.md](contracts/ui.md#message-catalogue)).
  - **Failed storage writes**: when a write transaction fails, the in-memory state stays untouched
    and the user sees `save-failed`.
    - A write counts as successful only when its transaction completes.
    - A quota error, or a failure while committing, aborts the whole transaction.
    - The store checks the error's `name` (`QuotaExceededError`, `UnknownError`), never its type.
  - **Storage unavailable at start**: if IndexedDB cannot be opened, the app shows
    `storage-unavailable` on its own screen. Browsers report blocked storage either as a
    `SecurityError` thrown at once (Firefox, Safari) or as an `UnknownError` delivered later
    (Chromium), and the app handles both.
  - **Unexpected errors**: an error boundary, plus handlers for unhandled promise rejections, shows
    `unexpected-error` with a reload button. The details go to the console.
- **Rationale**:
  - Codes keep business rules free of UI wording, and give tests stable values to assert on.
  - One module holds all wording, so [SC-012](spec.md#sc-012) can be checked in one place.
  - Constitution VIII reserves the console for the truly unexpected, which is exactly where these
    handlers send the details.
- **Alternatives considered**:
  - **Exceptions for business refusals** turn expected outcomes into hidden control flow.
  - **Messages written in the domain** tie business rules to wording.

<a id="r-16"></a>
### R-16 · Layer folders, with the domain rule checked automatically

- **Decision**:
  - The source folders are the layers ([plan.md](plan.md#project-structure)).
  - `src/domain` imports nothing from outside `src/domain`: no npm package, no other source folder,
    and no browser global.
  - A dependency-cruiser rule run in CI (`npm run check:architecture`) checks the imports.
    ESLint's `no-restricted-globals` checks the browser globals in domain files.
  - Code quality is checked by ESLint 10, with typescript-eslint and the React hooks rules, and by
    Prettier (constitution VI).
    - ESLint 10 accepts flat config only.
    - The hooks plugin's recommended preset includes the React Compiler rules, such as no setState
      in effects, as errors.
- **Rationale**:
  - "Imports nothing outside the domain" is the simplest rule that implies the constitution's gate:
    no framework, UI or persistence imports.
  - dependency-cruiser resolves the real target of every import, whether relative or a package,
    including type-only imports. The check therefore cannot be dodged by spelling a path
    differently.
- **Alternatives considered**:
  - **ESLint's `no-restricted-imports`** matches import strings, not resolved files, so relative
    paths slip through.
  - **eslint-plugin-boundaries** reaches the same result with more configuration and a resolver.
  - **Code review alone** cannot enforce something the constitution makes a gate.
  - **Oxlint instead of ESLint**: Oxlint is Vite 8's template default and much faster. ESLint keeps
    the full typescript-eslint and React hooks rule sets, and linting speed is no constraint at this
    size.

<a id="r-17"></a>
### R-17 · Testing

- **Decision**: every task is done test-first (constitution VII), with two test runners at three
  levels:

| Level | Tools | Covers |
|---|---|---|
| Domain unit | Vitest in Node, plain data | Every business rule; the bulk of the tests |
| Store integration | Vitest in Node with `fake-indexeddb` | Atomic writes (confirmation, category deletion, restore), state surviving a reopen ([FR-022](spec.md#fr-022)), refusal paths |
| Browser | Playwright in Chromium and Firefox, on the local production build or on a deployed URL given as `BASE_URL` ([R-18](#r-18)) | UI behaviour, such as form defaults and pickers ([FR-011](spec.md#fr-011), [FR-014](spec.md#fr-014), [FR-015](spec.md#fr-015), [FR-030](spec.md#fr-030)), review interactions and where messages appear ([FR-068](spec.md#fr-068)). Also one journey per user story, the network guard ([FR-061](spec.md#fr-061)), performance ([SC-009](spec.md#sc-009), [SC-010](spec.md#sc-010)) and the backup round trip ([SC-014](spec.md#sc-014)) |

  - **Location**: Vitest tests sit next to the code they test, as `*.test.ts`. Playwright specs live
    in `e2e/`: UI behaviour in `e2e/ui/`, and journeys at the top level
    ([quickstart.md](quickstart.md#validation-scenarios)).
  - **Test-first on screens**: during development, Playwright's UI mode re-runs a spec on every
    save against the running dev server. Every test gets a fresh browser context with empty storage.
- **Rationale**:
  - The pure domain makes most rules testable in milliseconds without a browser.
  - Integration tests cover what only storage can break.
  - Browser tests see what the user sees: the real components and styles, real IndexedDB, drawn
    charts, and file download and upload. They need no mocks of browser APIs.
  - Two runners is the minimum: a fast Node runner for test-first work on rules, and a real browser
    for everything on screen (constitution II, VII).
- **Alternatives considered**:
  - **Component tests in jsdom with Testing Library** are faster per test, but they bring costs:
    - They need mocks of browser APIs such as `matchMedia` and `ResizeObserver`, plus a fake
      IndexedDB inside jsdom.
    - Charts draw nothing in jsdom.
    - They add four more test packages (constitution II).
  - **Vitest browser mode** gives a real browser, but would be a second way of driving one, next to
    Playwright.
  - **Playwright's runner for the unit tests too** would mean one runner, but no fast watch loop
    for test-first work on rules.
  - **Cypress**: Playwright has the needed multi-browser support, downloads and uploads built in.
  - **End-to-end journeys only** give slow feedback, and constitution VII asks for a failing test
    per behaviour.

<a id="r-18"></a>
### R-18 · Continuous integration and the post-push check

- **Decision**:
  - Fill in the existing `.github/workflows/regressiontests.yml` rather than add a new workflow. It
    gets two jobs.
  - **`test`** runs on pushes to `main`, on manual dispatch, and on pull requests to `main`, which
    is a new trigger. It runs:
    1. Node setup from `.nvmrc`, with the npm cache. The stub's `actions/checkout@v4` moves to
       `actions/checkout@v7`, and `actions/setup-node@v7` is added; both are the current majors and
       run on Node 24;
    2. `npm ci`;
    3. lint;
    4. the architecture check;
    5. typecheck;
    6. Vitest;
    7. the build;
    8. installing the Playwright browsers;
    9. the end-to-end tests;
    10. on failure, uploading the Playwright report.
  - **`deployed`** runs when Vercel reports a successful production deployment through GitHub's
    `deployment_status` event ([R-20](#r-20)).
    - It runs the end-to-end suite against the Vercel production domain, passed to Playwright as
      `BASE_URL`. The domain is the GitHub Actions repository variable `VERCEL_PRODUCTION_URL`.
    - The production domain is public under Vercel's default Standard Protection, so the job needs
      no login and no secret. The decision was made on 2026-10-02.
    - Before testing, the job waits until the domain serves the commit that triggered the event,
      `github.event.deployment.sha`. Without the wait, it might test the previous build and pass
      for the wrong commit.
      - The production build names its commit in `<meta name="app-commit">`. On Vercel the value is
        `VERCEL_GIT_COMMIT_SHA`, and every other build writes `local`.
      - The job reads the tag every 10 seconds and fails after 5 minutes.
  - The rest of the post-push gate is manual: a person walks the
    [manual checks](quickstart.md#manual-checks) on both the local build and the Vercel production
    domain ([quickstart.md](quickstart.md#after-pushing-to-main)).
- **Rationale**:
  - The constitution makes passing tests a condition for merging. Running `test` on pull requests
    catches a failure before it reaches `main`, not after.
  - The constitution's post-push quality gate asks for both deployments to be checked against the
    user stories.
    - `test` already exercises the local production build, served on `localhost` inside the runner.
    - `deployed` runs the same journeys on the real Vercel deployment.
    - That leaves only the judgement criteria to a person.
  - Building on the user's file keeps one pipeline.
- **Alternatives considered**:
  - **The deployment's own URL from the event**, such as `project-abc123-team.vercel.app`, would
    always serve exactly the pushed commit. But Standard Protection puts these URLs behind a Vercel
    login, so the job would need Vercel's automation bypass secret. The production domain can
    still serve the previous build for a moment after a deployment, and the wait for the commit
    closes that gap without a secret.
  - **A fixed pause before the tests** is simpler than the wait. But no pause is long enough for
    every deployment, and a long one slows every run.
  - **Vercel's `repository_dispatch` events** would also signal a finished deployment. But
    `deployment_status` is sent by default, and it is the event Playwright's CI guide uses.
  - **A manual check only** would leave the mechanical part of the gate to memory.
  - **A second workflow file** means two pipelines to keep in step.
  - **One job per check** runs in parallel, but repeats the install. One job is simpler at this
    size.

<a id="r-19"></a>
### R-19 · No request leaves the machine

- **Decision**:
  - The production build carries a Content-Security-Policy that limits scripts, styles, images,
    fonts and connections to the app's own origin, with no exception for inline styles. Three
    measures keep the components inside that policy ([R-03](#r-03)):
    - Base UI runs inside its `CSPProvider` with style elements disabled.
    - Our copy of shadcn's chart component sets its colour variables through React style props
      instead of the `<style>` element it injects by default. React applies style props through the
      DOM's style API, which CSP does not restrict, so per-category colours work the same way.
    - Notifications use Base UI's toast, not Sonner.
  - **No exception**: the AI features post to `/api/ai` on the app's own origin, and the local
    server passes their requests on to OpenAI ([R-24](#r-24)). `connect-src` therefore allows the
    app's own origin alone. In v1.2, it also listed the origin of the hosted n8n workflow
    ([R-23](#r-23)).
  - No CDN assets: the app bundles its icons and its fonts, and serves them from its own origin
    ([R-27](#r-27)). Before v1.4, it used the system font stack and no web fonts.
  - No analytics and no error-reporting SDK.
  - **Regression test**: the browser-test guard ([R-17](#r-17)) fails on any request outside the
    app's origin, on a request to `/api/ai` that no test answers in OpenAI's place, and on any CSP
    violation the page reports.
- **Rationale**:
  - [FR-061](spec.md#fr-061) is a MUST, and telemetry is on the spec's "Never" list
    ([Out of Scope](spec.md#out-of-scope)).
  - The same policy meets [FR-062](spec.md#fr-062) by construction: an app that cannot reach any
    other host cannot instruct a payment.
  - With the policy in place, a dependency that tries to call out fails loudly instead of leaking
    quietly.
  - The dev server is exempt because hot reload needs inline scripts and a WebSocket.
- **Alternatives considered**:
  - **The test guard alone** only catches violations on the paths the tests take.

<a id="r-20"></a>
### R-20 · Serving locally and on Vercel; later packaging

- **Decision**:
  - `npm start` builds the app and serves it with `vite preview` on port 4173.
  - The dev server uses port 5173.
  - Both ports are strict: if a port is taken, the server fails instead of moving to another.
  - Vite builds with `base: "./"`, so asset URLs are relative.
  - Both servers listen on `localhost` only, which is Vite's default.
  - **Vercel**: Vercel's GitHub integration deploys every push to `main` to production, and every
    pull request to a preview.
    - Vercel detects Vite and builds with `npm run build` into `dist/`.
    - No `vercel.json` is needed, because with hash routing the server is only ever asked for `/`.
    - The Node version comes from `engines.node` ([R-02](#r-02)).
    - The one-time project settings are in [quickstart.md](quickstart.md#vercel-setup):
      - the Vercel Toolbar off for previews;
      - Deployment Protection no stricter than Standard Protection, so the production domain stays
        public for the `deployed` job ([R-18](#r-18));
      - System Environment Variables available to builds, so a build can name its commit
        ([R-18](#r-18));
      - Web Analytics and Speed Insights never enabled.
  - **Purpose of the Vercel copy** (confirmed 2026-10-01, now in [FR-061](spec.md#fr-061)): it
    exists for the constitution's post-push check and for showing the app to others. Daily use with
    real data stays on the local build. Using a hosted copy for real data is
    [out of scope](spec.md#out-of-scope).
- **Rationale**:
  - **Real data stays local** because only the local build fully meets [FR-061](spec.md#fr-061).
    - The hosted copy needs a network to load.
    - Vercel sees each request for the app's files, as any host does.
    - It never sees ledger data. That data stays in the visitor's browser, under the Vercel origin,
      apart from the local build's data.
  - **The toolbar is off** because Vercel injects its toolbar script into preview deployments by
    default. That third-party script runs against FR-061. The CSP ([R-19](#r-19)) would block it,
    but switching it off avoids the blocked request altogether.
  - A browser keeps data per origin, meaning scheme, host and port. If the port silently changed,
    the app would open empty on a new origin and look as if all data were lost.
  - The host name is part of the origin too: `127.0.0.1` reaches the same server but holds separate,
    empty data. The documented address is therefore always `http://localhost:4173`.
  - Listening on `localhost` only keeps the app off the local network. It also guarantees a secure
    context, which Web Locks, persistent storage and `crypto.randomUUID` all need ([R-07](#r-07)).
    A LAN address would not provide one.
  - Separate ports keep development data away from real data.
  - Relative asset paths and hash routing ([R-04](#r-04)) let the build load from any path or from
    local files. A Docker image or a desktop shell can therefore come later without changes to the
    app. Moving existing data into such a package goes through a backup
    ([User Story 7](spec.md#user-story-7)).
- **Alternatives considered**:
  - **Default port behaviour** can fall back silently to another port, which looks like data loss.
  - **One port for development and real use** would run development code against real data.

<a id="r-21"></a>
### R-21 · Rendering the transaction list

- **Decision**:
  - The list renders every row that matches the filters. Pagination is out of scope, and v1 does
    not virtualise the list.
  - Rows use lightweight markup: plain elements, not a component per cell.
  - Rows carry the CSS `content-visibility: auto`, and the filtered list is memoised.
  - The column header is a row of its own above the list, not a table head. CSS containment does
    not apply to table rows, so in a `<table>` the rows would lose `content-visibility`.
  - For editing in place, each cell is a plain `<button>`. Only the cell being edited mounts its
    field or select, so the list still has no component per cell.
  - Each row is a memoised component, so opening or closing a cell renders its own row again, not
    the whole list. The Edit transaction icon is one SVG symbol that every row reuses.
- **Rationale**:
  - At the design point of 10,000 transactions, plain rows were expected to render well within a
    second, and `content-visibility` lets the browser skip layout and painting for rows off screen.
  - v1 has no list search ([Out of Scope](spec.md#out-of-scope)), so the browser's find-in-page is
    the user's search. Rows skipped by `content-visibility` stay in the page, and find-in-page
    reaches them in Chrome, Edge and Firefox. Virtualisation removes off-screen rows from the page,
    so find-in-page would miss them.
  - Virtualisation would also add code and moving parts, for a need nobody has measured.
  - Without memoised rows, opening one cell rendered all 10,000 rows again and took 0.7 to 0.9 s;
    with them it takes under 0.15 s. An icon component in each row added about 0.8 s to the first
    render in Firefox; the shared symbol costs about as much as no icon at all.
  - Revisit if the first render passes 1 s at 10,000 rows ([quickstart.md](quickstart.md#performance)).
    It does in Firefox, at about 1.4 s, while Chromium stayed under a second on a quiet machine.
    Editing in place made each cell a button and added a column, and Firefox now takes about
    2.0 to 2.3 s; Chromium took about 1.9 s on the same busy machine (measured 2026-10-08).
    Building the rows takes the time, not laying them out, so `content-visibility` does not help. The fix, showing the first
    rows at once and the rest just after, is listed under Not in v1
    ([Out of Scope](spec.md#out-of-scope)).
- **Alternatives considered**:
  - **TanStack Virtual** is proven, but it breaks find-in-page.
  - **Pagination** is out of scope.

<a id="r-22"></a>
### R-22 · Known limitations accepted for v1

- **Lines before the header**: some banks put account details above the header row. Such a file
  fails the header check ([FR-021](spec.md#fr-021)) and no batch is created. The workaround is to
  delete those lines first. A "skip leading lines" profile setting is the likely first addition.
- **Amount notation**: amounts with a currency sign, spaces as thousands separators, or a trailing
  minus are unparsable. [FR-028](spec.md#fr-028) fixes the grammar
  ([contracts/csv-import.md](contracts/csv-import.md#amount-grammar)).
- **Data location**: data belongs to one browser profile and origin. Another browser, port or host
  name starts empty, and a backup is how data moves.
- **Best-effort storage in Chrome and Edge**: on `localhost`, these browsers do not grant persistent
  storage ([R-07](#r-07)). If the disk runs low, they may delete the data, and the Backup screen says
  so. Making the app installable would likely change this, and is the first thing to try if it
  matters.
- **Private windows**: a private window keeps data only until it closes. The app cannot reliably
  detect a private window.
- **Delimiter detection**: detection can guess wrong on a file with a single column. The preview
  shows the misreading before any batch exists.

## Category suggestions (v1.2)

<a id="r-23"></a>
### R-23 · Category suggestions through a hosted n8n workflow that asks Claude

**Superseded in part by [R-24](#r-24)** (owner, 2026-10-15), in v1.3. The n8n
workflow, Claude, the address in the code, the CSP exception and `src/categoriser/` are gone: both
AI features now ask OpenAI through a route of the local server, and the hosted copy has no AI
features. What this entry decides about the AI features switch, the store's check, data
minimisation, names rather than ids, one suggestion per row, the size and time of a request, the
mark, concurrency, zod and the untrusted answer still holds.

- **Decision** (owner, 2026-10-09 and 2026-10-12):
  - **Suggest categories** in review ([FR-090](spec.md#fr-090)) posts one JSON request to an n8n
    workflow on the owner's hosted n8n instance, such as n8n Cloud
    ([contracts/ai.md](contracts/ai.md)). The workflow is committed as
    `n8n/financial-copilot-categories.json`:
    1. a Webhook node, the trigger, which answers through the Respond to Webhook node and allows
       the app's origins;
    2. an HTTP Request node, **Ask Claude**, the reasoning step: it posts to Anthropic's Messages
       API with n8n's Anthropic credential (`claude-opus-5-5`, adaptive thinking at low effort, at
       most 16,000 output tokens), and with structured outputs, whose JSON Schema the API enforces;
    3. a Respond to Webhook node, which returns Claude's answer text, skipping its thinking.

    The first version used n8n's Basic LLM Chain with a Structured Output Parser. The parser only
    checks the model's text afterwards, and failed on real answers with "Model output doesn't fit
    required format" (owner, 2026-10-12); structured outputs cannot return another shape.
  - The app turns the answer into assignments itself, so the automated action, filling the batch,
    keeps every rule of review ([FR-092](spec.md#fr-092)).
  - **AI features** ([FR-095](spec.md#fr-095)) is a switch on a new Settings screen, stored as an
    optional `aiFeatures: true` in the settings ([data-model.md](data-model.md#settings)). Turning
    it on opens the data-sharing warning first. While it is off, Suggest categories is
    unavailable, and the store refuses to send with `ai-features-off`.
  - `src/categoriser/` is the only code that makes a request. `endpoint.ts` holds the address, in
    the code; `categoriser.ts` sends the request, gives up after 4 minutes and checks the answer
    with zod. The domain builds the request and applies the answer as pure functions
    (`src/domain/import/suggestions.ts`).
  - The production CSP adds the workflow's origin to `connect-src`, read from `endpoint.ts`
    ([R-19](#r-19)).
  - The mark is an optional `suggested: true` on a category assignment
    ([data-model.md](data-model.md#pending-row)).
- **Rationale**:
  - **One switch in Settings** (owner, 2026-10-15): more AI features are to come, and each would
    otherwise need its own warning. The user agrees once, where settings are expected, and the
    warning says what every AI feature sends and to whom ([FR-061](spec.md#fr-061)). It replaced
    two designs: a header switch with a banner on every screen, which stayed in view long after it
    mattered (2026-10-12), and then a warning on Suggest categories with **Don't warn me again**,
    which tied consent to one button. The store checks the setting itself, so a mistake in a screen
    cannot send data with AI features off.
  - **Hosted, not local** (owner, 2026-10-12): with Claude, the texts reach Anthropic whatever
    runs the workflow, so running n8n on the user's computer adds a process to start for little
    gain. A fully local setup is listed under Not in v1 ([Out of Scope](spec.md#out-of-scope)).
  - **The address in the code** (owner, 2026-10-12): the simplest setup. Until the owner's instance
    exists, it holds a placeholder, and only the tests reach it. The cost: the address is public in
    every build, the Vercel copy included, so anyone could call the workflow and spend the owner's
    Anthropic credits. CORS stops only other web pages, not other callers. The safeguard is a
    monthly spending limit on the Anthropic key ([quickstart.md](quickstart.md#ai-features)).
  - **n8n holds the key and the prompt.** The Anthropic API key stays in n8n's credential store,
    never in the browser, IndexedDB or a backup file. The prompt and the model change in n8n without
    a release of the app.
  - **Data minimisation** ([FR-091](spec.md#fr-091)): a category needs the texts, not the amounts,
    dates or accounts. Examples carry only descriptions, because confirmation drops the
    counterparty ([data-model.md](data-model.md#state-transitions)). That costs some accuracy for
    banks whose descriptions say less than their counterparty.
  - **Names, not ids**: names are unique per side by name key ([R-08](#r-08)), so the mapping is
    unambiguous, and the model cannot invent an id. Names also keep the request readable when the
    workflow is tested by hand.
  - **One suggestion per row**, not per vendor group: a group can mix purposes, for example
    PayPal, and review already shows such a group as "Mixed".
  - **Size and time**: about 12–15 output tokens per row, plus thinking. 300 rows is SC-001's
    month, an estimated 1–3 minutes with Opus. The 4-minute timeout sits above that and below
    Firefox's own 300-second response timeout, so the app's message comes first. Thinking counts
    toward the model's output limit, so the node's default of 4,096 tokens would cut a long answer
    short.
  - **The mark lives on the assignment**: every user choice stores a new assignment without it,
    and confirmation copies only the category, so no rule has to remember to clear it. Earlier
    versions drop the unknown key on loading, so v1.2 is a MINOR release (constitution IX).
  - **Concurrency**: Confirm waits for the answer, leaving review aborts the request, and applying
    re-checks the batch and every row, so a late answer never overrides the user.
  - **zod and the CSP**: zod probes `new Function` when it builds a schema, which the CSP reports as
    a violation. `src/files/zod.ts` switches the probe off once, and every schema module imports
    `z` from it, whatever the order the modules load in.
  - **Tests need neither n8n nor a key**: Vitest stubs `fetch`; Playwright routes the address and
    answers the CORS preflight itself, so the `deployed` job on the Vercel origin runs the same
    specs ([R-18](#r-18)).
  - **The hosted copy** can use suggestions too, with its demonstration data, because the workflow
    allows its origin; AI features are off there until the visitor turns them on.
  - **The answer is untrusted**: bank texts could carry instructions to the model. Only names of the
    row's own side, for rows that were sent, are accepted. Nothing becomes a transfer or a protected
    category, every suggestion is marked, and confirming stays the user's step.
- **Alternatives considered**:
  - **Calling Anthropic from the browser**: the API key, which allows any use of the API, would sit
    in the app's code or storage, and in every backup.
  - **A proxy of our own**: a server process to write, run and secure, which n8n already is.
  - **n8n on the user's computer, and a local model through Ollama**: only together do they keep
    everything on the computer, and then suggestions would need no consent to data sharing. A
    local model needs a large download and suggests worse on bank texts. Listed under Not in v1; the workflow's chat
    model node can be swapped without changing the app.
  - **The address entered in the app, or set at build time**: keeps it out of the public build, but
    adds a setting or a build step. The owner chose the address in the code.
  - **Chunked or parallel requests, one item per vendor group, or streaming**: faster for very
    large files, but more code for a size SC-001 does not reach.

## AI through OpenAI, and the finance chat (v1.3)

<a id="r-24"></a>
### R-24 · AI requests through a route of the local server to OpenAI

- **Decision** (owner, 2026-10-15), for [FR-105](spec.md#fr-105):
  - Both AI features post to `POST /api/ai` on the app's own origin
    ([contracts/ai.md](contracts/ai.md#route)). A Vite plugin of our own, `server/aiRoute.ts`, adds
    that route to the dev server and to `vite preview`, the server of `npm start`. It reads
    `OPENAI_API_KEY` from `.env` in the project folder, or from the environment, when the server
    starts, and posts each request's body to OpenAI's Responses API with the key.
    - Without a key, or with an empty one, it adds no route: a request ends in the server's own
      404, and nothing leaves the computer.
    - It answers only a POST from the computer itself, a loopback address, whose `Origin` header,
      when there is one, is the app's own origin. Anything else gets 403, and a body over 2 MB gets
      413.
    - It forwards the body with only the key and the content type, no other header of the
      browser's request, and returns OpenAI's status, content type and body, passing the body on
      as it arrives, so a streamed answer streams ([R-26](#r-26)). Closing the browser's request
      cancels OpenAI's.
  - `src/ai/openai.ts` is the only code that makes a request. It posts
    `{ model, store: false, stream: true, instructions, input, text }` with a strict JSON Schema
    for the answer, reads the answer's text from the streamed events ([R-26](#r-26)), and turns
    every failure into a code. `src/ai/categoriser.ts` and `src/ai/chat.ts` hold each feature's
    prompt and answer schema ([R-25](#r-25)).
    `src/ai/path.ts` holds the path and imports nothing, because Vite bundles its config without
    the `@/` alias.
  - The model is `gpt-6.1-sol`, one constant in `src/ai/openai.ts`.
  - `.env` stays out of git, which ignores `.env*`; `.env.example`, with an empty key, is
    committed.
  - The production CSP allows connections to the app's own origin alone ([R-19](#r-19)).
    `n8n/` and `src/categoriser/` are removed.
- **Rationale**:
  - **The key in `.env`** (owner, 2026-10-15). A variable without Vite's `VITE_` prefix never
    reaches the bundle; only the server reads it. It never reaches the browser, IndexedDB or a
    backup file either.
  - **The server already runs**: `npm start` serves the build with `vite preview`
    ([R-20](#r-20)), so the route is no new process to start. [R-23](#r-23) rejected "a proxy of
    our own" as "a server to write, run and secure"; with the server already there, what remains
    is about 60 lines in one plugin.
  - **One provider, one path** (owner, 2026-10-15): both features share one key, one transport and
    one recipient in the warning. Dropping n8n removes the public address that anyone could call to
    spend the owner's credit, the workflow to publish, the CSP exception and the second third party.
  - **The checks**:
    - Vite's own CORS and host checks run before the route. The host check stops DNS rebinding,
      as long as `allowedHosts` keeps its default, which [R-20](#r-20) does.
    - The Origin check stops other web pages, other apps on `localhost` among them, including a
      plain cross-site form post that needs no preflight.
    - The loopback check matters only if someone starts the server with `--host`, which
      [R-20](#r-20) rules out.
    - Forwarding no other header keeps the browser's cookies for `localhost` away from OpenAI.
  - **A plugin, not Vite's `server.proxy`**: the proxy option would hold the key in the resolved
    config, which Vite prints with `--debug`, and forwards every header of the browser's request.
  - **Failures by body, not by status**: OpenAI reports its own failures as JSON `{ error }`, with
    any status, even 404 for an unknown model. Every other answer outside 2xx comes from no route
    (an empty 404), from the route's checks or from a hosted copy, or is the route's 502 when
    OpenAI cannot be reached, and means that the AI cannot be reached.
  - **Timeout**: 4 minutes, as in [R-23](#r-23), below Firefox's own 300 seconds. The route adds
    no timeout of its own.
  - **No AI features in the hosted copy** (owner, 2026-10-16, [FR-106](spec.md#fr-106)): Vercel
    serves files only, so it has no route, and the hosted copy is for checks and demonstrations
    ([FR-061](spec.md#fr-061)).
    - The app tells where it runs by the page's host name: only `localhost`, `127.0.0.1` and
      `[::1]` are the user's own computer ([R-20](#r-20)). `servedLocally` in `src/ai/local.ts`
      decides it, and `aiFeaturesOn` in `src/store/settings.ts` combines it with the setting.
    - Elsewhere the Settings switch is off and unavailable, even after restoring a backup with AI
      features on, and the store refuses with `ai-features-off`. No request carries data then,
      not even one to the hosted copy's own server, which a request to a missing route would.
    - A build flag from Vercel's environment would mark only Vercel's builds, and a request asking
      whether the route exists would be a request on every visit to Settings.
    - The `deployed` job skips the specs that turn AI features on, and checks the unavailable
      switch instead ([R-18](#r-18)).
  - **Data at OpenAI**: OpenAI's API data policy applies to what a request holds. `store: false`
    keeps the answer out of the responses OpenAI stores for continuing them.
  - **Cost**: the owner gives the OpenAI project a monthly budget, or prepaid credit without
    automatic recharge ([quickstart.md](quickstart.md#ai-features)).
  - **Consent from v1.2 carries over** (owner, 2026-10-16): v1.2 stored AI features on under a
    warning that named n8n and Anthropic and kept amounts and dates on the computer. The owner is
    the app's one user and decided the change, so v1.3 keeps the setting, and the quickstart has
    the owner turn AI features off and on once to agree to the new warning
    ([FR-095](spec.md#fr-095)). Storing the switch under a new key would have asked again, at the
    cost of a rename in the settings and the backup.
  - **Tests need no key**: Vitest stubs `fetch`, and tests the plugin against a local server with
    OpenAI stubbed. Playwright answers at `/api/ai` in OpenAI's place, and the guard fails a
    request there that no test answers, since a running preview may hold a key.
    `playwright.config.ts` also starts its preview with an empty key.
- **Alternatives considered**:
  - **The key in the bundle**, as `VITE_OPENAI_API_KEY`: no route, but anyone who can load that
    build can read a key that allows any use of the API.
  - **Keeping n8n for suggestions**: two paths, two keys and three recipients in the warning.
  - **A chat workflow in n8n**: works in the hosted copy, but as a public, unauthenticated chat on
    the owner's key.
  - **A Vercel Function**: AI features in the hosted copy too, but again a public address that
    spends the owner's credit.
  - **The `openai` package**: a dependency for one POST, which in a browser needs
    `dangerouslyAllowBrowser`.

<a id="r-25"></a>
### R-25 · The finance chat: what a question sends and how it answers

- **Decision** (owner, 2026-10-15):
  - `chatContext(state, today)` in `src/domain/chat.ts` builds the data of
    [FR-102](spec.md#fr-102), as [contracts/ai.md](contracts/ai.md#finance-chat) shows it:
    - the period runs from the first day of the month 12 months before today's month, to today;
    - each month's totals by category come from `insights` for that month ([R-14](#r-14));
    - the budgets come from `budgetProgress` for today's month, and the balances from
      `accountBalance`;
    - every expense and income of the period is a row of date, description, amount and category
      name, money out negative, in euros, by date and then order of entry.
  - `src/ai/chat.ts` sends the instructions, the guide to the app and then the context as JSON,
    then at most the last 10 turns as user and assistant messages, then the question. The answer
    has the strict shape `{ inScope, answer, sources, followUps }` ([R-26](#r-26)). When `inScope` is false, the chat shows its
    fixed answer instead of the model's text ([FR-103](spec.md#fr-103)).
  - `askChat` in `src/store/chat.ts` refuses with `ai-features-off` while AI features are off,
    takes today from the clock, and stores the finished turn ([R-26](#r-26)).
- **Rationale**:
  - **Rows, not detection** (owner, 2026-10-15): subscriptions and price increases need the
    single payments. The model groups similar descriptions better than a rule of ours would, and
    the spec leaves recurring-transaction detection out of scope. The exact totals come from the
    app, because models add up poorly.
  - **13 months** reach a year back, so a yearly price change and the same month last year are
    in the data.
  - **Size**: about 20 tokens per row. The owner's demonstration data has about 650 rows in 13
    months, about 15,000 tokens per question, or about 5 cents with gpt-6.1-sol at $2 and $10 per
    million input and output tokens. A ledger of 10,000 transactions a year sends about ten times
    as much.
  - **The fixed answer out of scope**: only a model can read what a question needs, so the model
    decides; the fixed text makes the refusal the same every time, and testable.
  - **A guide to the app** (owner, 2026-10-16): the chat answers how the app works, and how to make
    a change it cannot make itself, from a guide written for users and kept in the code beside
    the rules, rather than from contracts written for developers. A test keeps it naming every
    screen and the main actions as the app labels them. It is the same for every question, so it
    is part of the cached prefix.
  - **Follow-ups in the answer** (owner, 2026-10-16): the model suggests them in the same request,
    after the sources, so they cost no second request and do not delay the answer's text.
  - **The context first**: every question of a conversation starts with the same instructions and
    data, which lets OpenAI cache that prefix.
  - **Plain text**: no Markdown renderer, and nothing in an answer's text can become a link or
    markup. The app builds the source links itself, from ids ([R-26](#r-26)). Descriptions are
    untrusted, so the prompt says never to follow instructions in them.
  - **10 turns** bound the size of a long conversation.
- **Alternatives considered**:
  - **Totals and a detector of recurring payments of our own**: sends no single payment, but needs
    rules for descriptions that vary from bank to bank, and cannot answer a question about one
    purchase.
  - **Function calling**, letting the model ask for the data it needs: smaller requests, but a
    loop of requests per question and more code.
  - **`previous_response_id`** for the conversation: needs `store: true` at OpenAI.

<a id="r-26"></a>
### R-26 · Streamed answers, Stop, sources and the stored conversation

- **Decision** (owner, 2026-10-16), for [FR-104](spec.md#fr-104),
  [FR-107](spec.md#fr-107) – [FR-110](spec.md#fr-110) and [SC-015](spec.md#sc-015):
  - **Every request streams.** `askOpenAi` posts with `"stream": true` and reads OpenAI's
    server-sent events ([contracts/ai.md](contracts/ai.md#answer)). It adds up the text of each
    `response.output_text.delta`, reports the text so far to an optional callback, and returns the
    whole text on `response.completed`. Category suggestions pass no callback and wait for the
    whole text. The route passes the events on as they arrive.
  - **The answer streams as JSON.** The chat's strict schema is `{ inScope, answer, sources }`,
    and OpenAI writes the keys in the schema's order. `answerSoFar` in `src/ai/chat.ts` reads the
    partial JSON: `inScope` once it is complete, and the `answer` string as far as it has arrived,
    with its escapes decoded.
    - The chat says "Thinking…" until that string is non-empty ([FR-107](spec.md#fr-107)).
    - When `inScope` reads false, the app stops the request and shows the fixed answer at once.
    - The sources are read, and checked with zod, once the answer is complete.
  - **The session in the store.** `src/store/chat.ts` holds in memory the question being
    answered, its text so far, its `AbortController` and the last failure. The chat's component
    only shows them.
    - Leaving Insights unmounts the component and nothing else, so an answer goes on
      ([FR-108](spec.md#fr-108)).
    - Stop, and turning AI features off, abort the request and store the turn with the text so
      far, marked as stopped.
    - A failure stores nothing, and the chat puts the failed question back in its field
      ([FR-104](spec.md#fr-104)).
  - **Sources.** The answer names each source's dates, its category by side and name, and its
    account by name, as the data sent shows them, since that data holds no ids
    ([FR-102](spec.md#fr-102)).
    - Once the answer is complete, `chatSources` in `src/domain/chat.ts` resolves the names by
      name key ([R-08](#r-08)) to ids. It leaves out a source whose category or account it cannot
      find, or whose dates are not a valid range with the start first ([FR-110](spec.md#fr-110)).
    - The stored turn keeps the ids, so a rename does not break a source. A source whose category
      is gone shows as text.
  - **The link** is the transaction list's route with its filters as a query:
    `#/?category=<id>&account=<id>&from=<date>&to=<date>`, each part optional
    ([contracts/ui.md](contracts/ui.md#transactions)). The router reads the query, and the list
    starts with those filters. An unknown id or an invalid date in it is ignored.
  - **The stored conversation** is `state.conversation`, a list of turns
    ([data-model.md](data-model.md#conversation)).
    - In IndexedDB it is a second record of the `settings` store, under the key `conversation`,
      absent while the conversation is empty. In a backup it is the optional key `conversation` of
      `data` ([contracts/backup-file.md](contracts/backup-file.md#compatibility)).
    - A finished turn is written like every other change: decided in the domain, written, then
      applied ([R-06](#r-06)). A failed write shows `save-failed` and keeps the conversation as it
      was. Clearing the conversation removes the record.
  - **History sent**: the last 10 turns that have an answer text. A turn out of scope, or stopped
    before its first words, is left out ([contracts/ai.md](contracts/ai.md#finance-chat)).
- **Rationale**:
  - **One transport**: streaming both features keeps one way to read an answer, one failure table
    and one test helper. Suggestions gain nothing from streaming, and lose nothing either.
  - **Structured output, streamed**: plain text with markers for the scope and a sources block
    would depend on the model keeping a format that nothing enforces. The strict schema keeps the
    fixed answer out of scope reliable and the sources checkable. The price is reading a partial
    JSON string, a few dozen lines of pure, unit-tested code.
  - **Stopping early out of scope**: the model's text is not shown anyway
    ([FR-107](spec.md#fr-107)), so reading on would only cost time and tokens.
  - **Filters, not lists of transactions** (owner, 2026-10-16): the list's filters exist already
    and the user knows them, while a month's total rests on dozens of rows that the model would
    have to cite one by one ([Out of Scope](spec.md#out-of-scope)). A source may hold dates alone,
    for an answer about all spending in a period.
  - **A record in the settings store, not a store of its own**: a new store needs schema version 2,
    and v1.2 cannot open a database of a higher version, so going back would fail at start. That
    would make v1.3 a MAJOR release (constitution IX).
    - v1.2 reads only the `settings` key, and clears every store when it restores a backup, so the
      extra record does no harm.
    - v1.2 drops the unknown key `conversation` when it loads a v1.3 backup, so the backup format
      stays version 1.
  - **The session outside the component**: an answer must outlive the Insights screen, and the
    store already outlives every screen.
  - **Responsiveness** ([SC-015](spec.md#sc-015)): building the context of 5,000 transactions and
    reading the events take milliseconds on the main thread, and the growing answer is one text
    node, so no worker is needed (constitution II).
  - **Testing**:
    - Vitest gives the stubbed `fetch` a `ReadableStream` that the test feeds event by event, to
      check the text so far, Stop, and a failure partway through an answer.
    - Playwright's `route.fulfill` sends a whole body at once. The e2e stand-in therefore answers
      with all its events together, and holds its answer back to show "Thinking…" and Stop before
      the first words.
- **Alternatives considered**:
  - **Streaming only the chat**: two ways to read an answer, and two sets of failure tests.
  - **The conversation in memory only**: lost when the app closes; the owner chose to store it.
  - **An object store of its own for the conversation**: tidier storage, but a MAJOR release.
  - **Sources as exact transactions**: rejected by the owner, as above.
  - **Links written into the answer's text**, with a Markdown renderer: the model would write the
    links, and an answer could link anywhere.

## Design (v1.4)

<a id="r-27"></a>
### R-27 · The reference design's look, made readable, with bundled fonts

- **Decision** (owner, 2026-10-16), for [FR-112](spec.md#fr-112) – [FR-116](spec.md#fr-116):
  - **The reference's tokens.** The colours, corners and shadows of
    [ui.md](contracts/ui.md#look) come from the stylesheet that the reference design publishes. Its
    corner scale matches the app's, since both derive from a radius of 0.625rem.
  - **Four colours darkened.** On its own backgrounds, the reference's text reaches 3.6:1 under its
    primary colour, 4.2:1 in its secondary ink on its canvas, and 2.3:1 and 2.2:1 in its danger and
    positive colours, short of [FR-116](spec.md#fr-116). Each of the four is darkened in OKLCH
    lightness alone, keeping its hue and chroma, until it reaches 4.6:1 on both the canvas and the
    card, or under the card colour for the primary:

    | Colour | Reference | App |
    |---|---|---|
    | Primary | `#6b82c0` | `#5a70ad` |
    | Secondary ink | `#6a7288` | `#646c82` |
    | Danger | `#e88f9a` | `#a65360` |
    | Positive | `#84b79c` | `#45765d` |

  - **The canvas as the accent.** shadcn's components tint hovered and focused options in
    `--accent`. The reference sets it to amber, while the app tints them in the canvas colour,
    which keeps menus and lists calm.
  - **Bundled fonts.** Fontsource's variable packages ship Figtree and Fraunces as `woff2` files,
    with their licence, the SIL Open Font License 1.1 ([plan.md](plan.md#technical-context)).
    - Vite bundles the files, so they come from the app's own origin, as `font-src 'self'` requires
      ([R-19](#r-19)), and work without a network.
    - Fraunces comes with its optical-size axis, as the reference loads it.
    - Each face is split by script. The browser loads only the files the app's text needs, the
      Latin ones, which hold the euro sign: about 20 kB for Figtree and 67 kB for Fraunces.
    - `font-display: swap` shows text at once in the system font ([FR-113](spec.md#fr-113)).
  - **One utility for the card.** The card is a Tailwind `@utility surface` in `src/ui/index.css`,
    because more than twenty elements wear it (constitution III). The elements keep their roles:
    sections, lists and tables.
  - **No dark mode.** The reference has one, but v1 has none ([plan](plan.md#constitution-check)),
    and the owner asked for a look, not a feature.
  - **The layout stays** (owner, 2026-10-16). The reference's top navigation, overview dashboard and
    logo are not taken over; the sidebar and header stay where they are.
- **Rationale**: the owner prefers the reference's look. Its exact tokens get closest to it, and the
  four darker colours keep text readable ([FR-064](spec.md#fr-064)).
- **Testing**: Playwright reads the computed styles of the production build in both browsers,
  colours as the browser resolves them and contrast from them, as WCAG computes it
  (`e2e/ui/design.spec.ts`). A person compares the screens with the reference
  ([quickstart.md](quickstart.md#manual-checks)).
- **Alternatives considered**:
  - **The reference's colours as they are**: text below 4.5:1, as above.
  - **Google Fonts, from which the reference loads them**: a request to a third party, which
    [FR-061](spec.md#fr-061) forbids and the CSP blocks.
  - **Font files copied into the repo**: no version and no licence beside them; the packages carry
    both.
  - **The system font stack**, [R-19](#r-19)'s choice before v1.4: it cannot give the reference's
    look.
  - **shadcn's Card component**: it renders a `div`, which would replace the sections, lists and
    tables that tests and screen readers find by their roles.
