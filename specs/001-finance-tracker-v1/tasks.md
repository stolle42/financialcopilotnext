---

description: "Task list for Financial Copilot v1"
---

# Tasks: Financial Copilot v1 — Personal Finance Tracker

**Input**: Design documents from `specs/001-finance-tracker-v1/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Required. Constitution VII makes every behaviour test-first, and the
[plan](plan.md#constitution-check) applies that to every task. Each task names its test file. At the
start of a phase, write the tests of all its tasks without any code, run them and see each fail for
the expected reason. Then, task by task, write the smallest code that passes, then refactor. The red
test commits stay on the phase branch: `main` gets each finished phase as one squashed commit, so
every commit on `main` stays green.

**Organization**: Phases 1 and 2 build the shared base. Phases 3–9 follow the user stories in
priority order, and Phase 13 adds User Story 8. Each story phase ends with that story's end-to-end
journey from [quickstart.md](quickstart.md#validation-scenarios).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel with the neighbouring [P] tasks, because it touches different files
  and depends on no unfinished task. A task that installs a package changes `package.json`, so run
  only one such task at a time.
- **[Story]**: US1 … US8, the [user stories](spec.md#user-scenarios) of the spec.
- Paths are relative to the repository root ([plan.md](plan.md#project-structure)).

## Conventions for every task

- **Links, not copies** (constitution I): a task links to the rule it builds. The linked section is
  the specification, so read it before writing the test.
- **Domain results**: domain functions are pure. They take `today` and new ids as arguments, and
  return either a refusal `{ code, details? }` or a `Changes` value (T015). They never throw for an
  expected outcome ([R-05](research.md#r-05), [R-15](research.md#r-15)). Each module exports the
  union of the refusal codes it returns.
- **Invariants**: every test of a state-changing domain function also asserts that
  `checkInvariants(applyChanges(state, changes))` passes (T016,
  [data-model.md](data-model.md#invariants)).
- **Wording**: a task that adds a code also adds its wording to `src/ui/messages.ts` in the same
  commit, as the [message catalogue](contracts/ui.md#message-catalogue) describes. Success
  notifications are worded there too, and no wording lives anywhere else.
- **Placement**: field errors go under their field, form errors above the submit button, and other
  refusals in an alert ([shared patterns](contracts/ui.md#shared-patterns),
  [FR-068](spec.md#fr-068)).
- **Tests**: Vitest files sit next to their module as `*.test.ts`. Storage and store tests use
  `fake-indexeddb`, with a fresh database per test. Playwright specs import `test` and `expect` from
  `e2e/support/test.ts` (T006), so the network guard runs in every one of them.
- **Components**: add a shadcn/ui component with `npx shadcn add <name>` in the task that first
  needs it, and not before ([R-03](research.md#r-03)).
- **Done**: `npm run verify` passes (from T007 on), the task is ticked here, and the step is
  committed ([git-history rule](../../.claude/rules/git-history.md)).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: a buildable, linted, tested and continuously integrated empty app.

- [X] T001 Scaffold the Vite, React and TypeScript project at the repository root
  ([plan.md](plan.md#technical-context), [R-02](research.md#r-02), [R-20](research.md#r-20)).
  Create `package.json` (private, `"type": "module"`, `engines.node` `24.x`, and the scripts `dev`,
  `build`, `start` and `typecheck` from [plan.md](plan.md#project-structure)), `.nvmrc` holding
  `24`, `index.html` and a `src/main.tsx` that renders an empty root. Add `tsconfig.json`,
  `tsconfig.app.json` and `tsconfig.node.json`: strict, `noUncheckedIndexedAccess`, explicit
  `types`, no `baseUrl`, and `@/*` mapped to `src/*` through `paths` alone. Add `vite.config.ts`
  with `@vitejs/plugin-react`, `base: "./"`, the `@` alias, and the dev port 5173 and preview port
  4173, both with `strictPort`. Append the `.gitignore` entries from
  [plan.md](plan.md#project-structure). Install React, Vite, TypeScript `~6.0.3` and `@types/node`
  at the plan's versions, plus `@types/react` and `@types/react-dom`, and commit
  `package-lock.json`. Check: `npm run build` and `npm run typecheck` succeed, and `npm run dev`
  fails when port 5173 is taken.
- [X] T002 Add Tailwind CSS and initialise shadcn/ui on Base UI ([R-03](research.md#r-03)). Add
  `tailwindcss` with `@tailwindcss/vite` to `vite.config.ts`, then run the shadcn CLI's `init`. This
  creates `components.json`, with its aliases pointing into `src/ui/` (`@/ui/components`,
  `@/ui/components/ui`, `@/ui/lib/utils`), `src/ui/index.css` (the Tailwind entry, shadcn's base
  stylesheet, `tw-animate-css` and the theme tokens) and `src/ui/lib/utils.ts` (`cn`). Install
  `@base-ui/react` and `lucide-react`. Replace any web font the CLI adds with the system font stack
  ([R-19](research.md#r-19)), and import `src/ui/index.css` from `src/main.tsx`. Check:
  `npm run build` emits one CSS file and no font file.
- [X] T003 Configure ESLint and Prettier ([R-16](research.md#r-16), constitution VI). Write
  `eslint.config.js` as a flat config with typescript-eslint and the recommended preset of
  `eslint-plugin-react-hooks`. For `src/domain/**`, add `no-restricted-globals` for `window`,
  `document`, `navigator`, `location`, `indexedDB`, `localStorage`, `sessionStorage`, `fetch`,
  `XMLHttpRequest` and `crypto`, and a `no-restricted-syntax` ban on `Date.now()` and on `new Date()`
  without arguments, so the domain never reads the clock. Add `.prettierrc.json` and a
  `.prettierignore` covering `dist/`, `coverage/`, `test-results/`, `playwright-report/`, `specs/`,
  `.specify/` and `.claude/`. The `lint` script runs ESLint, then `prettier --check .`. Check:
  `npm run lint` passes, and a temporary `src/domain/probe.ts` calling `Date.now()` fails it.
- [X] T004 Configure dependency-cruiser as the architecture gate ([R-16](research.md#r-16)). Write
  `.dependency-cruiser.cjs` with one error rule: a module in `src/domain/` may resolve imports only
  to `src/domain/`, which also rules out npm packages. Count type-only imports
  (`tsPreCompilationDeps: true`, with `tsConfig` set to `tsconfig.app.json`), and exempt
  `src/domain/**/*.test.ts` as the importing side, because tests import Vitest. Add the
  `check:architecture` script. Check: it passes, and a temporary `src/domain/probe.ts` importing
  `react` fails it.
- [X] T005 Configure Vitest and install `fake-indexeddb` ([R-17](research.md#r-17)). Add the `test`
  section of `vite.config.ts` (Node environment, `include: ["src/**/*.test.ts"]`,
  `passWithNoTests`) and the `test` script. Check: `npm test` passes.
- [X] T006 Configure Playwright with the network guard ([R-17](research.md#r-17),
  [R-18](research.md#r-18), [R-19](research.md#r-19)).
  - `playwright.config.ts`: `testDir: "e2e"` and projects for Chromium and Firefox. `baseURL` comes
    from `BASE_URL`; without it, it is `http://localhost:4173`, served by a `webServer` that runs
    `npx vite preview`. Use the HTML reporter.
  - `e2e/support/test.ts` exports `test` and `expect`. An automatic fixture fails the test on any
    request outside the `baseURL` origin (allowing `data:` and `blob:`), and on any
    `securitypolicyviolation` event that the page reports. The file also exports
    `setToday(page, "YYYY-MM-DD")`, built on `page.clock.setFixedTime`.
  - The `test:e2e` script builds, then runs `playwright test`.
  - Test first: in `e2e/network-guard.spec.ts`, a test marked `test.fail()` opens the app and fetches
    `https://example.com`. It passes only while the guard catches the request
    ([FR-061](spec.md#fr-061)).
  - Check: `npm run test:e2e` passes in both browsers.
- [X] T007 Fill in the CI workflow `.github/workflows/regressiontests.yml`
  ([R-18](research.md#r-18)). Add triggers for `pull_request` to `main` and for `deployment_status`.
  - Job `test`, skipped for `deployment_status`: `actions/checkout@v7`; `actions/setup-node@v7` with
    `node-version-file: .nvmrc` and the npm cache; `npm ci`; lint; `check:architecture`; typecheck;
    `npm test`; build; `npx playwright install --with-deps chromium firefox`; `npx playwright test`;
    and, on failure, upload `playwright-report/` as an artifact.
  - Job `deployed`, run only for a successful `deployment_status` of the Production environment:
    `npm ci`, install the browsers, then run `npx playwright test` with `BASE_URL` set to the
    repository variable `vars.VERCEL_PRODUCTION_URL`, which is the production domain.
  - Before the tests, the `deployed` job waits until the domain serves the triggering commit
    ([R-18](research.md#r-18)). A build-only `transformIndexHtml` plugin in `vite.config.ts` writes
    `<meta name="app-commit">` (test first: `e2e/app-commit.spec.ts`), and a workflow step polls
    for it.
  - Add the `verify` script, which runs the same checks in the same order, ending with
    `npm run test:e2e`.
  - Check: `npm run verify` passes locally.
- [X] T008 (Project owner, manual) Set up Vercel as
  [quickstart.md](quickstart.md#vercel-setup) describes, including the repository variable
  `VERCEL_PRODUCTION_URL`. This makes the `deployed` job of
  `.github/workflows/regressiontests.yml` run against the production domain after every push to
  `main`, which the constitution's post-push check needs from the first story on.

**Checkpoint**: `npm run verify` is green locally and in CI.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the entity types, the storage, the store, and an app shell that starts safely. Every
story builds on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T009 [P] Define the entity types in `src/domain/types.ts` from
  [data-model.md](data-model.md#entities). The types are `Account`, `Category`, `Transaction` (a
  union on `kind`), `Budget`, `MappingProfile` (column refs as header text or position, and both
  `amount` modes), `PendingBatch`, `PendingRow` (a union on `status`, carrying the row failure codes
  of [csv-import.md](contracts/csv-import.md#unparsable-rows)) and `Settings`. Add the
  `DATE_FORMATS` and `ENCODINGS` lists of [csv-import.md](contracts/csv-import.md#date-formats), a
  `State` that holds the seven stores of the [storage layout](data-model.md#storage-layout) (with
  `pendingBatch` as `PendingBatch | null`), and the `Refusal` result type of
  [R-15](research.md#r-15). The file holds types and constants only, so `npm run typecheck` is its
  check.
- [X] T010 [P] Name keys in `src/domain/names.ts`, test-first in `src/domain/names.test.ts`:
  `nameKey(name)`, and `isNameTaken(items, name, exceptId?)` for uniqueness, as
  [R-08](research.md#r-08) defines them.
- [X] T011 [P] Calendar dates in `src/domain/dates.ts`, test-first in `src/domain/dates.test.ts`:
  `isCalendarDate(text)`, true only for a real `YYYY-MM-DD` date (so `2026-02-31` is false), and
  `monthOf(date)`, as [R-08](research.md#r-08) defines them.
- [X] T012 [P] The amount grammar in `src/domain/amounts.ts`, test-first in
  `src/domain/amounts.test.ts`. `parseAmount(text, decimalSeparator)` returns integer cents or
  `null`, exactly as [csv-import.md](contracts/csv-import.md#amount-grammar) defines, without
  floating point. Every row of the contract's example table is a test case. Add the 12-digit limit
  and a value that floating point would round wrongly, such as `0,29` becoming 29 cents.
- [X] T013 [P] Formatters in `src/ui/format.ts`, test-first in `src/ui/format.test.ts`.
  `formatAmount(cents)` and `formatDate(date)` use the two formatters of
  [shared patterns](contracts/ui.md#shared-patterns) ([FR-060](spec.md#fr-060)). `formatDate` builds
  a local date, so `2026-09-03` never shows as 2 September. `localeDecimalSeparator()` reads the
  browser locale through `Intl.NumberFormat().formatToParts`, for the amount field.
- [X] T014 [P] The hash router in `src/ui/app/router.ts`, test-first in `src/ui/app/router.test.ts`
  ([R-04](research.md#r-04)). `parseRoute(hash)` covers every route of
  [ui.md](contracts/ui.md#shell-and-navigation). `#/import/profiles/:id` carries the id, and an empty
  or unknown hash gives the Transactions route. Add `navigate(path)`, and `useRoute()` built on
  `useSyncExternalStore` and the `hashchange` event.
- [X] T015 Changes in `src/domain/changes.ts`, test-first in `src/domain/changes.test.ts`. A
  `Changes` type lists the records to put and the ids to delete, per store of `State`.
  `applyChanges(state, changes)` returns a new state and leaves its input untouched. Both the store
  (T019) and the domain tests use it. Depends on T009.
- [X] T016 State invariants in `src/domain/invariants.ts`, test-first in
  `src/domain/invariants.test.ts`. `checkInvariants(state)` returns ok, or the first broken
  invariant of [data-model.md](data-model.md#invariants) as a code with details that name the record,
  for example `transaction-account-missing` with the transaction id. The backup restore uses this to
  name the broken rule ([backup-file.md](contracts/backup-file.md#loading-fr-071-fr-072)). The tests
  have one failing state for each of invariants 1–8. Depends on T009–T011.
- [X] T017 First-launch data in `src/domain/seed.ts`, test-first in `src/domain/seed.test.ts`.
  `seedState(newId)` returns the [seed data](data-model.md#seed-data): the account "Cash", the
  settings, and all 16 categories with their colours and roles ([FR-006](spec.md#fr-006),
  [FR-031](spec.md#fr-031)). The test checks the table row by row and runs `checkInvariants`.
  Depends on T016.
- [X] T018 IndexedDB storage in `src/persistence/db.ts`, test-first in `src/persistence/db.test.ts`
  against `fake-indexeddb` ([R-06](research.md#r-06), [storage layout](data-model.md#storage-layout)).
  Install `idb`.
  - `openDatabase()` creates `financial-copilot` version 1 with the seven stores, and writes
    `seedState` inside the upgrade transaction.
  - `loadState(db)` reads every store into a `State`.
  - `writeChanges(db, changes)` writes in one read-write transaction over every store the changes
    touch. It resolves only when the transaction completes, and rejects with the original error
    `name`.
  - Tests: the first open seeds and a second open does not; loading returns what was written; and a
    write in which one record fails leaves every store unchanged.
  - Depends on T015, T017.
- [X] T019 The store in `src/store/store.ts`, test-first in `src/store/store.test.ts` against
  `fake-indexeddb` ([R-05](research.md#r-05), [R-15](research.md#r-15)).
  - `createStore(db, state)` provides `getState`, `subscribe` and `run(decide)`.
  - `run` calls `decide(state, { today, newId })`. `today` comes from `todayLocal()` in
    `src/store/clock.ts`, which returns the local date rather than the UTC one and has its own test in
    `src/store/clock.test.ts`. `newId` comes from `crypto.randomUUID`.
  - A refusal comes back unchanged. Otherwise `run` writes the changes with `writeChanges`, only then
    applies them with `applyChanges`, and notifies subscribers. A failed write returns `save-failed`
    and leaves the state untouched.
  - Add the hook `useStore(selector)`, built on `useSyncExternalStore`.
  - Tests: a refusal writes nothing; a success is in memory and survives reopening the database; a
    failing write, for example after closing the database, gives `save-failed` and leaves the state
    unchanged.
  - Depends on T018.
- [X] T020 The message catalogue in `src/ui/messages.ts`, test-first in `src/ui/messages.test.ts`
  ([R-15](research.md#r-15), [message catalogue](contracts/ui.md#message-catalogue)). `MessageCode`
  is the union of the code types the layers export, and the wording lookup is typed
  `Record<MessageCode, …>`, so a missing wording fails the type check. Start with `save-failed`,
  `storage-unavailable`, `open-in-another-tab` and `unexpected-error`. The test checks that every
  message is plain language: it is not empty and does not contain its own code
  ([FR-067](spec.md#fr-067)). Depends on T019.
- [X] T021 The app shell in `src/ui/app/App.tsx`, test-first in `e2e/ui/shell.spec.ts`
  ([ui.md](contracts/ui.md#shell-and-navigation), [R-19](research.md#r-19)).
  - The header shows the app name. The sidebar is one flat list, in the order of
    [ui.md](contracts/ui.md#shell-and-navigation), and each screen's entry is added by the task that
    builds that screen. The route outlet shows a placeholder at `#/`
    until T032 (`npx shadcn add button`).
  - Wrap everything in Base UI's `CSPProvider` with style elements disabled.
  - Mount the notification region, which is shadcn's toast on Base UI (`npx shadcn add toast`). US2,
    US5 and US7 use it.
  - Inject the Content-Security-Policy meta tag of [R-19](research.md#r-19) into the production
    build only, alongside the commit tag from T007 in `vite.config.ts`.
  - Tests: the app opens on `#/` showing its name, the built page carries the policy, and the guard
    sees no violation.
  - Depends on T014, T020.
- [X] T022 Start-up in `src/main.tsx`, test-first in `e2e/ui/startup.spec.ts`
  ([R-07](research.md#r-07), [R-15](research.md#r-15)).
  - Hold a Web Lock for as long as the page runs (`navigator.locks.request` with `ifAvailable`).
    Without the lock, show `open-in-another-tab` and open no storage.
  - Request persistent storage with `navigator.storage.persist()`, treating a rejection as not
    granted, and pass the result to the shell for the Backup screen (T075).
  - Open the storage. A synchronous throw and a rejected open both show `storage-unavailable` on its
    own screen. Then load the state, create the store and render the shell.
  - Tests: a second page in the same context shows `open-in-another-tab`, and a page whose
    `indexedDB.open` throws `SecurityError` (set up with `page.addInitScript`) shows
    `storage-unavailable`.
  - Depends on T019, T021.
- [X] T023 Unexpected errors in `src/ui/app/ErrorBoundary.tsx` and `src/main.tsx`, test-first in
  `e2e/ui/startup.spec.ts` ([R-15](research.md#r-15)). An error boundary around the shell, plus
  handlers for `error` and `unhandledrejection`, show `unexpected-error` with a Reload button and log
  the details to the console. Test: an unhandled rejection scheduled after load by
  `page.addInitScript` shows the message and its Reload button. Depends on T022.

**Checkpoint**: the app starts, seeds its data once, refuses a second tab, and passes
`npm run verify`.

---

## Phase 3: User Story 1 - Keep a trustworthy ledger by hand (Priority: P1) 🎯 MVP

**Goal**: accounts with computed balances, and fast manual entry of expenses, incomes and
transfers ([User Story 1](spec.md#user-story-1)).

**Independent Test**: the story's [Independent Test](spec.md#user-story-1), automated as
`e2e/us1-ledger.spec.ts` (T033).

- [X] T024 [P] [US1] Account rules in `src/domain/accounts.ts`, test-first in
  `src/domain/accounts.test.ts`.
  - `signedEffect(transaction, accountId)` follows [derived values](data-model.md#derived-values),
    and `accountBalance(state, accountId)` follows [FR-002](spec.md#fr-002).
  - `createAccount(state, input, ctx)` and `updateAccount(state, id, input)` refuse
    `account-name-empty` and `account-name-taken` (by name key, [FR-001](spec.md#fr-001),
    [R-08](research.md#r-08)), or return changes. The opening balance is in cents, of any sign.
  - `sortAccounts(accounts)` follows the [list order](contracts/ui.md#shared-patterns).
  - Tests include the balances of [User Story 1](spec.md#user-story-1) scenarios 2–4 and 10, and a
    transaction moved to another account changing both balances ([edge cases](spec.md#edge-cases)).
- [X] T025 [P] [US1] Category lookups in `src/domain/categories.ts`, test-first in
  `src/domain/categories.test.ts`. `protectedCategory(categories, side, role)` finds a category by
  role, never by name ([data-model.md](data-model.md#category)). `sortCategories(categories, side)`
  returns the side's set in the [list order](contracts/ui.md#shared-patterns), and
  `pickerCategories(categories, side)` returns the same without "Unaccounted"
  ([FR-030](spec.md#fr-030)).
- [X] T026 [US1] Form drafts and kind changes in `src/domain/transactions.ts`, test-first in
  `src/domain/transactions.test.ts`. A draft holds the amount as cents, or `null` when the text does
  not parse.
  - `newDraft(state, today)` has the defaults of [FR-014](spec.md#fr-014) and the default account of
    [FR-006](spec.md#fr-006).
  - `changeKind(draft, kind, categories)` follows [FR-015](spec.md#fr-015).
  - `changeAccount(draft, accountId)` clears a destination that equals the new account
    ([transaction form](contracts/ui.md#transaction-form)).
  - Depends on T025.
- [X] T027 [US1] Saving and deleting transactions in `src/domain/transactions.ts`, test-first in
  `src/domain/transactions.test.ts`.
  - `saveDraft(state, draft, ctx)` validates by [FR-010](spec.md#fr-010) and
    [FR-011](spec.md#fr-011). It returns field-keyed codes: `amount-invalid`, `date-invalid`,
    `transfer-destination-missing` and `transfer-needs-second-account`.
  - It refuses a category from the wrong side, and refuses "Unaccounted" unless the edited
    transaction already holds it ([data-model.md](data-model.md#transaction)). Use a code of its own
    for this: the form never offers such a category, so the refusal guards the rule and does not
    reach the user.
  - A new transaction gets the next `seq` and sets `settings.manualEntryAccountId`. An edit changes
    neither ([state transitions](data-model.md#state-transitions)).
  - Add `deleteTransaction(state, id)`.
  - Depends on T024, T026.
- [X] T028 [US1] List order and filters in `src/domain/transactions.ts`, test-first in
  `src/domain/transactions.test.ts`. `listTransactions(transactions, filters)` sorts newest first,
  with `seq` breaking ties between equal dates. It filters by account, including transfers into that
  account, and by category ([FR-016](spec.md#fr-016), [data-model.md](data-model.md#transaction)).
- [X] T029 [US1] Account and transaction actions in `src/store/accounts.ts` and
  `src/store/transactions.ts`, test-first in `src/store/accounts.test.ts` and
  `src/store/transactions.test.ts`. Each action is a thin wrapper that passes a function from T024 or
  T027 to `run`. Tests: a new account and a saved transaction survive reopening the database,
  including `settings.manualEntryAccountId`, and a refusal writes nothing. Depends on T019, T024,
  T027.
- [X] T030 [US1] The Accounts screen in `src/ui/screens/accounts/AccountsScreen.tsx` and
  `src/ui/screens/accounts/AccountDialog.tsx`, test-first in `e2e/ui/accounts.spec.ts`
  ([ui.md](contracts/ui.md#accounts), without Reconcile, which comes in T065).
  - Add the route `#/accounts`, with its sidebar entry. List each account with its
    computed balance, and add the New and Edit dialogs.
  - Build the shared `src/ui/components/AmountField.tsx`
    ([shared patterns](contracts/ui.md#shared-patterns)): it uses `localeDecimalSeparator` and
    `parseAmount`, selects its content on focus, and accepts negative values only when allowed.
  - Build the shared `src/ui/components/ConfirmDialog.tsx` with a danger style, and use it for a
    changed opening balance ([FR-001](spec.md#fr-001)).
  - Add `account-name-empty`, `account-name-taken` and `balance-invalid` to `src/ui/messages.ts`.
  - Tests: [User Story 1](spec.md#user-story-1) scenarios 1, 2, 10 and 11; the duplicate-name
    refusal; a negative opening balance; and cancelling the warning, which keeps the old balance.
- [X] T031 [US1] The transaction form in `src/ui/screens/transactions/TransactionForm.tsx`,
  test-first in `e2e/ui/transaction-form.spec.ts` ([transaction form](contracts/ui.md#transaction-form)).
  - The form is a modal, opened from every screen by **Add transaction** in the header
    ([FR-066](spec.md#fr-066)). Its fields come in the contract's order. Focus and Enter work as
    [SC-002](spec.md#sc-002) needs.
  - Build the shared `src/ui/components/CategoryChip.tsx` and
    `src/ui/components/CategorySelect.tsx`. The select offers one side's options with swatches, with
    no empty option and no "Unaccounted". Through Base UI's value render function, it shows a current
    value even when that value is not an option.
  - Add the destination select. Kind and account changes go through T026.
  - Add `amount-invalid`, `date-invalid`, `transfer-destination-missing` and
    `transfer-needs-second-account` (with its link to Accounts) to `src/ui/messages.ts`.
  - Tests: [User Story 1](spec.md#user-story-1) scenarios 5–9; every kind change of
    [FR-015](spec.md#fr-015); the destination rules of [FR-011](spec.md#fr-011); and each validation
    message beside its field.
- [X] T032 [US1] The Transactions screen in `src/ui/screens/transactions/TransactionsScreen.tsx`,
  replacing the placeholder at `#/`, test-first in `e2e/ui/transactions.spec.ts`
  ([ui.md](contracts/ui.md#transactions), [FR-016](spec.md#fr-016), [FR-063](spec.md#fr-063)).
  - Add the screen's sidebar entry, first in the list.
  - Render rows as plain elements with `content-visibility: auto`, from a memoised filtered list
    ([R-21](research.md#r-21)), with each kind styled as the contract describes.
  - Add the account filter, the category filter with its side switch, and Clear filters.
  - Add both empty states. The Import action arrives with T048.
  - Selecting a row opens the form in edit mode, which gains Delete behind `ConfirmDialog`.
  - Tests: the order, including ties; each filter, including transfers into an account; both empty
    states; editing; and deleting.
- [X] T033 [US1] The journey `e2e/us1-ledger.spec.ts`, as [quickstart.md](quickstart.md#us1-ledger)
  describes. It runs scenarios 1–12 in one fresh context. After every step, it checks that each
  balance on Accounts equals the opening balance plus the net of the listed transactions
  ([SC-005](spec.md#sc-005)).

**Checkpoint**: the MVP. A usable cash book that passes `npm run verify`. Push to `main` and run the
[post-push check](quickstart.md#after-pushing-to-main).

---

## Phase 4: User Story 2 - Import a bank CSV and review it by vendor (Priority: P2)

**Goal**: a bank file becomes a pending batch, which is reviewed by vendor and confirmed into the
ledger without duplicates ([User Story 2](spec.md#user-story-2)).

**Independent Test**: the story's [Independent Test](spec.md#user-story-2), automated as
`e2e/us2-import.spec.ts` (T052).

- [X] T034 [P] [US2] Profile rules in `src/domain/import/profiles.ts`, test-first in
  `src/domain/import/profiles.test.ts`. `saveProfile(state, profile, ctx)` refuses
  `profile-name-empty`, `profile-name-taken`, and `profile-columns-incomplete` with the unassigned
  roles among date, amount and description ([FR-021](spec.md#fr-021),
  [mapping profile](data-model.md#mapping-profile)). Add `deleteProfile(state, id)`. Tests include
  that neither function touches a pending batch.
- [X] T035 [P] [US2] Bank dates in `src/domain/import/dates.ts`, test-first in
  `src/domain/import/dates.test.ts`. `parseBankDate(text, format)` returns `YYYY-MM-DD` or `null` for
  every format of [csv-import.md](contracts/csv-import.md#date-formats). Test one- and two-digit days
  and months, `YY` read as 20YY, impossible dates, and extra text.
- [X] T036 [P] [US2] Amount direction in `src/domain/import/direction.ts`, test-first in
  `src/domain/import/direction.test.ts`. `readAmount(cells, amountMapping, decimalSeparator)` returns
  signed cents or a failure code. It follows [direction](contracts/csv-import.md#direction) step by
  step for both modes, applies sign inversion in signed mode only, and returns zero as 0, which is
  then proposed as an expense ([R-12](research.md#r-12)).
- [X] T037 [P] [US2] CSV decoding and tokenising in `src/files/csv.ts`, test-first in
  `src/files/csv.test.ts` ([R-09](research.md#r-09), [pipeline](contracts/csv-import.md#pipeline)
  steps 2–3, [encodings](contracts/csv-import.md#encodings)). Install Papa Parse and
  `@types/papaparse`.
  - `decodeFile(bytes, encoding)` uses `TextDecoder` with `fatal: true` and returns the text or
    `import-decoding-failed`.
  - `tokenise(text)` passes the four delimiters as `delimitersToGuess` and keeps blank lines, so the
    domain can skip empty records without losing row numbers.
  - Tests start from byte arrays: `0x80` is "€" in Windows-1252 and `0xA4` is "€" in ISO-8859-15;
    UTF-8 and UTF-16LE with a byte-order mark; invalid UTF-8 refused; each delimiter; and quoted cells
    holding a delimiter, a line break or a doubled quote.
- [X] T038 [P] [US2] Duplicate flags in `src/domain/import/duplicates.ts`, test-first in
  `src/domain/import/duplicates.test.ts`. `flagDuplicates(rows, accountId, transactions)` follows
  [duplicate matching](contracts/csv-import.md#duplicate-matching), using a hash of account, date
  and signed effect and reusing `signedEffect` from T024 ([FR-024](spec.md#fr-024)). Tests: every case
  of [R-10](research.md#r-10); a purchase and its same-day refund, which are not flagged; different
  descriptions, which are still flagged; and unparsable rows, which are ignored.
- [X] T039 [P] [US2] Vendor groups in `src/domain/import/groups.ts`, test-first in
  `src/domain/import/groups.test.ts`. `reviewView(batch)` returns:
  - the three counts;
  - the duplicate rows and the unparsable rows;
  - the vendor groups formed over the rows under review, each with its key, side, first counterparty,
    count and total, largest first;
  - the plain rows, by date.

  It follows [FR-026](spec.md#fr-026), [vendor groups](contracts/csv-import.md#vendor-groups) and
  [review](contracts/ui.md#review). Tests: [User Story 2](spec.md#user-story-2) scenarios 4, 6 and
  16; case and whitespace in counterparties; and an included duplicate joining its group
  ([R-12](research.md#r-12) item 5).
- [X] T040 [P] [US2] Bank file fixtures in `e2e/fixtures/`, one per row of the
  [quickstart table](quickstart.md#us2-csv-import). Add a `.gitattributes` entry that marks
  `e2e/fixtures/*.csv` as binary, so the bytes and line endings survive every checkout. Write
  `mybank-2026-08.csv` as Windows-1252 bytes, for example with a short `node -e` script using
  `Buffer`, with at least one `0x80` "€" and one umlaut. Each file holds only the rows its exercise
  needs.
- [X] T041 [P] [US2] Record parsing in `src/domain/import/rows.ts`, test-first in
  `src/domain/import/rows.test.ts`. `parseRecords(records, profile)` covers
  [pipeline](contracts/csv-import.md#pipeline) steps 3–6 and [cells](contracts/csv-import.md#cells):
  - it skips empty records but keeps their row numbers ([pending row](data-model.md#pending-row));
  - the header check refuses `import-missing-columns`, naming every missing column, and
    `import-duplicate-header`;
  - a file with no data records gives `import-no-transactions`;
  - short records have their missing cells treated as empty;
  - each record becomes a parsed or an unparsable row, reporting the first failure in the order of
    [unparsable rows](contracts/csv-import.md#unparsable-rows).

  The profile preview (T047) uses this same function. Tests: [User Story 2](spec.md#user-story-2)
  scenarios 3, 11, 13 and 14; a header-only file; and "no header row" positions. Depends on T035,
  T036.
- [X] T042 [P] [US2] Review edits in `src/domain/import/review.ts`, test-first in
  `src/domain/import/review.test.ts`. `assignRow`, `assignGroup` (every row currently in the group)
  and `includeDuplicate` (flagged rows only) each return changes to the batch.
  - A category must belong to the row's side and must not be "Unaccounted".
  - A transfer's counter-account must exist and differ from the batch account.
  - Turning the transfer off restores the side's "Uncategorised".

  This follows [FR-023](spec.md#fr-023), [FR-025](spec.md#fr-025), [FR-026](spec.md#fr-026) and
  [review](contracts/ui.md#review). Tests: scenarios 4, 5 and 7. Depends on T039.
- [X] T043 [P] [US2] Confirm and discard in `src/domain/import/confirm.ts`, test-first in
  `src/domain/import/confirm.test.ts`.
  - `confirmBatch(state, ctx)` turns each row under review into a transaction by the
    [confirmation table](data-model.md#state-transitions), with absolute amounts and consecutive
    `seq` values in file order. It removes the batch, leaves `settings` alone
    ([FR-006](spec.md#fr-006), [FR-027](spec.md#fr-027)), and reports the count.
  - `discardBatch(state)` removes the batch only.
  - Tests: scenarios 7, 9 and 10; a transfer in each direction; and excluded duplicates and
    unparsable rows, which are left out.
- [X] T044 [P] [US2] The pending-batch guard in `src/persistence/db.ts`, test-first in
  `src/persistence/db.test.ts`. `writeChanges` accepts a `requireNoPendingBatch` option. It re-checks
  inside the same transaction, and aborts with `import-batch-pending` when a batch exists
  ([pipeline](contracts/csv-import.md#pipeline) step 8, [R-06](research.md#r-06)).
- [X] T045 [US2] Batch creation in `src/domain/import/batch.ts`, test-first in
  `src/domain/import/batch.test.ts`.
  - `canStartImport(state)` refuses `import-batch-pending` ([FR-022](spec.md#fr-022)).
  - `createBatch(state, { accountId, profile, fileName, createdAt, records }, ctx)` refuses
    `import-account-missing` and the layout refusals of T041. Otherwise it returns changes that hold
    a batch whose parsed rows carry their duplicate flag, `included = !duplicate`, and the side's
    "Uncategorised" ([pending row](data-model.md#pending-row), [FR-029](spec.md#fr-029)).
  - Depends on T038, T041.
- [X] T046 [US2] Import actions in `src/store/import.ts`, test-first in `src/store/import.test.ts`.
  - Actions: `saveProfile` and `deleteProfile`; `importFile({ accountId, profile, fileName, bytes })`,
    which runs `canStartImport` before decoding, then `decodeFile`, `tokenise` and `createBatch`, and
    writes with the guard of T044 (`run` passes the option through); the review edits of T042, each
    written at once ([R-05](research.md#r-05)); `confirmBatch`; and `discardBatch`.
  - Tests: a batch keeps its review progress across reopening the database
    ([FR-022](spec.md#fr-022)); a second import is refused; a failing confirmation leaves both the
    ledger and the batch unchanged; and editing or deleting the profile leaves the batch unchanged
    ([FR-021](spec.md#fr-021)).
  - Depends on T037, T042–T045.
- [X] T047 [US2] The profile editor in `src/ui/screens/import/ProfileEditor.tsx` and
  `src/ui/screens/import/ProfilePreview.tsx`, test-first in `e2e/ui/profile-editor.spec.ts`
  ([profile editor](contracts/ui.md#profile-editor), [preview](contracts/csv-import.md#preview)).
  - Add the routes `#/import/profiles/new` and `#/import/profiles/:id`.
  - The header switch is on by default, and switching it resets the column refs to the other
    variant. Add the amount mode, and column selects that list header texts, or "Column 1…n" with a
    sample value.
  - The preview shows the first 10 data records through `decodeFile`, `tokenise` and `parseRecords`.
    It refreshes on every change and shows each failure reason. When no import is in progress, a
    sample-file picker supplies the file.
  - Save refuses with `profile-name-empty`, `profile-name-taken` or `profile-columns-incomplete`.
    Add those codes, and wording for every row failure code of
    [unparsable rows](contracts/csv-import.md#unparsable-rows), to `src/ui/messages.ts`.
  - Tests: a `,`-decimal file previewed with a `.` profile shows unparsable amounts; each refusal
    appears in its place; and a saved profile can be edited.
- [X] T048 [US2] The Import screen in `src/ui/screens/import/ImportScreen.tsx`, test-first in
  `e2e/ui/import.spec.ts` ([import](contracts/ui.md#import), [outcomes](contracts/csv-import.md#outcomes)).
  - Add the route `#/import` and its sidebar entry.
  - Add the account select, with no default; the file picker or drop zone; and the profile select,
    with **Create new profile** and the preselect for a single profile.
  - **Import** creates the batch and opens `#/import/review`. A new profile saved from the editor
    continues the import, with the chosen account and file kept in memory in the meantime.
  - With a batch pending, show the pending card with Review and Discard. A file chosen then is
    refused, with **Open pending batch**.
  - Add the profile list with Edit and Delete. The delete confirmation says that the pending batch
    is not affected.
  - Add `import-account-missing`, `import-batch-pending`, `import-file-unreadable`,
    `import-decoding-failed`, `import-missing-columns`, `import-duplicate-header` and
    `import-no-transactions` to `src/ui/messages.ts`. Add **Import a CSV** to the empty Transactions
    screen.
  - Tests: [User Story 2](spec.md#user-story-2) scenarios 1, 2, 13 and 15; the header-only file; the
    Windows-1252 fixture read with a UTF-8 profile; and deleting a profile while a batch is pending.
- [X] T049 [US2] The review header and drawers in `src/ui/screens/import/ReviewScreen.tsx`,
  test-first in `e2e/ui/review.spec.ts` ([review](contracts/ui.md#review)).
  - Add the route `#/import/review`. With no batch pending, it shows an empty state that leads to
    Import.
  - The header shows the account, the file and the three counts.
  - The duplicates drawer has an **Include** switch on each row. The unparsable drawer shows the row
    number, the raw cells and the reason (`npx shadcn add sheet`).
  - Tests: [User Story 2](spec.md#user-story-2) scenarios 8 and 11.
- [X] T050 [US2] Review groups and assignments in `src/ui/screens/import/ReviewGroups.tsx` and
  `src/ui/screens/import/AssignmentControl.tsx`, test-first in `e2e/ui/review.spec.ts`.
  - Show the collapsed groups, largest first, then the plain rows.
  - A group header shows the vendor, side, count and total, with the group's assignment control.
    Unfolding a group shows one control per row.
  - The control reuses `CategorySelect` and adds a **Transfer** switch with a counter-account select.
  - Every change is saved at once.
  - Tests: scenarios 4–7 and 16, and assignments surviving a reload ([FR-022](spec.md#fr-022)).
- [X] T051 [US2] The review footer in `src/ui/screens/import/ReviewScreen.tsx`, test-first in
  `e2e/ui/review.spec.ts`. **Discard** asks for confirmation. **Confirm N transactions** opens a modal
  that states N ([FR-027](spec.md#fr-027)). Once confirmed, a notification reports what was added and
  Transactions opens. Add the notification's wording to `src/ui/messages.ts`. Tests: scenarios 9
  and 10.
- [X] T052 [US2] The journey `e2e/us2-import.spec.ts`, as
  [quickstart.md](quickstart.md#us2-csv-import) describes. It runs scenarios 1–16 with the fixtures
  of T040. It also checks that re-importing August after confirming it adds zero transactions with
  the review defaults ([SC-003](spec.md#sc-003)), and that a pending batch keeps its review progress
  across a reload.

**Checkpoint**: bank data reaches the ledger without duplicates, and the profile is saved for next
time. Push and run the post-push check.

---

## Phase 5: User Story 3 - See where the money went over a chosen period (Priority: P3)

**Goal**: Insights shows spending over time and both category breakdowns, with "Unaccounted"
visible ([User Story 3](spec.md#user-story-3)).

**Independent Test**: the story's [Independent Test](spec.md#user-story-3), automated as
`e2e/us3-insights.spec.ts` (T057, completed by T067).

- [X] T053 [US3] Periods in `src/domain/dates.ts`, test-first in `src/domain/dates.test.ts`.
  `periodPreset(name, today)` covers the five presets of [insights](contracts/ui.md#insights).
  `daysInPeriod(period)` counts both ends ([R-14](research.md#r-14)). Add the month helpers that the
  spending line needs. Tests run across month ends, year ends and leap days.
- [X] T054 [US3] Insights aggregates in `src/domain/insights.ts`, test-first in
  `src/domain/insights.test.ts` ([R-14](research.md#r-14), [FR-051](spec.md#fr-051),
  [FR-052](spec.md#fr-052)). `insights(state, period)` returns:
  - the spending line: one point per day up to 92 days, otherwise one per month, with empty buckets
    as zero;
  - an expense breakdown and an income breakdown: amount and share per category, sorted by amount,
    with the side's total, and "Unaccounted" (found by role) marked as unknown.

  Tests: [User Story 3](spec.md#user-story-3) scenarios 1–6, and an added transfer that changes no
  figure ([FR-012](spec.md#fr-012), [SC-004](spec.md#sc-004)). Depends on T053.
- [X] T055 [US3] The Insights period and spending line in
  `src/ui/screens/insights/InsightsScreen.tsx`, `src/ui/screens/insights/PeriodPicker.tsx` and
  `src/ui/screens/insights/SpendingChart.tsx`, test-first in `e2e/ui/insights.spec.ts`
  ([insights](contracts/ui.md#insights)).
  - Add the route `#/insights` and its sidebar entry.
  - The period picker has the preset buttons and two native date inputs, and defaults to This month
    ([FR-050](spec.md#fr-050)).
  - Run `npx shadcn add chart`, which brings Recharts and `react-is`. Then change our copy in
    `src/ui/components/ui/chart.tsx` to set its colour variables through React style props instead
    of a `<style>` element ([R-19](research.md#r-19)).
  - The line has euro tooltips and no click-through ([FR-053](spec.md#fr-053)), and the section has
    its own empty state.
  - Tests, using `setToday`: the default period; the dates of each preset; the empty state; and no
    CSP violation while the chart draws.
- [X] T056 [US3] The category breakdowns in `src/ui/screens/insights/CategoryBreakdown.tsx`,
  test-first in `e2e/ui/insights.spec.ts`. Each side gets a donut with our own legend of chip, amount
  and share, titled with the side's total. "Unaccounted" is filled with an SVG hatch pattern from the
  chart's `<defs>` and marked "unknown" in the legend ([R-14](research.md#r-14),
  [FR-052](spec.md#fr-052)). Each section has its own empty state. Tests: legend order and totals,
  "Uncategorised" as its own entry, and the empty states ([User Story 3](spec.md#user-story-3)
  scenarios 5 and 6).
- [X] T057 [US3] The journey `e2e/us3-insights.spec.ts`. With `setToday`, it enters about three
  months of expenses, incomes and transfers through the transaction form. It then checks scenarios
  1, 2, 5, 6 and 7 against the sums of the entered amounts, and checks that recording one more
  transfer changes no total ([SC-004](spec.md#sc-004)). Scenarios 3 and 4 need reconciliation
  entries, so T067 adds them. This journey enters its data through the UI rather than restoring the
  backup that [quickstart.md](quickstart.md#us3-insights) names, because restore only arrives with
  US7.

**Checkpoint**: Insights reflects exactly the period's non-transfer transactions. Push and run the
post-push check.

---

## Phase 6: User Story 4 - Plan spending with monthly budgets (Priority: P4)

**Goal**: monthly limits on expense categories, with progress and an over-limit state in Insights
([User Story 4](spec.md#user-story-4)).

**Independent Test**: the story's [Independent Test](spec.md#user-story-4), automated as
`e2e/us4-budgets.spec.ts` (T062).

- [X] T058 [US4] Budget rules in `src/domain/budgets.ts`, test-first in
  `src/domain/budgets.test.ts`.
  - `budgetableCategories(categories)` follows [FR-040](spec.md#fr-040).
  - `setLimit(state, categoryId, limitCents)` refuses `budget-limit-invalid` for a missing or
    non-positive limit. A category that cannot carry a budget is refused with a code of its own,
    which the UI never reaches. Add `removeLimit`.
  - `budgetMonth(period)` is the month that contains the period's end date.
  - `budgetProgress(state, month)` gives spent, limit and over-limit for each budgeted category
    ([FR-041](spec.md#fr-041), [FR-042](spec.md#fr-042), [R-14](research.md#r-14)).
  - Tests: [User Story 4](spec.md#user-story-4) scenarios 1–6; a changed limit applying to past
    months; and transfers left out ([SC-004](spec.md#sc-004)).
- [X] T059 [US4] Budget actions in `src/store/budgets.ts`, test-first in `src/store/budgets.test.ts`:
  `setLimit` and `removeLimit`, through `run`. Test: both survive reopening the database.
- [X] T060 [P] [US4] The Budgets screen in `src/ui/screens/budgets/BudgetsScreen.tsx`, test-first in
  `e2e/ui/budgets.spec.ts` ([budgets](contracts/ui.md#budgets)). Add the route `#/budgets` and its
  sidebar entry. Each budgetable category gets a row with its chip, an `AmountField` limit saved on
  Enter or on blur, and **Remove** once a limit is set. Add `budget-limit-invalid` to
  `src/ui/messages.ts`. Tests: [User Story 4](spec.md#user-story-4) scenario 4 (income and protected
  categories are absent); saving both ways; 0.00 refused under the field; and Remove.
- [X] T061 [P] [US4] The budget section of Insights in `src/ui/screens/insights/BudgetSection.tsx`,
  test-first in `e2e/ui/insights.spec.ts` (section 3 of [insights](contracts/ui.md#insights)). It
  shows one bar per budgeted category for `budgetMonth(period)`, labelled with that month. An
  over-limit bar uses the danger colour, an alert icon, the label "Over limit" and a
  `data-state="over-limit"` attribute for tests ([SC-011](spec.md#sc-011)). With no budgets, the
  section links to Budgets. Tests: the month label for a three-month period, the over-limit marker,
  and the empty state.
- [X] T062 [US4] The journey `e2e/us4-budgets.spec.ts`, as
  [quickstart.md](quickstart.md#us4-budgets) describes. It runs scenarios 1–6, moving `setToday` from
  September to October for scenario 3. It asserts the over-limit state by its marker alone
  ([SC-011](spec.md#sc-011)), and checks that a transfer leaves budget progress unchanged
  ([SC-004](spec.md#sc-004)).

**Checkpoint**: budgets show and reset monthly. Push and run the post-push check.

---

## Phase 7: User Story 5 - Reconcile an account to reality (Priority: P5)

**Goal**: stating an account's real balance books the difference to "Unaccounted"
([User Story 5](spec.md#user-story-5)).

**Independent Test**: the story's [Independent Test](spec.md#user-story-5), automated as
`e2e/us5-reconcile.spec.ts` (T066).

- [X] T063 [US5] Reconciliation in `src/domain/accounts.ts`, test-first in
  `src/domain/accounts.test.ts`. `reconcile(state, accountId, statedCents, ctx)` follows
  [FR-005](spec.md#fr-005). It finds the side's "Unaccounted" by role, dates the entry `today`,
  leaves `settings` unchanged ([FR-006](spec.md#fr-006)), and refuses `reconcile-already-matches`.
  Tests: [User Story 5](spec.md#user-story-5) scenarios 1–4, and negative balances.
- [X] T064 [US5] The reconcile action in `src/store/accounts.ts`, test-first in
  `src/store/accounts.test.ts`: `reconcile`, through `run`. Test: the booked transaction survives
  reopening the database.
- [X] T065 [US5] The reconcile dialog in `src/ui/screens/accounts/ReconcileDialog.tsx`, with a
  **Reconcile** action on every row of `src/ui/screens/accounts/AccountsScreen.tsx`, test-first in
  `e2e/ui/accounts.spec.ts` ([accounts](contracts/ui.md#accounts)).
  - The dialog's `AmountField` allows negative amounts.
  - A booked difference shows a notification such as "Booked an expense of €15.00 to Unaccounted". A
    matching balance shows `reconcile-already-matches` in the dialog. Add both wordings to
    `src/ui/messages.ts`.
  - Also extend `e2e/ui/transaction-form.spec.ts`: editing a reconciliation entry shows
    "Unaccounted" as the value, never as an option, and saves
    ([transaction form](contracts/ui.md#transaction-form)).
- [X] T066 [P] [US5] The journey `e2e/us5-reconcile.spec.ts`, as
  [quickstart.md](quickstart.md#us5-reconcile) describes: scenarios 1–4.
- [X] T067 [P] [US5] "Unaccounted" in Insights, added to `e2e/us3-insights.spec.ts`. These are
  [User Story 3](spec.md#user-story-3) scenarios 3 and 4, which become testable once reconciliation
  exists. Reconcile one account down and another up through Accounts. Then check that each
  "Unaccounted" entry appears in its side's breakdown with the hatched fill, the "unknown" marker and
  its true share ([FR-052](spec.md#fr-052)).

**Checkpoint**: balances can be made honest again on any account. Push and run the post-push check.

---

## Phase 8: User Story 6 - Organise categories (Priority: P6)

**Goal**: create, rename, recolour and delete categories, with the protected ones kept
([User Story 6](spec.md#user-story-6)).

**Independent Test**: the story's [Independent Test](spec.md#user-story-6), automated as
`e2e/us6-categories.spec.ts` (T071).

- [X] T068 [US6] Category management in `src/domain/categories.ts`, test-first in
  `src/domain/categories.test.ts`.
  - `createCategory`, `renameCategory` and `recolourCategory` refuse `category-name-empty`, and
    `category-name-taken` within a side ([FR-032](spec.md#fr-032)). Colours are `#rrggbb`.
  - `deletionImpact(state, id)` gives the transaction count and whether a budget is removed.
  - `deleteCategory(state, id)` refuses `category-protected` ([FR-033](spec.md#fr-033)). Otherwise it
    moves the category's transactions and pending rows to the side's "Uncategorised" and removes its
    budget ([FR-034](spec.md#fr-034), [state transitions](data-model.md#state-transitions),
    [R-12](research.md#r-12) item 4).
  - Tests: [User Story 6](spec.md#user-story-6) scenarios 3–5, and renaming a protected category.
- [X] T069 [US6] Category actions in `src/store/categories.ts`, test-first in
  `src/store/categories.test.ts`: create, rename, recolour and delete, through `run`. Tests: a
  deletion changes the transactions, the budget and the pending batch in one storage transaction,
  and a failing deletion changes none of them ([R-06](research.md#r-06)).
- [X] T070 [US6] The Categories screen in `src/ui/screens/categories/CategoriesScreen.tsx`, with the
  palette picker `src/ui/components/ColourPicker.tsx` holding the 18 swatches of
  [shared patterns](contracts/ui.md#shared-patterns), test-first in `e2e/ui/categories.spec.ts`
  ([categories](contracts/ui.md#categories)).
  - Add the route `#/categories` and its sidebar entry, with Expenses and Income tabs.
  - Each row has inline Rename, Colour and Delete. Delete on a protected category shows
    `category-protected` instead of a confirmation. On any other category, the confirmation states
    the counts from `deletionImpact`.
  - **New category** defaults its colour to the first palette colour not yet used on that side.
  - Add `category-name-empty`, `category-name-taken` and `category-protected` to
    `src/ui/messages.ts`.
  - Tests: [User Story 6](spec.md#user-story-6) scenarios 1, 4 and 5; the confirmation text with its
    counts; and the default colour.
- [X] T071 [US6] The journey `e2e/us6-categories.spec.ts`: scenarios 1–5. Scenario 2 checks the new
  name and colour in the transaction list, the form and Budgets ([FR-065](spec.md#fr-065)), and
  scenario 3 sets its budget through Budgets.

**Checkpoint**: categories can be managed without breaking transactions or budgets. Push and run the
post-push check.

---

## Phase 9: User Story 7 - Back up and restore all data (Priority: P7)

**Goal**: one file holds everything, and loading it reproduces that state exactly
([User Story 7](spec.md#user-story-7)).

**Independent Test**: the story's [Independent Test](spec.md#user-story-7), automated as
`e2e/us7-backup.spec.ts` (T076).

- [X] T072 [P] [US7] The backup file format in `src/files/backup.ts`, test-first in
  `src/files/backup.test.ts` ([backup-file.md](contracts/backup-file.md), [R-13](research.md#r-13)).
  Install zod.
  - `serializeBackup(state, exportedAt)` writes the file, and `backupFileName(today)` names it.
  - `parseBackup(text)` runs validation steps 1–3 of
    [loading](contracts/backup-file.md#loading-fr-071-fr-072), with a zod schema for each entity of
    [data-model.md](data-model.md#entities). It refuses `backup-not-a-backup`, `backup-newer-version`
    or `backup-damaged`, the last with structured details (the record and field at fault) for the UI
    to word.
  - Tests: a round trip is deep-equal; each refusal; and a transaction without a date is named.
- [X] T073 [P] [US7] Replacing all data in `src/persistence/db.ts`, test-first in
  `src/persistence/db.test.ts`. `replaceAll(db, state)` clears every store and writes every record in
  one transaction ([loading](contracts/backup-file.md#loading-fr-071-fr-072) step 4). Test: a failing
  write leaves the old data.
- [X] T074 [US7] Backup actions in `src/store/backup.ts`, test-first in `src/store/backup.test.ts`.
  - `createBackup()` returns the file's text and name, and writes nothing ([FR-070](spec.md#fr-070)).
  - `prepareRestore(text)` runs `parseBackup`, then `checkInvariants`, turning a broken invariant
    into `backup-damaged` (step 4).
  - `restore(validState)` runs `replaceAll`, then reloads the in-memory state from storage.
  - Tests: an invalid file leaves the data unchanged ([FR-072](spec.md#fr-072)), and a restore
    followed by a save gives the same `data` ([SC-014](spec.md#sc-014)).
  - Depends on T072, T073.
- [X] T075 [US7] The Backup screen in `src/ui/screens/backup/BackupScreen.tsx`, test-first in
  `e2e/ui/backup.spec.ts` ([backup](contracts/ui.md#backup)).
  - Add the route `#/backup` and its sidebar entry.
  - **Save backup** downloads the file.
  - **Restore from backup** validates the file, asks for confirmation in the danger style ("Replace
    all data"), replaces the data, shows a notification and opens Transactions. Refusals appear in an
    alert.
  - When the start-up request of T022 was not granted, show the persistent-storage notice.
  - Add `backup-not-a-backup`, `backup-newer-version`, `backup-damaged` (worded from its details) and
    the notification to `src/ui/messages.ts`.
  - Tests: the download's name and content; cancelling the confirmation; each refusal, with the data
    unchanged; and the notice, with `navigator.storage.persist` stubbed to resolve `false` through
    `page.addInitScript`.
- [X] T076 [US7] Backup helpers in `e2e/support/backup.ts`, and the journey `e2e/us7-backup.spec.ts`
  ([quickstart.md](quickstart.md#us7-backup-and-restore)).
  - The helpers build a backup from plain records, restore it through the Backup screen, and read a
    downloaded file.
  - The journey runs scenarios 1–3 and the [SC-014](spec.md#sc-014) round trip. It fills every entity
    type through the UI, including a pending batch with review progress. It then saves, restores into
    a fresh context, saves again, and compares the two `data` objects.

**Checkpoint**: every story is complete, and data can move between machines. Push and run the
post-push check.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: checks that span all stories, and the final validation.

- [X] T077 [P] The messages spec `e2e/messages.spec.ts` ([quickstart.md](quickstart.md#messages)). It
  triggers each refusal that [SC-012](spec.md#sc-012) lists, once each. For each one, it checks that
  the wording from `src/ui/messages.ts` appears where [shared patterns](contracts/ui.md#shared-patterns)
  places it.
- [X] T078 [P] Data generators in `e2e/support/generate.ts`: a backup of n transactions inside a given
  period, and a bank CSV of n rows across m vendors with a counterparty column. Add
  `e2e/support/write-sc001.ts`, which writes the [SC-001](spec.md#sc-001) file (about 300 rows from
  about 40 vendors) to `tmp/`, and the `fixtures:sc001` script that runs it with Node's built-in type
  stripping ([manual checks](quickstart.md#manual-checks)).
- [X] T079 The performance spec `e2e/performance.spec.ts` ([quickstart.md](quickstart.md#performance)):
  [SC-009](spec.md#sc-009), [SC-010](spec.md#sc-010) and the 1-second list render of
  [R-21](research.md#r-21). Each check uses generated data from T078, restored or imported with the
  helpers of T076. Depends on T076, T078. The list check is skipped: Firefox takes longer ([R-21](research.md#r-21)), and
  the fix is listed under Not in v1 ([Out of Scope](spec.md#out-of-scope)).
- [x] T080 Validate a fresh checkout. Clone the repository into a new folder, then run `npm ci` and
  every command of [automated checks](quickstart.md#automated-checks), and fix whatever fails. This
  covers the portable-checkout rule and [quickstart.md](quickstart.md#setup).
- [x] T081 (Project owner, manual) Walk the [manual checks](quickstart.md#manual-checks) on
  `http://localhost:4173` and on the Vercel production domain, and confirm that CI's `test` and
  `deployed` jobs are green ([after pushing to main](quickstart.md#after-pushing-to-main)).

---

## Phase 11: UI improvements

**Purpose**: interface changes the owner asks for after v1.0. Each change goes into the spec's
[v1.1 requirements](spec.md#fr-080) and its contract first, then gets a task here.

- [X] T082 Reorder the sidebar entries in `src/ui/app/App.tsx` to the order of
  [ui.md](contracts/ui.md#shell-and-navigation) ([FR-084](spec.md#fr-084)). Test first: update the
  sidebar tests in `e2e/ui/` (`transactions`, `import`, `budgets`, `categories`, `backup` and
  `insights`), so each checks the new order or its screen's new position.
- [X] T083 Column headers for the transaction list in
  `src/ui/screens/transactions/TransactionsScreen.tsx` ([ui.md](contracts/ui.md#transactions),
  [FR-080](spec.md#fr-080), [R-21](research.md#r-21)). Test first in `e2e/ui/transactions.spec.ts`:
  the header names the columns in order, each sits over its column, and Amount is right-aligned.
- [X] T084 One category filter for both sides in
  `src/ui/screens/transactions/TransactionsScreen.tsx`, replacing the side switch
  ([ui.md](contracts/ui.md#transactions), [FR-082](spec.md#fr-082)). Test first in
  `e2e/ui/transactions.spec.ts`: the side switch is gone; the select holds an Expenses group and an
  Income group, each with its own categories and protected categories, with a divider between
  them; the closed select names the chosen category's group; and filtering by a category of either
  side still works.
- [X] T085 Editing in place in `src/ui/screens/transactions/TransactionsScreen.tsx`
  ([ui.md](contracts/ui.md#transactions), [FR-081](spec.md#fr-081), [R-21](research.md#r-21)).
  Test first in `e2e/ui/transactions.spec.ts`:
  - each column edits in place without the form, and the change survives a reload;
  - Enter and leaving a field save, Escape cancels, and focus returns to the cell;
  - a transfer's destination and account never offer the same account;
  - `amount-invalid`, `date-invalid` and `save-failed` show under the cell, with the field still
    open;
  - the Edit transaction button opens the form.

  Every test that opened the form by clicking a row uses the Edit transaction button instead, in
  `transactions`, `transaction-form`, `us1-ledger` and `us6-categories`. The column header test
  of T083 finds the cells as the children of the row's grid, so it holds before and after this
  task.
- [X] T086 "This year" runs to today in `periodPreset` of `src/domain/dates.ts`
  ([ui.md](contracts/ui.md#insights), [FR-086](spec.md#fr-086)). Test first in
  `src/domain/dates.test.ts` and `e2e/ui/insights.spec.ts`: the preset's range on several days of
  the year, including 1 January and 31 December; the button's dates; and the budget month it
  shows, the current one. The US3 journey in `e2e/us3-insights.spec.ts` expects the new range.
- [X] T087 A preview of each point's categories in the spending line's tooltip: every point that
  `insights` returns in `src/domain/insights.ts` carries its expense breakdown, and
  `src/ui/screens/insights/SpendingChart.tsx` shows it ([ui.md](contracts/ui.md#insights),
  [FR-087](spec.md#fr-087), [FR-052](spec.md#fr-052), [R-14](research.md#r-14)). Test first:
  - in `src/domain/insights.test.ts`, a point's categories: largest first and by name on a tie,
    without income or transfers, with "Unaccounted" marked unknown, summed over the month for a
    monthly point, and none for a point without spending;
  - in `e2e/ui/insights.spec.ts`, the tooltip lists a point's categories in order, shows four and
    "N more categories" when there are more than five, and marks "Unaccounted" unknown.
- [X] T088 A date filter for the transaction list: `listTransactions` in
  `src/domain/transactions.ts` takes a From and a To date, `TransactionsScreen.tsx` shows them
  among the filters, and `src/ui/messages.ts` words `date-range-invalid`
  ([ui.md](contracts/ui.md#transactions), [FR-083](spec.md#fr-083), [R-14](research.md#r-14)).
  Test first:
  - in `src/domain/transactions.test.ts`, From alone, To alone and both, with each end included,
    and the dates combined with the account and category filters;
  - in `e2e/ui/transactions.spec.ts`, From and To filter the list; a From after To shows
    `date-range-invalid` under the fields and keeps the last rows; and Clear filters empties both
    fields.
- [X] T089 Import opens from Transactions instead of the sidebar: `src/ui/app/App.tsx` drops the
  Import entry and marks Transactions current on every import route, and `TransactionsScreen.tsx`
  gains the Import CSV link ([ui.md](contracts/ui.md#shell-and-navigation),
  [ui.md](contracts/ui.md#transactions), [FR-085](spec.md#fr-085)). Test first:
  - in `e2e/ui/import.spec.ts`, the sidebar has no Import entry; Import CSV on Transactions opens
    Import, with and without transactions; and Import, Review and the profile editor mark
    Transactions as the current entry;
  - the sidebar tests in `e2e/ui/` (`transactions`, `budgets`, `categories` and `backup`) expect
    the six entries and their screens' new positions.
- [X] T090 The app's version in the header of `src/ui/app/App.tsx`, read from `package.json`
  ([ui.md](contracts/ui.md#shell-and-navigation), [FR-088](spec.md#fr-088)). Test first in
  `e2e/ui/shell.spec.ts`: the header shows "Version" and the MAJOR.MINOR of `package.json`.

**Checkpoint**: every task of the phase is done. The phase is a release (constitution IX), so the
commit of its last task sets the version to `1.1.0`. Push and run the post-push check.

---

## Phase 12: Category suggestions

**Purpose**: Claude suggests categories for the rows that review still holds in "Uncategorised",
through the n8n workflow in `n8n/`, and only while the user has AI features on in Settings
([FR-090](spec.md#fr-090) – [FR-095](spec.md#fr-095), [R-23](research.md#r-23),
[ai.md](contracts/ai.md)). The owner asked for it after v1.1. The spec, contracts
and research change first, in the commits that add this phase.

- [X] T091 The suggested mark on a pending row: `suggested?: true` on the category assignment in
  `src/domain/types.ts`; `resolve` in `src/domain/import/review.ts` stores a chosen category
  without the mark; invariant 7 in `src/domain/invariants.ts` gains
  `pending-row-suggestion-invalid`, worded in `src/ui/messages.ts`; and `pendingRowSchema` in
  `src/files/backup.ts` keeps the key ([data-model.md](data-model.md#pending-row),
  [FR-093](spec.md#fr-093), [backup-file.md](contracts/backup-file.md#compatibility)). Test first:
  - in `src/domain/import/review.test.ts`, a choice that carries the mark is stored without it, and
    choosing for a suggested row, alone or through its group, removes the mark, even when it is the
    same category;
  - in `src/domain/categories.test.ts`, deleting the category of a suggested row moves the row to
    "Uncategorised" without the mark;
  - in `src/domain/import/confirm.test.ts`, a suggested row books exactly the transaction a chosen
    one does;
  - in `src/domain/invariants.test.ts`, a suggested "Uncategorised" or "Unaccounted" breaks
    invariant 7;
  - `everyEntityState` in `src/domain/testing.ts` gains a suggested row, so the round trips in
    `src/files/backup.test.ts` and `src/store/backup.test.ts` keep it ([SC-014](spec.md#sc-014));
    and in `src/files/backup.test.ts`, a file without the key loads, while `suggested: false` is
    refused as damaged.
- [X] T092 Suggestion rules in `src/domain/import/suggestions.ts`: `suggestableRows`,
  `suggestionRequest` and `applySuggestions` ([FR-090](spec.md#fr-090) – [FR-093](spec.md#fr-093),
  [ai.md](contracts/ai.md)). Test first in
  `src/domain/import/suggestions.test.ts`:
  - which rows qualify: an included duplicate does; an excluded duplicate, a transfer, a row with
    another category, a row with no text, and a row whose side has only protected categories do
    not; at most 300, in review order;
  - the request holds exactly each row's number, side, counterparty and description, the
    unprotected names per side, and at most 100 examples, newest first, one per side and
    description, with no amount, date or account;
  - applying fills only rows that still qualify, matching names ignoring case and surrounding
    spaces; it ignores `null`, unknown names, names of the other side or of protected categories,
    and unknown rows; the first suggestion for a row counts; it counts the rows filled; and every
    result passes the invariants;
  - `suggestions-outdated` when no batch, or another batch, is pending.
- [X] T093 [P] The categoriser boundary in `src/categoriser/`: `endpoint.ts`, the address, and
  `categoriser.ts`, which posts the request, gives up after 4 minutes and checks the answer; zod
  comes from a new `src/files/zod.ts`, which `src/files/backup.ts` uses too
  ([ai.md](contracts/ai.md), [FR-094](spec.md#fr-094), [R-23](research.md#r-23)).
  Test first in `src/categoriser/categoriser.test.ts`, with `fetch` stubbed: it posts JSON to the
  address; a valid answer gives its suggestions without extra keys; a rejected fetch and a 404 give
  `categoriser-unreachable`; another error status gives `categoriser-failed`; a body that is not
  JSON, or has another shape such as n8n's "Workflow was started" or the chain's `{"output": …}`,
  gives `categoriser-answer-invalid`; with fake timers, no answer within 4 minutes gives
  `categoriser-timeout`; aborting the caller's signal resolves as cancelled; and nothing ever
  rejects. The test commit adds `endpoint.ts`, the address only, so the T097 specs can load.
- [X] T094 [P] The workflow `n8n/financial-copilot-categories.json`, as [R-23](research.md#r-23)
  describes it, and `n8n/` in `.prettierignore`, so a file exported from n8n is committed as it is
  ([ai.md](contracts/ai.md)). Test first in `src/categoriser/workflow.test.ts`:
  the Webhook node listens for POST on the path of `endpoint.ts`, allows the app's origins and
  answers through a Respond to Webhook node, and the output parser's schema requires the answer of
  the contract.
- [X] T095 Data sharing: `dataSharing?: true` in the settings of `src/domain/types.ts`;
  `setDataSharing` in a new `src/domain/settings.ts` and a new `src/store/settings.ts`; the
  optional key in the settings schema of `src/files/backup.ts`; and the header's switch and the
  warning on every screen in `src/ui/app/App.tsx`, worded in `src/ui/messages.ts`
  ([ui.md](contracts/ui.md#shell-and-navigation), [FR-061](spec.md#fr-061),
  [FR-095](spec.md#fr-095), [data-model.md](data-model.md#settings)). Test first:
  - in `src/domain/settings.test.ts`, turning sharing on stores `dataSharing: true`, turning it off
    removes the key, and neither changes the rest of the settings;
  - in `src/store/settings.test.ts`, with `fake-indexeddb`, the choice survives reopening the
    database;
  - `everyEntityState` in `src/domain/testing.ts` gains data sharing on, so the backup round trips
    keep it ([SC-014](spec.md#sc-014)); and in `src/files/backup.test.ts`, a file without the key
    loads with sharing off, while `dataSharing: false` is refused as damaged;
  - in `e2e/ui/shell.spec.ts`, the switch starts off; turning it on shows the warning, which names
    Anthropic, on every screen and after a reload; Turn off and the switch each remove it; and
    turning sharing on sends nothing.
- [X] T096 `suggestCategories` in `src/store/import.ts`, and `data-sharing-off` worded in
  `src/ui/messages.ts` ([FR-061](spec.md#fr-061), [FR-090](spec.md#fr-090) –
  [FR-094](spec.md#fr-094)). Test first in `src/store/import.test.ts`, with `fetch` stubbed: with
  data sharing off, it gives `data-sharing-off` and sends nothing; it sends the request of
  `suggestionRequest`; it fills rows, and the marks survive reopening the database
  ([FR-022](spec.md#fr-022)); it resolves to the rows sent and filled; each refusal leaves memory
  and storage unchanged; a row the user assigns while the request runs keeps the user's choice; a
  batch discarded meanwhile gives `suggestions-outdated` and writes nothing; and an aborted request
  writes nothing, even when its answer had arrived.
- [X] T097 Suggest categories in review: `src/ui/screens/import/SuggestCategories.tsx`, and
  `ReviewScreen.tsx`, where Confirm waits and leaving aborts; the codes and the outcome in
  `src/ui/messages.ts`; and the workflow's origin in `connect-src` of `vite.config.ts`
  ([ui.md](contracts/ui.md#review), [FR-027](spec.md#fr-027), [FR-061](spec.md#fr-061),
  [FR-090](spec.md#fr-090), [FR-091](spec.md#fr-091), [FR-094](spec.md#fr-094)). Test first:
  - `e2e/support/categoriser.ts` turns data sharing on, answers at the address in the workflow's
    place, records the request bodies, and can hold or fail an answer;
  - in `e2e/ui/review.spec.ts`: with data sharing off, the button is unavailable and review says
    that it needs data sharing; with it on, the button names its rows; nothing is requested before
    the click; the request holds the rows in review order, the category names and an example from
    an earlier transaction, and no amount or date; after the answer, the status line counts the
    rows, the named rows hold their categories, and bad names change nothing; while an answer is
    held, the button reads "Asking Claude…", Confirm is unavailable, and a row assigned meanwhile is
    kept; leaving review while an answer is held fills nothing; an unreachable n8n, a 500 and
    "Workflow was started" each show their message and change nothing; and the button is
    unavailable once no row qualifies;
  - in `e2e/network-guard.spec.ts`: with data sharing on, reviewing an import sends nothing, and a
    press with no answer in the workflow's place fails the guard;
  - in `e2e/messages.spec.ts`: `categoriser-unreachable` in the review's alert
    ([SC-012](spec.md#sc-012));
  - in `src/ui/messages.test.ts`: the outcome for no row, one row and several rows.
- [X] T098 The suggested mark in `src/ui/screens/import/AssignmentControl.tsx` and
  `ReviewGroups.tsx` ([ui.md](contracts/ui.md#review), [FR-093](spec.md#fr-093)). Test first:
  - in `e2e/ui/review.spec.ts`: a suggested row shows "Suggested"; a group shows it only when its
    rows hold the same suggested category, and otherwise "Mixed", with the marks on the unfolded
    rows; any choice, even the same category, removes the mark, on screen and after a reload; the
    other marks survive a reload; and confirming books suggested rows like chosen ones;
  - in `e2e/us7-backup.spec.ts`: the round trip includes a suggested row
    ([SC-014](spec.md#sc-014)).
- [X] T100 The data-sharing warning on Suggest categories, replacing T095's switch and banner
  (owner, 2026-10-12): `skipSharingWarning?: true` in place of `dataSharing` in the settings of
  `src/domain/types.ts` and `src/files/backup.ts`; `skipSharingWarning` in place of
  `setDataSharing` in `src/domain/settings.ts` and `src/store/settings.ts`; `suggestCategories`
  in `src/store/import.ts` without `data-sharing-off`; the dialog in
  `src/ui/screens/import/SuggestCategories.tsx`, worded in `src/ui/messages.ts`; and
  `src/ui/app/DataSharing.tsx` and its place in `App.tsx` removed
  ([ui.md](contracts/ui.md#review), [FR-061](spec.md#fr-061), [FR-095](spec.md#fr-095),
  [data-model.md](data-model.md#settings)). Test first:
  - in `src/domain/settings.test.ts`, it stores `skipSharingWarning: true` and leaves the rest of
    the settings as they were; in `src/store/settings.test.ts`, the choice survives reopening the
    database;
  - `everyEntityState` in `src/domain/testing.ts` holds `skipSharingWarning`, so the backup round
    trips keep it ([SC-014](spec.md#sc-014)); in `src/files/backup.test.ts`, a file without the key
    loads, while `skipSharingWarning: false` is refused as damaged;
  - in `src/store/import.test.ts`, `suggestCategories` sends without any setting;
  - in `src/ui/messages.test.ts`, the warning names n8n and Anthropic;
  - `e2e/support/categoriser.ts` selects Suggest categories and agrees to the warning;
  - in `e2e/ui/review.spec.ts`: the button is available without any setting; selecting it shows
    the warning, and Cancel sends and saves nothing; agreeing sends, and the next selection warns
    again; agreeing with Don't warn me again ticked stores the choice, and later selections send at
    once, also after a reload;
  - in `e2e/ui/shell.spec.ts`, the header holds no data-sharing switch.
- [X] T101 AI features in Settings, replacing T100's warning on Suggest categories (owner,
  2026-10-15): `aiFeatures?: true` in place of `skipSharingWarning` in the settings of
  `src/domain/types.ts` and `src/files/backup.ts`; `setAiFeatures` in place of
  `skipSharingWarning` in `src/domain/settings.ts` and `src/store/settings.ts`;
  `suggestCategories` in `src/store/import.ts` refusing with `ai-features-off`; a new
  `src/ui/screens/settings/SettingsScreen.tsx` with the switch and the data-sharing warning, at
  `#/settings` and last in the sidebar of `src/ui/app/App.tsx`; `SuggestCategories.tsx` without
  the dialog, unavailable with AI features off; all worded in `src/ui/messages.ts`
  ([ui.md](contracts/ui.md#settings), [ui.md](contracts/ui.md#review), [FR-061](spec.md#fr-061),
  [FR-084](spec.md#fr-084), [FR-090](spec.md#fr-090), [FR-095](spec.md#fr-095),
  [data-model.md](data-model.md#settings)). Test first:
  - in `src/domain/settings.test.ts`, turning AI features on stores `aiFeatures: true`, turning
    them off removes the key, and neither changes the rest of the settings; in
    `src/store/settings.test.ts`, the choice survives reopening the database;
  - `everyEntityState` in `src/domain/testing.ts` holds `aiFeatures`, so the backup round trips
    keep it ([SC-014](spec.md#sc-014)); in `src/files/backup.test.ts`, a file without the key loads
    with AI features off, while `aiFeatures: false` is refused as damaged;
  - in `src/store/import.test.ts`, with AI features off, `suggestCategories` gives
    `ai-features-off` and sends nothing;
  - in `src/ui/messages.test.ts`, the warning names n8n and Anthropic;
  - `e2e/support/categoriser.ts` turns AI features on in Settings and agrees to the warning;
  - in a new `e2e/ui/settings.spec.ts`: the sidebar lists Settings last; the switch starts off;
    turning it on shows the warning, and Cancel leaves it off and saves nothing; Turn on keeps it
    on after a reload and sends nothing; turning it off takes effect at once, without a warning;
  - in `e2e/ui/review.spec.ts`: with AI features off, the button is unavailable and review says
    that it needs AI features, linking to Settings; with them on, selecting it sends at once,
    without a dialog;
  - in `e2e/network-guard.spec.ts`: turning AI features on and reviewing an import send nothing.
- [X] T099 (Project owner, manual) Publish the workflow on the hosted n8n, put its address into
  `src/categoriser/endpoint.ts` and the categoriser contract, and walk the quickstart's category
  suggestions, including the SC-001 file. The commit of this task sets the version to `1.2.0`.
  Closed by the owner (2026-10-16): v1.2 was released with the squash commit `7acf45a` on `main`,
  whose `package.json` still reads `1.1.0`, and without its tag. Phase 13 replaces the workflow and
  sets the version to `1.3.0` (T108).

**Checkpoint**: every task of the phase is done. The phase is a release (constitution IX), MINOR
because v1.1 reads v1.2 storage and backups and only drops the marks ([R-23](research.md#r-23)).
Push and run the post-push check.

---

## Phase 13: AI through OpenAI, and the finance chat

**Purpose**: both AI features ask OpenAI through a route that the local server adds, with the key in
`.env`, in place of the hosted n8n workflow; and Insights gains the finance chat of
[User Story 8](spec.md#user-story-8), about the user's own data, available only while AI features
are on, which only the app run locally allows ([FR-061](spec.md#fr-061),
[FR-090](spec.md#fr-090) – [FR-095](spec.md#fr-095), [FR-100](spec.md#fr-100) –
[FR-110](spec.md#fr-110), [R-24](research.md#r-24) – [R-26](research.md#r-26),
[ai.md](contracts/ai.md)). The owner asked for both on 2026-10-15, after v1.2. On 2026-10-16 the
owner asked that a hosted copy keep AI features off (T109), and then for streamed answers with
Stop, answers that rest only on the data, sources that open the transaction list, and a stored
conversation (T110 – T115). The spec, contracts and research change first, in the commits that add
this phase. The test commits of T102 – T107, written before that last request, change with it.

**Independent Test**: User Story 8's, automated as `e2e/us8-finance-chat.spec.ts`
([quickstart.md](quickstart.md#us8-finance-chat)).

- [X] T102 The local route in a new `server/aiRoute.ts`: a Vite plugin, applied when serving, that
  reads `OPENAI_API_KEY` with `loadEnv(mode, envDir, "OPENAI_")` and, with a key, answers
  `POST /api/ai` in the dev and preview servers as [ai.md](contracts/ai.md#route) says; without a
  key, or with an empty one, it adds no route. The path lives in a new `src/ai/path.ts`, which
  imports nothing. `vite.config.ts` adds the plugin, drops the n8n origin from `connect-src` and
  adds `server/**/*.test.ts` to `test.include`; `tsconfig.node.json` includes `server`;
  `.env.example` is committed, with `!.env.example` in `.gitignore`; and `playwright.config.ts`
  starts its preview with an empty `OPENAI_API_KEY` ([R-24](research.md#r-24),
  [R-19](research.md#r-19), [FR-061](spec.md#fr-061), [FR-105](spec.md#fr-105)). Test first:
  - in `server/aiRoute.test.ts`, with OpenAI's `fetch` stubbed: without a key, and with an empty
    one, the plugin adds no route; a POST from the app's origin, or without an Origin, goes
    unchanged to OpenAI's Responses API with only the key and the content type, and OpenAI's
    status, content type and body come back, a body that OpenAI sends in parts reaching the
    browser part by part, the first before OpenAI's last ([R-26](research.md#r-26)); a GET,
    another Origin, `Origin: null` and a caller that is not this computer get 403 and send
    nothing; a body over 2 MB gets 413 and sends nothing; a failed call to OpenAI gives 502; and
    closing the request aborts OpenAI's;
  - in `e2e/ui/shell.spec.ts`, the production CSP's `connect-src` is `'self'` alone.

  The test commit adds `src/ai/path.ts`, the path only, so the specs of T104 and T107 can load.
- [X] T103 The transport in a new `src/ai/openai.ts`: `askOpenAi(request, signal, onText?)` posts
  `{ model, store: false, stream: true, instructions, input, text }` to the path of
  `src/ai/path.ts` and reads the server-sent events as [ai.md](contracts/ai.md#answer) says. After
  each `response.output_text.delta` it reports the text so far to `onText`; on
  `response.completed` it checks the whole text against the feature's zod schema; and it turns
  every failure into `ai-unreachable`, `ai-failed`, `ai-timeout` or `ai-answer-invalid`, as
  [ai.md](contracts/ai.md#failures) says. A new `src/ai/testing.ts` builds event streams of the
  Responses API for Vitest and Playwright, whole or fed event by event through a `ReadableStream`
  ([FR-094](spec.md#fr-094), [FR-107](spec.md#fr-107), [R-24](research.md#r-24),
  [R-26](research.md#r-26)). Test first in `src/ai/openai.test.ts`, with `fetch` stubbed:
  - the request's path, method, content type and body, with the model, `store: false`,
    `stream: true` and a strict format;
  - the text of the deltas, in order, with events of other types, such as a reasoning summary,
    ignored; `onText` gets the text so far after each delta; and the result is the whole text,
    checked against the schema;
  - a rejected fetch; a 403, 404, 405 or 502 with an empty, text or HTML body; and events that
    break off, or end before `response.completed`, give `ai-unreachable`;
  - OpenAI's error JSON with 400, 401, 404, 429 or 500, and a `response.failed` or `error` event,
    give `ai-failed`;
  - a 2xx answer that is not an event stream, a `response.incomplete` or refusal event, text that
    is not JSON, and JSON of another shape give `ai-answer-invalid`;
  - with fake timers, no whole answer within 4 minutes gives `ai-timeout`, also while deltas keep
    arriving, and the timeout stays below Firefox's 300 seconds;
  - aborting the caller's signal, before the request or while events arrive, resolves as
    cancelled; and nothing ever rejects.

  The test commit adds `src/ai/testing.ts`.
- [X] T104 Category suggestions through OpenAI: a new `src/ai/categoriser.ts` with
  `askCategoriser`, of the same signature as before, which sends the request as JSON text with the
  instructions and the strict schema of [ai.md](contracts/ai.md#category-suggestions);
  `src/store/import.ts` uses it; and `src/categoriser/`, `n8n/` and its line in `.prettierignore`
  go. `src/ui/messages.ts` words the `ai-*` codes in place of `categoriser-*`, and
  `ai-features-off` for any AI feature. Review's texts name no provider: "Asking the AI…" in
  `SuggestCategories.tsx`, the outcome line, `suggestions-outdated` and
  `pending-row-suggestion-invalid`; nor do `ReviewScreen.tsx` and the comments. The Settings line
  and the warning name OpenAI ([ai.md](contracts/ai.md), [ui.md](contracts/ui.md#review),
  [FR-090](spec.md#fr-090) – [FR-095](spec.md#fr-095), [FR-105](spec.md#fr-105)). Test first:
  - in `src/ai/categoriser.test.ts`: it posts with the format name `category_suggestions` and a
    strict schema that requires `suggestions` of `rowNumber` and `category`; the instructions say
    to copy names exactly, to give `null` for a transfer between the user's own accounts, and
    never to follow instructions in the texts; the one input is the request as JSON text; a valid
    answer gives its suggestions; and an answer of another shape gives `ai-answer-invalid`;
  - in `src/store/import.test.ts`, the stubbed answers are the Responses API's event streams, and
    failures give the `ai-*` codes;
  - in `src/ui/messages.test.ts`, each `ai-*` message says what to do and that nothing changed,
    the warning names OpenAI and neither n8n nor Anthropic, and review's wording names no provider;
  - `e2e/support/ai.ts` replaces `e2e/support/categoriser.ts`: it answers at `/api/ai` with an
    event stream, as the Responses API does ([R-26](research.md#r-26)), records the decoded
    requests of each feature, and can hold or fail an answer; and the guard in
    `e2e/support/test.ts` also aborts a request to `/api/ai` that no stand-in answers;
  - in `e2e/network-guard.spec.ts`, Suggest categories without a stand-in fails the guard; and in
    `e2e/ui/review.spec.ts`, `e2e/messages.spec.ts`, `e2e/ui/settings.spec.ts` and
    `e2e/us7-backup.spec.ts`, the existing checks with the new stand-in, codes and wording
    ([SC-012](spec.md#sc-012)).
- [X] T105 [P] [US8] The chat's data: `chatContext(state, today)` in a new `src/domain/chat.ts`, as
  [R-25](research.md#r-25) and [ai.md](contracts/ai.md#finance-chat) describe it
  ([FR-102](spec.md#fr-102)). Test first in `src/domain/chat.test.ts`: the period runs from the
  first day of the month 12 months back to today, also across a year's end; each month's totals
  match `insights` for that month, and a month without money has zero totals; transfers and
  transactions outside the period are left out; rows are by date, then order of entry, with money
  out negative, in euros, such as `-12.34`; accounts carry their balance, and budgets this month's
  spending; and no id, colour, profile, pending import or setting appears.
- [X] T110 [US8] The conversation in the domain: `ChatTurn` and `ChatSource` in
  `src/domain/types.ts`, as [data-model.md](data-model.md#conversation) describes them, and
  `conversation: readonly ChatTurn[]` in `State`, empty in the seed; `conversation?: { put:
  readonly ChatTurn[] }` in `Changes`, which replaces the whole list; in `src/domain/chat.ts`,
  `chatSources(state, named)`, which turns the sources an answer names into sources with ids, and
  `addTurn` and `clearConversation`, which return those changes; and invariant 9 in
  `src/domain/invariants.ts` ([FR-104](spec.md#fr-104), [FR-108](spec.md#fr-108),
  [FR-110](spec.md#fr-110), [R-26](research.md#r-26)). The data model's constraints, verbatim:
  `question` "Non-empty after trimming"; `answer` "Empty when out of scope, and when stopped before
  its first words"; `outOfScope` and `stopped` "`true`, or absent"; `sources` "Empty when out of
  scope or stopped"; a source's `name` "Non-empty", its dates "`from` on or before `to`", and its
  `categoryId` "May name a category deleted since". Test first:
  - in `src/domain/chat.test.ts`: a category named by side and name, compared by name key, and an
    account named by name, become their ids; a source with dates alone keeps `null` for both; a
    source whose category is of the other side or does not exist, whose account does not exist,
    whose name is empty, or whose dates are invalid or reversed is left out; `addTurn` appends a
    turn at the end; and `clearConversation` empties the list;
  - in `src/domain/invariants.test.ts`: each rule of invariant 9 fails for a turn that breaks it,
    and a source naming a deleted category passes;
  - in `src/domain/changes.test.ts`: `conversation` replaces the list, and deleting a category
    leaves the turns as they are.
- [X] T111 [US8] Storing and backing up the conversation: `src/persistence/db.ts` loads the record
  under the key `conversation` of the `settings` store into `state.conversation`, an absent one as
  an empty list; writes `changes.conversation` in the same transaction as the other changes,
  removing the record for an empty list; and writes it in `replaceAll`. The schema stays at
  version 1. `src/files/backup.ts` saves `conversation` in `data` only while it holds a turn,
  reads a file without it as an empty conversation, and refuses a file whose turns break
  invariant 9 with `backup-damaged`, which `src/ui/messages.ts` words for the conversation
  ([FR-070](spec.md#fr-070) – [FR-072](spec.md#fr-072), [FR-104](spec.md#fr-104),
  [SC-014](spec.md#sc-014), [backup-file.md](contracts/backup-file.md#compatibility),
  [R-26](research.md#r-26)). Test first:
  - in `src/persistence/db.test.ts`: a database without the record loads an empty conversation; a
    written conversation loads again; an empty one removes the record; the database stays at
    version 1; and a failed write leaves the record as it was;
  - in `src/files/backup.test.ts`: a round trip with a conversation, and one without, gives the
    same `data`; a file without `conversation` restores an empty one; and a damaged turn is
    refused;
  - in `src/ui/messages.test.ts`, `backup-damaged` names the conversation in plain words;
  - in `e2e/us7-backup.spec.ts`, where AI features can be on, the round trip includes a
    conversation ([SC-014](spec.md#sc-014)).
- [X] T106 [US8] Asking the chat: a new `src/ai/chat.ts` with
  `askFinanceChat(context, turns, question, signal, onAnswer)`. It sends the instructions and
  context of [ai.md](contracts/ai.md#finance-chat), the history it describes and the question,
  through `askOpenAi`; reads the answer as it arrives with `answerSoFar`, and reports the
  `{ inScope, answer }` so far to `onAnswer`; stops the request once `inScope` reads false; and
  resolves to `{ inScope, answer, sources }`, with the sources as the answer names them
  ([FR-102](spec.md#fr-102), [FR-103](spec.md#fr-103), [FR-107](spec.md#fr-107),
  [FR-109](spec.md#fr-109), [FR-110](spec.md#fr-110), [R-25](research.md#r-25),
  [R-26](research.md#r-26)). Test first in `src/ai/chat.test.ts`, with `fetch` stubbed:
  - the format name `finance_chat_answer` and its strict schema: `inScope`, `answer` and
    `sources`, in that order and all required, with each source's `name`, `from` and `to`, its
    `category` of `side` and `name` or `null`, and its `account` or `null`;
  - the instructions hold the rules of scope, of untrusted descriptions, of resting only on the
    data and saying what is missing, and of sources, and end with the context as JSON;
  - the input holds the earlier turns that have an answer text, oldest first, as user and
    assistant messages, at most the last 10, a stopped one with its text so far, then the
    question; turns out of scope, and turns stopped before their first words, are left out;
  - `answerSoFar` reads `inScope` once it is complete, and the answer's string as far as it has
    arrived, with escapes such as `\n`, `\"` and `\u00e9` decoded and no escape cut in half;
  - `onAnswer` gets the growing answer, delta by delta; an answer out of scope aborts the request
    as soon as it reads so, and resolves as out of scope; an empty answer in scope gives
    `ai-answer-invalid`; and the transport's failures, and a cancel, pass on.
- [X] T112 [US8] The chat's session in the store: `src/store/chat.ts` keeps in memory, outside any
  component, the question being answered, its answer so far, and the last failure with its
  question, and lets the UI subscribe to them ([FR-104](spec.md#fr-104),
  [FR-108](spec.md#fr-108), [FR-110](spec.md#fr-110), [R-26](research.md#r-26)).
  - `askChat(store, question)` refuses with `ai-features-off`, and sends nothing, while AI
    features are off; builds `chatContext` for `todayLocal()`; sends the stored conversation with
    the question; and, once the answer is complete or out of scope, stores the turn with `addTurn`
    and the sources of `chatSources` (T110).
  - `stopChat(store)` aborts the request and stores the turn with its text so far, marked
    `stopped`, without sources. `setAiFeatures(store, false)` does the same.
  - A failure stores nothing and keeps the question for the field. `clearConversation(store)`
    empties the conversation.

  Test first in `src/store/chat.test.ts`, with `fake-indexeddb` and `fetch` stubbed, feeding the
  events one by one:
  - with AI features off, `ai-features-off`, and nothing is sent or stored;
  - it sends today's context, the stored turns and the question;
  - the session shows the question at once, then the answer as it grows;
  - a complete answer is stored, with its sources' ids, in memory and in storage, and the session
    is empty again;
  - an answer out of scope is stored as such, with no text and no sources;
  - Stop, before the first words and after some, stores the text so far, marked stopped, without
    sources; turning AI features off does the same;
  - a failure, before any text or after some, stores nothing, and the session holds the code and
    the question;
  - while an answer is awaited, a second question is refused and sends nothing;
  - a failed write leaves the conversation as it was, and the session holds `save-failed`;
  - clearing empties the conversation in memory and in storage.
- [X] T113 [P] [US8] Transaction filters from the address: `parseRoute` in `src/ui/app/router.ts`
  reads the query of `#/?category=<id>&account=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD`, each part
  optional, into the transactions route, and `TransactionsScreen.tsx` starts with those filters,
  ignoring an id it does not know and a date that is not valid ([FR-110](spec.md#fr-110),
  [ui.md](contracts/ui.md#transactions), [R-26](research.md#r-26)). Test first:
  - in `src/ui/app/router.test.ts`: each part alone, all together, none, and an empty or malformed
    part; a query on another path leaves that path's route as it is;
  - in `e2e/ui/transactions.spec.ts`: an address with a category and dates opens the list with
    those filters set and only the matching rows; an unknown id and an invalid date are ignored;
    and Clear filters clears them.
- [X] T107 [US8] The finance chat on Insights: a new `src/ui/screens/insights/FinanceChat.tsx` in
  `InsightsScreen.tsx`, as [ui.md](contracts/ui.md#insights) describes it. It shows the stored
  conversation and the session of `src/store/chat.ts` (T112). Its wording goes in
  `src/ui/messages.ts`: the fixed answer out of scope, "Thinking…", "Stopped", "Sources", Stop,
  Clear conversation and its confirmation, and the Settings line and the warning for both features
  ([FR-095](spec.md#fr-095), [FR-100](spec.md#fr-100) – [FR-110](spec.md#fr-110),
  [ui.md](contracts/ui.md#settings)). Test first:
  - in `e2e/ui/insights.spec.ts`, with the stand-in:
    - the button opens the chat; with AI features off, the chat says that it needs them, links to
      Settings and sends nothing, and a stored conversation still shows;
    - an example question sends at once, and its answer shows as plain text after it, followed by
      its sources as links; a typed question sends with Enter, and the next one sends the first
      turn too;
    - while an answer is held, "Thinking…" shows, Stop takes Send's place, the field stays
      editable, and Enter sends nothing; Stop then leaves the question with the mark "Stopped" and
      no sources;
    - an answer out of scope shows the fixed answer, without sources;
    - a source opens Transactions with its filters, and returning to Insights shows the
      conversation; a source whose category was deleted shows as text;
    - a failure shows its message, keeps the conversation and puts the question back in the
      field;
    - closing and opening the chat, leaving Insights and reloading all keep the conversation; an
      answer held while the user leaves Insights shows once released and the user is back;
    - Clear conversation asks first: Cancel keeps the conversation, and confirming shows the
      examples again;
  - in `e2e/network-guard.spec.ts`, opening Insights and the chat with AI features on sends nothing
    before a question;
  - in `e2e/messages.spec.ts`, `ai-unreachable` in the chat's alert ([SC-012](spec.md#sc-012));
  - in `src/ui/messages.test.ts` and `e2e/ui/settings.spec.ts`, the Settings line names both
    features, and the warning says that the chat sends amounts, dates and account balances while
    suggestions do not.
- [X] T114 [US8] The journey `e2e/us8-finance-chat.spec.ts`: [User Story 8](spec.md#user-story-8)
  scenarios 1–11, as [quickstart.md](quickstart.md#us8-finance-chat) describes them, with the
  stand-in of `e2e/support/ai.ts`. On a hosted copy only scenario 1 runs
  ([FR-106](spec.md#fr-106)). It passes once T102 – T113 are done.
- [X] T115 [US8] [SC-015](spec.md#sc-015) in `e2e/performance.spec.ts`, as
  [quickstart.md](quickstart.md#performance) describes it: with a generated backup of 5,000
  transactions in the last 13 months restored, AI features on and the stand-in holding its
  answer, the question and "Thinking…" show within 1 s of sending, and Stop ends the answer within
  1 s, with no text after it once the stand-in answers. Skipped on a hosted copy.
- [X] T109 AI features only on the user's own computer (owner, 2026-10-16): `servedLocally` in a
  new `src/ai/local.ts`, true for the host names `localhost`, `127.0.0.1` and `[::1]`;
  `aiFeaturesOn(state)` in `src/store/settings.ts`, which `suggestCategories` and `askChat` check
  in place of the setting alone; the switch in `SettingsScreen.tsx` off and unavailable elsewhere,
  with `aiFeaturesLocalOnly` beside it; and `SuggestCategories.tsx` and `FinanceChat.tsx` reading
  `aiFeaturesOn` ([FR-106](spec.md#fr-106), [ui.md](contracts/ui.md#settings),
  [R-24](research.md#r-24)). Test first:
  - in `src/ai/local.test.ts`, which host names are the user's own computer, and that a page
    without a location, as in Node, is not;
  - in `src/store/settings.test.ts`, `aiFeaturesOn` only with the setting on and a local host; in
    `src/store/import.test.ts` and `src/store/chat.test.ts`, which now stub a local host, a
    hosted page with AI features on gives `ai-features-off` and sends nothing;
  - in `src/ui/messages.test.ts`, `aiFeaturesLocalOnly` says to run the app locally;
  - in `e2e/ui/settings.spec.ts`: locally, the switch is available and the line absent; on the
    hosted copy, which the `deployed` job tests, the switch is off and unavailable with the line
    beside it, also with AI features stored on, and review's button is unavailable; and the specs
    that turn AI features on skip there.
- [X] T116 [US8] The chat on every screen (owner, 2026-10-16): `FinanceChat.tsx` moves from
  `src/ui/screens/insights/` to a new `src/ui/screens/chat/` and renders in the shell of
  `src/ui/app/App.tsx` in place of `InsightsScreen.tsx`, outside `main`, which ends in space for
  its button. The button shows its icon and its name as text, in the primary colour; opening
  another screen, also from a link in the chat, closes it; and `aiFeaturesDescription` in
  `src/ui/messages.ts` names the chat without Insights ([FR-100](spec.md#fr-100), [ui.md](contracts/ui.md#finance-chat)). Test first:
  - in `e2e/ui/shell.spec.ts`: Transactions, Import, the profile editor and every other screen of
    the sidebar show the button, with its name as text, in the colour of Add transaction; and on
    a list long enough to scroll, scrolled to its end, the last row ends above the button;
  - in `e2e/ui/insights.spec.ts`: the chat on Budgets shows the conversation asked on Insights;
    following Settings or a source, or going back, closes the chat, and the screen it opens
    shows; `chatButton` of `e2e/support/ai.ts` finds the button outside `main` too;
  - in `e2e/us8-finance-chat.spec.ts`, scenarios 1 and 7 as [User Story 8](spec.md#user-story-8)
    now words them;
  - in `src/ui/messages.test.ts`, the Settings line names the finance chat without Insights.
- [ ] T117 [US8] Suggested questions (owner, 2026-10-16): `followUps` in the strict schema of
  `src/ai/chat.ts`, after `sources`, of which `askFinanceChat` gives the first three distinct ones
  that are not empty, trimmed; an answer without it is `ai-answer-invalid`. `ChatTurn.followUps`
  in `src/domain/types.ts`, with invariant 9 in `src/domain/invariants.ts` and the turn's schema
  in `src/files/backup.ts`; `askChat` in `src/store/chat.ts` stores them with a complete answer.
  In `FinanceChat.tsx`, the group "Suggested questions" under the log holds the examples while the
  conversation is empty or its latest turn is out of scope, and otherwise the latest turn's
  follow-ups, and is absent while an answer is awaited or written ([FR-101](spec.md#fr-101),
  [FR-111](spec.md#fr-111), [ai.md](contracts/ai.md#finance-chat),
  [data-model.md](data-model.md#conversation), [ui.md](contracts/ui.md#finance-chat)). Test
  first:
  - in `src/ai/chat.test.ts`: the schema's keys in the order `inScope`, `answer`, `sources`,
    `followUps`, all required, with `followUps` an array of strings; the rule asking for 1 to 3;
    the follow-ups given trimmed, distinct, without empty ones and at most three; an answer
    without them `ai-answer-invalid`;
  - in `src/domain/invariants.test.ts`: follow-ups on a turn out of scope or stopped, none, more
    than three, an empty one or a repeated one break invariant 9;
  - in `src/files/backup.test.ts`: a turn's follow-ups survive a backup, and follow-ups that are
    not strings are refused as a damaged turn;
  - in `src/store/chat.test.ts`: a complete answer is stored with its follow-ups, and one that
    suggests none without the key;
  - in `e2e/ui/insights.spec.ts`, with the stand-in of `e2e/support/ai.ts` answering with
    follow-ups: they show under the latest answer in "Suggested questions", one sends at once,
    they stay after a reload, and none show while an answer is awaited or after Stop; after a
    question out of scope the examples show again;
  - in `src/ui/messages.test.ts`, the group's name;
  - in `e2e/us8-finance-chat.spec.ts`, scenarios 5 and 10.
- [ ] T118 [US8] The chat's wider scope (owner, 2026-10-16): the rules of `src/ai/chat.ts` answer
  questions about the user's finances, general questions about money and finance, and questions
  about how the app works, from the guide of a new `src/ai/appGuide.ts` sent after the line
  `App guide:` and before the line `Data:`; a request to change something gets that the chat
  cannot and how to do it in the app; general knowledge is marked as such; and
  `financeChat.outOfScope` in `src/ui/messages.ts` names all three ([FR-102](spec.md#fr-102),
  [FR-103](spec.md#fr-103), [FR-109](spec.md#fr-109), [ai.md](contracts/ai.md#finance-chat),
  [R-25](research.md#r-25)). Test first:
  - in `src/ai/appGuide.test.ts`: the guide names every screen of the sidebar, Import, review and
    the profile editor, and the main actions as the app labels them, and holds no line `Data:`;
  - in `src/ai/chat.test.ts`: the instructions hold the rules, then the guide after the line
    `App guide:`, then the data; the rules put the three kinds of question in scope and any
    other out of scope, answer a request to change something with that the chat cannot and how
    to do it, mark general knowledge as general, say about the app only what the guide says, and
    give no sources for an answer that rests on no data;
  - in `src/ui/messages.test.ts`, the fixed answer names the user's finances, finance in general
    and the app;
  - in `e2e/us8-finance-chat.spec.ts`, scenario 11.
- [ ] T108 (Project owner, manual) Set up the key as [AI features](quickstart.md#ai-features)
  describes, turn AI features off and on once to agree to the new warning, check that
  `git status` does not list `.env` and that `dist/` holds no part of the key, and walk the manual
  checks there, including the SC-001 file and the chat. Its commit sets the version to `1.3.0`, and
  the tag `v1.3` goes on the phase's squash commit on `main` (constitution IX).

**Checkpoint**: every task of the phase is done. The phase is a release, v1.3 (constitution IX),
MINOR because v1.2 reads v1.3 storage and backups: the conversation is a second record of the
settings store, which v1.2 does not read, and an optional key of a backup, which v1.2 drops
([R-26](research.md#r-26)). No feature leaves the app as run locally; the hosted copy, which loses
its AI features, serves only checks and demonstrations ([FR-061](spec.md#fr-061),
[FR-105](spec.md#fr-105)). Push and run the post-push check.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup, and blocks every user story.
- **User Story 1 (Phase 3)**: depends on Foundational. Every later story reads its accounts and
  transactions, and later journeys use its form and its Accounts screen.
- **User Stories 2–7 (Phases 4–9)**: in priority order after US1, with these cross-story needs:
  - **US2**: US1 only.
  - **US3**: US1 only.
  - **US4**: US3, because its progress bars live on the Insights screen (T061).
  - **US5**: US1. Its last task (T067) extends the US3 journey.
  - **US6**: US1 for the code. All seven stores exist from T009, so the delete rule for budgets and
    pending rows has no code dependency on US2 or US4. Its journey (T071) uses Budgets, so it needs
    US4.
  - **US7**: US1 for the code. Its round-trip journey (T076) fills every entity type, so it needs US2
    and US4.
- **Polish (Phase 10)**: depends on every story. T079 needs T076 and T078.
- **UI improvements (Phase 11)**: depends on every story, because its changes reach into their
  screens.
- **Category suggestions (Phase 12)**: depends on US2, whose review it fills, and US7, whose
  backup keeps the marks. It follows Phase 11, whose version it raises. Order: T091 → T092 →
  T093 and T094 together → T095 → T096 → T097 → T098 → T100 → T101 → T099.
- **AI through OpenAI, and the finance chat (Phase 13)**: depends on Phase 12, whose suggestions
  it moves to OpenAI; on US3, whose monthly totals the chat sends; and on US7, whose backup keeps
  the conversation. Order: T102 → T103 → T104 → T109 → T106 → T112 → T107 → T114 → T115 → T116 →
  T117 → T118 → T108.
  T105 → T110 → T111 come before T106 at any time, and T113 before T107. T109 comes before the
  chat's tasks, whose store checks `aiFeaturesOn`.

### Within Each Task and Story

- Test first: the named test exists and fails before the code exists.
- Within a story: domain, then files and persistence, then store, then screens, then the journey.
- Each task has two commits on the phase branch: its tests, before any code of the phase, and later
  its code, which turns them green and ticks the task.

### Parallel Opportunities

- **Setup**: run T001–T007 in order. Most of them change `package.json`.
- **Foundational**: T009–T014 together (domain types, names, dates, amounts, and the UI formatters
  and router). Then T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023.
- **US1**: T024 and T025 together.
- **US2**: T034–T040 together, then T041–T044 together. T037 installs Papa Parse, so it is the only
  `package.json` change in its group.
- **US4**: T060 and T061 together, after T059.
- **US5**: T066 and T067 together, after T065.
- **US7**: T072 and T073 together.
- **Polish**: T077 and T078 together.
- **Phase 13**: T105 and T113 together, alongside T102 – T104; T110 follows T105, because both
  write `src/domain/chat.ts`.
- **Ahead of their phase**: the domain modules of later stories depend only on Foundational and on
  T024/T025, so another agent can build them early: T034–T039, T053–T054, T058, T063, T068 and T072.

---

## Parallel Example: User Story 1

```bash
# Domain rules in separate files:
Task: "T024 [US1] Account rules in src/domain/accounts.ts, test-first in src/domain/accounts.test.ts"
Task: "T025 [US1] Category lookups in src/domain/categories.ts, test-first in src/domain/categories.test.ts"
```

## Parallel Example: User Story 2

```bash
# First wave: independent domain, files and fixture work
Task: "T034 [US2] Profile rules in src/domain/import/profiles.ts"
Task: "T035 [US2] Bank dates in src/domain/import/dates.ts"
Task: "T036 [US2] Amount direction in src/domain/import/direction.ts"
Task: "T037 [US2] CSV decoding and tokenising in src/files/csv.ts"   # the only package install
Task: "T038 [US2] Duplicate flags in src/domain/import/duplicates.ts"
Task: "T039 [US2] Vendor groups in src/domain/import/groups.ts"
Task: "T040 [US2] Bank file fixtures in e2e/fixtures/"

# Second wave, once the first is done:
Task: "T041 [US2] Record parsing in src/domain/import/rows.ts"
Task: "T042 [US2] Review edits in src/domain/import/review.ts"
Task: "T043 [US2] Confirm and discard in src/domain/import/confirm.ts"
Task: "T044 [US2] Pending-batch guard in src/persistence/db.ts"
```

## Parallel Example: User Stories 3–7

```bash
# US4, after T059:
Task: "T060 [US4] Budgets screen in src/ui/screens/budgets/BudgetsScreen.tsx"
Task: "T061 [US4] Budget section in src/ui/screens/insights/BudgetSection.tsx"

# US5, after T065:
Task: "T066 [US5] Journey e2e/us5-reconcile.spec.ts"
Task: "T067 [US5] Unaccounted scenarios in e2e/us3-insights.spec.ts"

# US7:
Task: "T072 [US7] Backup file format in src/files/backup.ts"
Task: "T073 [US7] replaceAll in src/persistence/db.ts"
```

## Parallel Example: User Story 8

```bash
# Alongside the transport (T102 – T104):
Task: "T105 [US8] The chat's data in src/domain/chat.ts"
Task: "T113 [US8] Transaction filters from the address in src/ui/app/router.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup, including the owner's Vercel setup (T008).
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. **Stop and validate**: `npm run verify`, then push to `main` and run the
   [post-push check](quickstart.md#after-pushing-to-main) on both deployments.
5. The cash book is usable from here: `npm start`, at `http://localhost:4173`.

### Incremental Delivery

1. Setup and Foundational give a shell that starts safely.
2. US1, the ledger, is the MVP.
3. US2 brings bank import, the highest-risk feature.
4. US3 brings Insights, the product's purpose.
5. US4 brings budgets.
6. US5 brings reconciliation.
7. US6 brings category management.
8. US7 brings backup and restore.
9. Polish: SC-012 messages, performance, and the full manual walkthrough.

After each story: `npm run verify`, a push to `main`, and the post-push check on localhost and Vercel
(constitution, quality gates).

### Parallel Agent Strategy

With several agents: one agent works through the story phases in order, while others build the
domain modules of later stories ahead of time (see Parallel Opportunities). Domain code is pure and
has its own tests, so it can merge before its screens exist.

---

## Notes

- Commit after every task, with a short message about why the step matters, in the style of the
  recent history ([git-history rule](../../.claude/rules/git-history.md)). Tick the task's checkbox
  in the same commit.
- Both research interpretations that filled gaps in the spec were confirmed on 2026-10-02: names
  unique by name key ([R-08](research.md#r-08)) and zero amounts proposed as expenses
  ([R-12](research.md#r-12)) ([plan.md](plan.md#interpretations-to-confirm)).
- `checklists/data-safety.md` was reviewed on 2026-10-02 and passes in full, so the
  `/speckit-implement` checklist gate is open.
