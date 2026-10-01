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
  backend, no server-side code and no network traffic.
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
  - Node.js 24 LTS, pinned in `.nvmrc` and in `engines` in `package.json`. The minimum is 24.15,
    which jsdom 30 requires.
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
### R-03 · React with the Mantine component library

- **Decision**:
  - React, with Mantine as the component library. The Mantine packages used are `core` with its
    required `hooks`, `form`, `dates`, `charts` (built on Recharts), `notifications` and `modals`.
  - `@tabler/icons-react` for icons.
- **Rationale**:
  - One component system gives every screen the same patterns ([FR-065](spec.md#fr-065)).
  - Mantine provides the widgets this spec needs, accessible and themed alike:
    - selects whose options show a colour swatch (category pickers);
    - number inputs with locale separators, a fixed two-decimal scale and no negatives
      ([FR-010](spec.md#fr-010), [FR-060](spec.md#fr-060));
    - a date-range picker with presets ([FR-050](spec.md#fr-050));
    - confirmation modals ([FR-001](spec.md#fr-001), [FR-071](spec.md#fr-071));
    - notifications, and form state that places errors at their fields
      ([FR-068](spec.md#fr-068)).
  - Its charts share the theme, so Insights looks like the rest of the app.
  - React has the most widely known component model and mature testing tools.
- **Findings that shape the build** (Mantine docs, verified 2026-10-01):
  - **Styles**: Mantine 9 needs `@mantine/core/styles.css`, plus each extension's own stylesheet.
    It recommends `postcss-preset-mantine`. `@mantine/dates` requires `dayjs`, which stays in the
    UI layer; the domain keeps its own string dates ([R-08](#r-08)).
  - **Select values**: a Select cannot show a value that is not in its options. When the form edits
    a reconciliation entry, "Unaccounted" therefore stays in the Select's data so its label shows,
    and a custom `filter` hides it from the dropdown ([FR-030](spec.md#fr-030),
    [contracts/ui.md](contracts/ui.md#transaction-form)).
  - **Charts in jsdom**: charts draw nothing in jsdom, because their responsive container has no
    size there. Chart visuals are verified end to end ([R-17](#r-17)). The Insights legend is a
    component of our own, which jsdom tests can check.
  - **Number input**: `NumberInput` has `selectAllOnFocus`, which the amount field uses
    ([SC-002](spec.md#sc-002)).
- **Alternatives considered**:
  - **shadcn/ui with Tailwind** copies the components into the repo, which means more code of our
    own for the same widgets.
  - **MUI** is heavier and brings the Material look.
  - **Svelte or Vue** would work, but offer this app no advantage, and their ecosystems for these
    exact widgets are smaller.
  - **No component library** would mean building a swatch select, a date-range picker, modals and
    notifications ourselves, against constitution II.

<a id="r-04"></a>
### R-04 · Hash-based routing with React Router

- **Decision**: React Router 8's `HashRouter`, with URLs in the hash, as in `#/insights`
  ([contracts/ui.md](contracts/ui.md#shell-and-navigation)). React Router 8 is ESM-only, and imports
  come from `react-router` (the old `react-router-dom` package stays on v7).
- **Rationale**:
  - Each screen has a URL, so the back button and reloads work.
  - Hash URLs need no server rewrite rules. The same build therefore works from `vite preview`, any
    static server, a container, or a desktop shell that loads local files ([R-20](#r-20)).
  - Opening the app's address still lands on the transaction list ([FR-063](spec.md#fr-063)).
- **Alternatives considered**:
  - **History-API routing** needs fallback rules on every host.
  - **No router** loses the back button and links to individual screens.

## State and storage

<a id="r-05"></a>
### R-05 · The whole state in memory; write first, then apply

- **Decision**:
  - At start, every store is loaded into one in-memory state object. A store module built with
    Zustand exposes the actions.
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
- **Alternatives considered**:
  - **Querying IndexedDB per screen** means more asynchronous code and loading states, which
    nothing at this size needs.
  - **Dexie live queries** provide reactive queries, which an in-memory state does not use.
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
  - **Names**: account, category and profile names are unique by *name key*: the name trimmed and
    lower-cased. This is the **interpretation** of [FR-001](spec.md#fr-001),
    [FR-021](spec.md#fr-021) and [FR-032](spec.md#fr-032). It is stricter than an exact match:
    "Groceries" next to "groceries " is the confusion that unique names are there to prevent.
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
    dependency. Node only decodes Windows-1252 correctly from 24.13.1, where `0x80` becomes "€"; the
    24.15 minimum ([R-02](#r-02)) covers that.
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
### R-10 · **Interpretation**: duplicates match on signed effect

- **Decision**: "matches on account, date, and amount" in [FR-024](spec.md#fr-024) compares the
  *signed effect* on the account: the amount together with its direction, money out or money in
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
  - **Amounts without direction** follow the wording literally, but flag a refund as a duplicate of
    its purchase.

<a id="r-11"></a>
### R-11 · **Interpretation**: vendor groups per side; an empty counterparty is no vendor

- **Decision**:
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
  1. **Zero amounts**: a zero in a signed column is proposed as an expense. FR-023 defines only
     money out and money in, and expense is the manual-entry default kind
     ([FR-014](spec.md#fr-014)).
  2. **Debit and credit cells**: a cell holds a value when it is non-empty after trimming, so
     `0,00` counts as a value. This is the literal reading of [FR-028](spec.md#fr-028).
     - Consequence: a bank that writes `0,00` into the unused column produces unparsable rows.
     - The profile preview shows this before any batch exists.
  3. **Sign inversion** applies only to a single signed column. With separate debit and credit
     columns, the column decides the direction ([User Story 2](spec.md#user-story-2) scenario 3),
     so the profile has no inversion setting in that mode.
  4. **Deleting a category while a batch is pending** also moves the pending rows assigned to it to
     their side's "Uncategorised". This extends [FR-034](spec.md#fr-034) so that confirming the
     batch can never write a reference to a deleted category.
  5. **An included duplicate** ([FR-025](spec.md#fr-025)) becomes one of the rows under review and
     joins its vendor group, keeping its own assignment.
- **Rationale**: each rule is the smallest one that keeps the spec's stated rules consistent with
  one another. Items 1 and 2 are the ones a user would notice.
- **Alternatives considered**:
  - **Zero amounts as unparsable** would contradict [FR-010](spec.md#fr-010), which allows zero.
  - **Treating `0,00` as "no value"** departs from the literal rule, and would make a genuine zero
    debit unparsable.

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
    calendar month beyond that. Empty buckets are zero.
  - **Budget month**, an **interpretation**: the calendar month that contains the period's end date
    ([FR-051](spec.md#fr-051)). It is measured over that whole month ([FR-041](spec.md#fr-041)) and
    labelled with it, so a period ending mid-month shows the full month.
  - **Budget limits**, an **interpretation**: each category has one current limit, which applies to
    whichever month is shown. A change takes effect immediately
    ([User Story 4](spec.md#user-story-4) scenario 5). v1 keeps no history of past limits, so "that
    month's limit" in FR-041 is read as the monthly limit.
  - **Charts**: `@mantine/charts`. "Unaccounted" gets an SVG hatch pattern and a legend marker, so it
    stays distinguishable whatever colour the user gives it ([FR-052](spec.md#fr-052),
    [FR-033](spec.md#fr-033)).
    - The pattern is defined in the chart's children.
    - The DonutChart's per-segment `cellProps` sets that one segment's fill to the pattern.
    - Mantine's own legend swatch cannot show a pattern, so the legend is a component of our own
      ([contracts/ui.md](contracts/ui.md#insights)).
- **Rationale**:
  - Daily points over a year are noise, and monthly points within one month collapse to a single dot.
  - Aggregating 5,000 transactions is a single pass that takes milliseconds. The 2 s of
    [SC-009](spec.md#sc-009) is therefore spent almost entirely on drawing charts of at most about
    100 points.
- **Alternatives considered**:
  - **Weekly buckets** depend on the locale's first day of the week, and add a third granularity
    for little gain.
  - **A limit history per month** is not part of the Budget entity in the spec, and the current
    limit has to take effect immediately.

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

- **Decision**: every task is done test-first (constitution VII), at four levels:

| Level | Tools | Covers |
|---|---|---|
| Domain unit | Vitest in Node, plain data | Every business rule; the bulk of the tests |
| Store integration | Vitest with `fake-indexeddb` | Atomic writes (confirmation, category deletion, restore), state surviving a reopen ([FR-022](spec.md#fr-022)), refusal paths |
| Component | Vitest with jsdom, Testing Library and user-event | Form defaults and pickers ([FR-011](spec.md#fr-011), [FR-014](spec.md#fr-014), [FR-015](spec.md#fr-015), [FR-030](spec.md#fr-030)), review interactions, where messages appear ([FR-068](spec.md#fr-068)) |
| End-to-end | Playwright on the production build, in Chromium and Firefox | One spec per user story, the network guard ([FR-061](spec.md#fr-061)), performance ([SC-009](spec.md#sc-009), [SC-010](spec.md#sc-010)), the backup round trip ([SC-014](spec.md#sc-014)) |

  - **Location**: unit, integration and component tests sit next to the code they test as
    `*.test.ts(x)`. End-to-end tests live in `e2e/`
    ([quickstart.md](quickstart.md#validation-scenarios)).
  - **Component test setup**: component tests use Mantine's documented jsdom setup. It mocks
    `matchMedia`, `ResizeObserver`, `getComputedStyle`, `scrollIntoView` and `document.fonts`, and
    renders inside `MantineProvider` with `env="test"`, which turns off transitions and portals.
    Further setup:
    - jsdom has no IndexedDB, so the setup file also imports `fake-indexeddb/auto`.
    - jest-dom 7 is imported from `@testing-library/jest-dom/vitest`.
  - **Charts**: component tests assert the aggregated data and our own legend. They do not assert
    the drawn charts, because charts draw nothing in jsdom ([R-03](#r-03)).
- **Rationale**:
  - The pure domain makes most rules testable in milliseconds without a browser.
  - Integration tests cover what only storage can break.
  - End-to-end tests prove the journeys in real browsers, including file download and upload and
    real IndexedDB, which jsdom cannot provide.
- **Alternatives considered**:
  - **Vitest browser mode for component tests** runs a real browser, but is slower and needs a
    second browser setup. jsdom suffices for form logic.
  - **Cypress**: Playwright has the needed multi-browser support, downloads and uploads built in.
  - **End-to-end tests only** give slow feedback, and constitution VII asks for a failing test per
    behaviour.

<a id="r-18"></a>
### R-18 · Continuous integration in the existing workflow

- **Decision**:
  - Fill in the existing `.github/workflows/regressiontests.yml` rather than add a new workflow.
  - The single job runs:
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
    9. the end-to-end tests.
  - On failure, the job uploads the Playwright report.
  - The workflow gains a `pull_request` trigger for `main` next to its `push` trigger.
- **Rationale**:
  - The constitution makes passing tests a condition for merging. Running the checks on pull
    requests catches a failure before it reaches `main`, not after.
  - Building on the user's file keeps one pipeline.
- **Alternatives considered**:
  - **A second workflow file** means two pipelines to keep in step.
  - **One job per check** runs in parallel, but repeats the install. One job is simpler at this
    size.

<a id="r-19"></a>
### R-19 · No request leaves the machine

- **Decision**:
  - The production build carries a Content-Security-Policy that limits scripts, styles, images,
    fonts and connections to the app's own origin. Styles also allow inline style attributes,
    which Mantine uses.
  - No web fonts and no CDN assets: the app uses the system font stack and bundled icons.
  - No analytics and no error-reporting SDK.
  - The end-to-end network guard ([R-17](#r-17)) is the regression test.
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
### R-20 · Serving, ports and later packaging

- **Decision**:
  - `npm start` builds the app and serves it with `vite preview` on port 4173.
  - The dev server uses port 5173.
  - Both ports are strict: if a port is taken, the server fails instead of moving to another.
  - Vite builds with `base: "./"`, so asset URLs are relative.
  - Both servers listen on `localhost` only, which is Vite's default.
- **Rationale**:
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
- **Rationale**:
  - At the design point of 10,000 transactions, plain rows render well within a second, and
    `content-visibility` lets the browser skip layout and painting for rows off screen.
  - v1 has no list search ([Out of Scope](spec.md#out-of-scope)), so the browser's find-in-page is
    the user's search. Rows skipped by `content-visibility` stay in the page, and find-in-page
    reaches them in Chrome, Edge and Firefox. Virtualisation removes off-screen rows from the page,
    so find-in-page would miss them.
  - JavaScript virtualisation would also complicate component tests, because jsdom has no layout,
    for a need nobody has measured.
  - Revisit if the first render passes 1 s at 10,000 rows ([quickstart.md](quickstart.md#performance)).
- **Alternatives considered**:
  - **TanStack Virtual** is proven, but it breaks find-in-page and complicates component tests.
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
