---

description: "Task list for Financial Copilot v1"
---

# Tasks: Financial Copilot v1 — Personal Finance Tracker

**Input**: Design documents from `specs/001-finance-tracker-v1/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Required. Constitution VII makes every behaviour test-first, and the
[plan](plan.md#constitution-check) applies that to every task. Each task names its test file. Write
the test, run it and see it fail for the expected reason, write the smallest code that passes, then
refactor. Test and code are committed together, so every commit on `main` stays green.

**Organization**: Phases 1 and 2 build the shared base. Phases 3–9 follow the user stories in
priority order. Each story phase ends with that story's end-to-end journey from
[quickstart.md](quickstart.md#validation-scenarios).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel with the neighbouring [P] tasks, because it touches different files
  and depends on no unfinished task. A task that installs a package changes `package.json`, so run
  only one such task at a time.
- **[Story]**: US1 … US7, the [user stories](spec.md#user-scenarios) of the spec.
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
- [ ] T008 (Project owner, manual) Set up Vercel as
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

- [ ] T024 [P] [US1] Account rules in `src/domain/accounts.ts`, test-first in
  `src/domain/accounts.test.ts`.
  - `signedEffect(transaction, accountId)` follows [derived values](data-model.md#derived-values),
    and `accountBalance(state, accountId)` follows [FR-002](spec.md#fr-002).
  - `createAccount(state, input, ctx)` and `updateAccount(state, id, input)` refuse
    `account-name-empty` and `account-name-taken` (by name key, [FR-001](spec.md#fr-001),
    [R-08](research.md#r-08)), or return changes. The opening balance is in cents, of any sign.
  - `sortAccounts(accounts)` follows the [list order](contracts/ui.md#shared-patterns).
  - Tests include the balances of [User Story 1](spec.md#user-story-1) scenarios 2–4 and 10, and a
    transaction moved to another account changing both balances ([edge cases](spec.md#edge-cases)).
- [ ] T025 [P] [US1] Category lookups in `src/domain/categories.ts`, test-first in
  `src/domain/categories.test.ts`. `protectedCategory(categories, side, role)` finds a category by
  role, never by name ([data-model.md](data-model.md#category)). `sortCategories(categories, side)`
  returns the side's set in the [list order](contracts/ui.md#shared-patterns), and
  `pickerCategories(categories, side)` returns the same without "Unaccounted"
  ([FR-030](spec.md#fr-030)).
- [ ] T026 [US1] Form drafts and kind changes in `src/domain/transactions.ts`, test-first in
  `src/domain/transactions.test.ts`. A draft holds the amount as cents, or `null` when the text does
  not parse.
  - `newDraft(state, today)` has the defaults of [FR-014](spec.md#fr-014) and the default account of
    [FR-006](spec.md#fr-006).
  - `changeKind(draft, kind, categories)` follows [FR-015](spec.md#fr-015).
  - `changeAccount(draft, accountId)` clears a destination that equals the new account
    ([transaction form](contracts/ui.md#transaction-form)).
  - Depends on T025.
- [ ] T027 [US1] Saving and deleting transactions in `src/domain/transactions.ts`, test-first in
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
- [ ] T028 [US1] List order and filters in `src/domain/transactions.ts`, test-first in
  `src/domain/transactions.test.ts`. `listTransactions(transactions, filters)` sorts newest first,
  with `seq` breaking ties between equal dates. It filters by account, including transfers into that
  account, and by category ([FR-016](spec.md#fr-016), [data-model.md](data-model.md#transaction)).
- [ ] T029 [US1] Account and transaction actions in `src/store/accounts.ts` and
  `src/store/transactions.ts`, test-first in `src/store/accounts.test.ts` and
  `src/store/transactions.test.ts`. Each action is a thin wrapper that passes a function from T024 or
  T027 to `run`. Tests: a new account and a saved transaction survive reopening the database,
  including `settings.manualEntryAccountId`, and a refusal writes nothing. Depends on T019, T024,
  T027.
- [ ] T030 [US1] The Accounts screen in `src/ui/screens/accounts/AccountsScreen.tsx` and
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
- [ ] T031 [US1] The transaction form in `src/ui/screens/transactions/TransactionForm.tsx`,
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
- [ ] T032 [US1] The Transactions screen in `src/ui/screens/transactions/TransactionsScreen.tsx`,
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
- [ ] T033 [US1] The journey `e2e/us1-ledger.spec.ts`, as [quickstart.md](quickstart.md#us1-ledger)
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

- [ ] T034 [P] [US2] Profile rules in `src/domain/import/profiles.ts`, test-first in
  `src/domain/import/profiles.test.ts`. `saveProfile(state, profile, ctx)` refuses
  `profile-name-empty`, `profile-name-taken`, and `profile-columns-incomplete` with the unassigned
  roles among date, amount and description ([FR-021](spec.md#fr-021),
  [mapping profile](data-model.md#mapping-profile)). Add `deleteProfile(state, id)`. Tests include
  that neither function touches a pending batch.
- [ ] T035 [P] [US2] Bank dates in `src/domain/import/dates.ts`, test-first in
  `src/domain/import/dates.test.ts`. `parseBankDate(text, format)` returns `YYYY-MM-DD` or `null` for
  every format of [csv-import.md](contracts/csv-import.md#date-formats). Test one- and two-digit days
  and months, `YY` read as 20YY, impossible dates, and extra text.
- [ ] T036 [P] [US2] Amount direction in `src/domain/import/direction.ts`, test-first in
  `src/domain/import/direction.test.ts`. `readAmount(cells, amountMapping, decimalSeparator)` returns
  signed cents or a failure code. It follows [direction](contracts/csv-import.md#direction) step by
  step for both modes, applies sign inversion in signed mode only, and returns zero as 0, which is
  then proposed as an expense ([R-12](research.md#r-12)).
- [ ] T037 [P] [US2] CSV decoding and tokenising in `src/files/csv.ts`, test-first in
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
- [ ] T038 [P] [US2] Duplicate flags in `src/domain/import/duplicates.ts`, test-first in
  `src/domain/import/duplicates.test.ts`. `flagDuplicates(rows, accountId, transactions)` follows
  [duplicate matching](contracts/csv-import.md#duplicate-matching), using a hash of account, date
  and signed effect and reusing `signedEffect` from T024 ([FR-024](spec.md#fr-024)). Tests: every case
  of [R-10](research.md#r-10); a purchase and its same-day refund, which are not flagged; different
  descriptions, which are still flagged; and unparsable rows, which are ignored.
- [ ] T039 [P] [US2] Vendor groups in `src/domain/import/groups.ts`, test-first in
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
- [ ] T040 [P] [US2] Bank file fixtures in `e2e/fixtures/`, one per row of the
  [quickstart table](quickstart.md#us2-csv-import). Add a `.gitattributes` entry that marks
  `e2e/fixtures/*.csv` as binary, so the bytes and line endings survive every checkout. Write
  `mybank-2026-08.csv` as Windows-1252 bytes, for example with a short `node -e` script using
  `Buffer`, with at least one `0x80` "€" and one umlaut. Each file holds only the rows its exercise
  needs.
- [ ] T041 [P] [US2] Record parsing in `src/domain/import/rows.ts`, test-first in
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
- [ ] T042 [P] [US2] Review edits in `src/domain/import/review.ts`, test-first in
  `src/domain/import/review.test.ts`. `assignRow`, `assignGroup` (every row currently in the group)
  and `includeDuplicate` (flagged rows only) each return changes to the batch.
  - A category must belong to the row's side and must not be "Unaccounted".
  - A transfer's counter-account must exist and differ from the batch account.
  - Turning the transfer off restores the side's "Uncategorised".

  This follows [FR-023](spec.md#fr-023), [FR-025](spec.md#fr-025), [FR-026](spec.md#fr-026) and
  [review](contracts/ui.md#review). Tests: scenarios 4, 5 and 7. Depends on T039.
- [ ] T043 [P] [US2] Confirm and discard in `src/domain/import/confirm.ts`, test-first in
  `src/domain/import/confirm.test.ts`.
  - `confirmBatch(state, ctx)` turns each row under review into a transaction by the
    [confirmation table](data-model.md#state-transitions), with absolute amounts and consecutive
    `seq` values in file order. It removes the batch, leaves `settings` alone
    ([FR-006](spec.md#fr-006), [FR-027](spec.md#fr-027)), and reports the count.
  - `discardBatch(state)` removes the batch only.
  - Tests: scenarios 7, 9 and 10; a transfer in each direction; and excluded duplicates and
    unparsable rows, which are left out.
- [ ] T044 [P] [US2] The pending-batch guard in `src/persistence/db.ts`, test-first in
  `src/persistence/db.test.ts`. `writeChanges` accepts a `requireNoPendingBatch` option. It re-checks
  inside the same transaction, and aborts with `import-batch-pending` when a batch exists
  ([pipeline](contracts/csv-import.md#pipeline) step 8, [R-06](research.md#r-06)).
- [ ] T045 [US2] Batch creation in `src/domain/import/batch.ts`, test-first in
  `src/domain/import/batch.test.ts`.
  - `canStartImport(state)` refuses `import-batch-pending` ([FR-022](spec.md#fr-022)).
  - `createBatch(state, { accountId, profile, fileName, createdAt, records }, ctx)` refuses
    `import-account-missing` and the layout refusals of T041. Otherwise it returns changes that hold
    a batch whose parsed rows carry their duplicate flag, `included = !duplicate`, and the side's
    "Uncategorised" ([pending row](data-model.md#pending-row), [FR-029](spec.md#fr-029)).
  - Depends on T038, T041.
- [ ] T046 [US2] Import actions in `src/store/import.ts`, test-first in `src/store/import.test.ts`.
  - Actions: `saveProfile` and `deleteProfile`; `importFile({ accountId, profile, fileName, bytes })`,
    which runs `canStartImport` before decoding, then `decodeFile`, `tokenise` and `createBatch`, and
    writes with the guard of T044 (`run` passes the option through); the review edits of T042, each
    written at once ([R-05](research.md#r-05)); `confirmBatch`; and `discardBatch`.
  - Tests: a batch keeps its review progress across reopening the database
    ([FR-022](spec.md#fr-022)); a second import is refused; a failing confirmation leaves both the
    ledger and the batch unchanged; and editing or deleting the profile leaves the batch unchanged
    ([FR-021](spec.md#fr-021)).
  - Depends on T037, T042–T045.
- [ ] T047 [US2] The profile editor in `src/ui/screens/import/ProfileEditor.tsx` and
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
- [ ] T048 [US2] The Import screen in `src/ui/screens/import/ImportScreen.tsx`, test-first in
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
- [ ] T049 [US2] The review header and drawers in `src/ui/screens/import/ReviewScreen.tsx`,
  test-first in `e2e/ui/review.spec.ts` ([review](contracts/ui.md#review)).
  - Add the route `#/import/review`. With no batch pending, it shows an empty state that leads to
    Import.
  - The header shows the account, the file and the three counts.
  - The duplicates drawer has an **Include** switch on each row. The unparsable drawer shows the row
    number, the raw cells and the reason (`npx shadcn add sheet`).
  - Tests: [User Story 2](spec.md#user-story-2) scenarios 8 and 11.
- [ ] T050 [US2] Review groups and assignments in `src/ui/screens/import/ReviewGroups.tsx` and
  `src/ui/screens/import/AssignmentControl.tsx`, test-first in `e2e/ui/review.spec.ts`.
  - Show the collapsed groups, largest first, then the plain rows.
  - A group header shows the vendor, side, count and total, with the group's assignment control.
    Unfolding a group shows one control per row.
  - The control reuses `CategorySelect` and adds a **Transfer** switch with a counter-account select.
  - Every change is saved at once.
  - Tests: scenarios 4–7 and 16, and assignments surviving a reload ([FR-022](spec.md#fr-022)).
- [ ] T051 [US2] The review footer in `src/ui/screens/import/ReviewScreen.tsx`, test-first in
  `e2e/ui/review.spec.ts`. **Discard** asks for confirmation. **Confirm N transactions** opens a modal
  that states N ([FR-027](spec.md#fr-027)). Once confirmed, a notification reports what was added and
  Transactions opens. Add the notification's wording to `src/ui/messages.ts`. Tests: scenarios 9
  and 10.
- [ ] T052 [US2] The journey `e2e/us2-import.spec.ts`, as
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

- [ ] T053 [US3] Periods in `src/domain/dates.ts`, test-first in `src/domain/dates.test.ts`.
  `periodPreset(name, today)` covers the five presets of [insights](contracts/ui.md#insights).
  `daysInPeriod(period)` counts both ends ([R-14](research.md#r-14)). Add the month helpers that the
  spending line needs. Tests run across month ends, year ends and leap days.
- [ ] T054 [US3] Insights aggregates in `src/domain/insights.ts`, test-first in
  `src/domain/insights.test.ts` ([R-14](research.md#r-14), [FR-051](spec.md#fr-051),
  [FR-052](spec.md#fr-052)). `insights(state, period)` returns:
  - the spending line: one point per day up to 92 days, otherwise one per month, with empty buckets
    as zero;
  - an expense breakdown and an income breakdown: amount and share per category, sorted by amount,
    with the side's total, and "Unaccounted" (found by role) marked as unknown.

  Tests: [User Story 3](spec.md#user-story-3) scenarios 1–6, and an added transfer that changes no
  figure ([FR-012](spec.md#fr-012), [SC-004](spec.md#sc-004)). Depends on T053.
- [ ] T055 [US3] The Insights period and spending line in
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
- [ ] T056 [US3] The category breakdowns in `src/ui/screens/insights/CategoryBreakdown.tsx`,
  test-first in `e2e/ui/insights.spec.ts`. Each side gets a donut with our own legend of chip, amount
  and share, titled with the side's total. "Unaccounted" is filled with an SVG hatch pattern from the
  chart's `<defs>` and marked "unknown" in the legend ([R-14](research.md#r-14),
  [FR-052](spec.md#fr-052)). Each section has its own empty state. Tests: legend order and totals,
  "Uncategorised" as its own entry, and the empty states ([User Story 3](spec.md#user-story-3)
  scenarios 5 and 6).
- [ ] T057 [US3] The journey `e2e/us3-insights.spec.ts`. With `setToday`, it enters about three
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

- [ ] T058 [US4] Budget rules in `src/domain/budgets.ts`, test-first in
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
- [ ] T059 [US4] Budget actions in `src/store/budgets.ts`, test-first in `src/store/budgets.test.ts`:
  `setLimit` and `removeLimit`, through `run`. Test: both survive reopening the database.
- [ ] T060 [P] [US4] The Budgets screen in `src/ui/screens/budgets/BudgetsScreen.tsx`, test-first in
  `e2e/ui/budgets.spec.ts` ([budgets](contracts/ui.md#budgets)). Add the route `#/budgets` and its
  sidebar entry. Each budgetable category gets a row with its chip, an `AmountField` limit saved on
  Enter or on blur, and **Remove** once a limit is set. Add `budget-limit-invalid` to
  `src/ui/messages.ts`. Tests: [User Story 4](spec.md#user-story-4) scenario 4 (income and protected
  categories are absent); saving both ways; 0.00 refused under the field; and Remove.
- [ ] T061 [P] [US4] The budget section of Insights in `src/ui/screens/insights/BudgetSection.tsx`,
  test-first in `e2e/ui/insights.spec.ts` (section 3 of [insights](contracts/ui.md#insights)). It
  shows one bar per budgeted category for `budgetMonth(period)`, labelled with that month. An
  over-limit bar uses the danger colour, an alert icon, the label "Over limit" and a
  `data-state="over-limit"` attribute for tests ([SC-011](spec.md#sc-011)). With no budgets, the
  section links to Budgets. Tests: the month label for a three-month period, the over-limit marker,
  and the empty state.
- [ ] T062 [US4] The journey `e2e/us4-budgets.spec.ts`, as
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

- [ ] T063 [US5] Reconciliation in `src/domain/accounts.ts`, test-first in
  `src/domain/accounts.test.ts`. `reconcile(state, accountId, statedCents, ctx)` follows
  [FR-005](spec.md#fr-005). It finds the side's "Unaccounted" by role, dates the entry `today`,
  leaves `settings` unchanged ([FR-006](spec.md#fr-006)), and refuses `reconcile-already-matches`.
  Tests: [User Story 5](spec.md#user-story-5) scenarios 1–4, and negative balances.
- [ ] T064 [US5] The reconcile action in `src/store/accounts.ts`, test-first in
  `src/store/accounts.test.ts`: `reconcile`, through `run`. Test: the booked transaction survives
  reopening the database.
- [ ] T065 [US5] The reconcile dialog in `src/ui/screens/accounts/ReconcileDialog.tsx`, with a
  **Reconcile** action on every row of `src/ui/screens/accounts/AccountsScreen.tsx`, test-first in
  `e2e/ui/accounts.spec.ts` ([accounts](contracts/ui.md#accounts)).
  - The dialog's `AmountField` allows negative amounts.
  - A booked difference shows a notification such as "Booked an expense of €15.00 to Unaccounted". A
    matching balance shows `reconcile-already-matches` in the dialog. Add both wordings to
    `src/ui/messages.ts`.
  - Also extend `e2e/ui/transaction-form.spec.ts`: editing a reconciliation entry shows
    "Unaccounted" as the value, never as an option, and saves
    ([transaction form](contracts/ui.md#transaction-form)).
- [ ] T066 [P] [US5] The journey `e2e/us5-reconcile.spec.ts`, as
  [quickstart.md](quickstart.md#us5-reconcile) describes: scenarios 1–4.
- [ ] T067 [P] [US5] "Unaccounted" in Insights, added to `e2e/us3-insights.spec.ts`. These are
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

- [ ] T068 [US6] Category management in `src/domain/categories.ts`, test-first in
  `src/domain/categories.test.ts`.
  - `createCategory`, `renameCategory` and `recolourCategory` refuse `category-name-empty`, and
    `category-name-taken` within a side ([FR-032](spec.md#fr-032)). Colours are `#rrggbb`.
  - `deletionImpact(state, id)` gives the transaction count and whether a budget is removed.
  - `deleteCategory(state, id)` refuses `category-protected` ([FR-033](spec.md#fr-033)). Otherwise it
    moves the category's transactions and pending rows to the side's "Uncategorised" and removes its
    budget ([FR-034](spec.md#fr-034), [state transitions](data-model.md#state-transitions),
    [R-12](research.md#r-12) item 4).
  - Tests: [User Story 6](spec.md#user-story-6) scenarios 3–5, and renaming a protected category.
- [ ] T069 [US6] Category actions in `src/store/categories.ts`, test-first in
  `src/store/categories.test.ts`: create, rename, recolour and delete, through `run`. Tests: a
  deletion changes the transactions, the budget and the pending batch in one storage transaction,
  and a failing deletion changes none of them ([R-06](research.md#r-06)).
- [ ] T070 [US6] The Categories screen in `src/ui/screens/categories/CategoriesScreen.tsx`, with the
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
- [ ] T071 [US6] The journey `e2e/us6-categories.spec.ts`: scenarios 1–5. Scenario 2 checks the new
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

- [ ] T072 [P] [US7] The backup file format in `src/files/backup.ts`, test-first in
  `src/files/backup.test.ts` ([backup-file.md](contracts/backup-file.md), [R-13](research.md#r-13)).
  Install zod.
  - `serializeBackup(state, exportedAt)` writes the file, and `backupFileName(today)` names it.
  - `parseBackup(text)` runs validation steps 1–3 of
    [loading](contracts/backup-file.md#loading-fr-071-fr-072), with a zod schema for each entity of
    [data-model.md](data-model.md#entities). It refuses `backup-not-a-backup`, `backup-newer-version`
    or `backup-damaged`, the last with structured details (the record and field at fault) for the UI
    to word.
  - Tests: a round trip is deep-equal; each refusal; and a transaction without a date is named.
- [ ] T073 [P] [US7] Replacing all data in `src/persistence/db.ts`, test-first in
  `src/persistence/db.test.ts`. `replaceAll(db, state)` clears every store and writes every record in
  one transaction ([loading](contracts/backup-file.md#loading-fr-071-fr-072) step 4). Test: a failing
  write leaves the old data.
- [ ] T074 [US7] Backup actions in `src/store/backup.ts`, test-first in `src/store/backup.test.ts`.
  - `createBackup()` returns the file's text and name, and writes nothing ([FR-070](spec.md#fr-070)).
  - `prepareRestore(text)` runs `parseBackup`, then `checkInvariants`, turning a broken invariant
    into `backup-damaged` (step 4).
  - `restore(validState)` runs `replaceAll`, then reloads the in-memory state from storage.
  - Tests: an invalid file leaves the data unchanged ([FR-072](spec.md#fr-072)), and a restore
    followed by a save gives the same `data` ([SC-014](spec.md#sc-014)).
  - Depends on T072, T073.
- [ ] T075 [US7] The Backup screen in `src/ui/screens/backup/BackupScreen.tsx`, test-first in
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
- [ ] T076 [US7] Backup helpers in `e2e/support/backup.ts`, and the journey `e2e/us7-backup.spec.ts`
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

- [ ] T077 [P] The messages spec `e2e/messages.spec.ts` ([quickstart.md](quickstart.md#messages)). It
  triggers each refusal that [SC-012](spec.md#sc-012) lists, once each. For each one, it checks that
  the wording from `src/ui/messages.ts` appears where [shared patterns](contracts/ui.md#shared-patterns)
  places it.
- [ ] T078 [P] Data generators in `e2e/support/generate.ts`: a backup of n transactions inside a given
  period, and a bank CSV of n rows across m vendors with a counterparty column. Add
  `e2e/support/write-sc001.ts`, which writes the [SC-001](spec.md#sc-001) file (about 300 rows from
  about 40 vendors) to `tmp/`, and the `fixtures:sc001` script that runs it with Node's built-in type
  stripping ([manual checks](quickstart.md#manual-checks)).
- [ ] T079 The performance spec `e2e/performance.spec.ts` ([quickstart.md](quickstart.md#performance)):
  [SC-009](spec.md#sc-009), [SC-010](spec.md#sc-010) and the 1-second list render of
  [R-21](research.md#r-21). Each check uses generated data from T078, restored or imported with the
  helpers of T076. Depends on T076, T078.
- [ ] T080 Validate a fresh checkout. Clone the repository into a new folder, then run `npm ci` and
  every command of [automated checks](quickstart.md#automated-checks), and fix whatever fails. This
  covers the portable-checkout rule and [quickstart.md](quickstart.md#setup).
- [ ] T081 (Project owner, manual) Walk the [manual checks](quickstart.md#manual-checks) on
  `http://localhost:4173` and on the Vercel production domain, and confirm that CI's `test` and
  `deployed` jobs are green ([after pushing to main](quickstart.md#after-pushing-to-main)).

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

### Within Each Task and Story

- Test first: the named test exists and fails before the code exists.
- Within a story: domain, then files and persistence, then store, then screens, then the journey.
- Each task is one commit, with the test and the code together.

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
- One research interpretation is built as written but not yet confirmed in the spec: zero amounts
  proposed as expenses ([R-12](research.md#r-12)). Confirm it with `/speckit-clarify` before T036
  ([plan.md](plan.md#interpretations-to-confirm)). Names unique by name key
  ([R-08](research.md#r-08)) were confirmed on 2026-10-02.
- `checklists/data-safety.md` was reviewed on 2026-10-02 and passes in full, so the
  `/speckit-implement` checklist gate is open.
