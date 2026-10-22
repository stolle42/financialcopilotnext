# Implementation Plan: Financial Copilot v1 — Personal Finance Tracker

**Branch**: `001-finance-tracker-v1`, with commits on `main` as for the spec | **Date**: 2026-10-01 |
**Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-finance-tracker-v1/spec.md`

## Summary

v1 is a single-user personal finance tracker ([spec](spec.md)): a hand-kept ledger, bank CSV import
with review by vendor, Insights charts, monthly budgets, reconciliation, category management and
file backup.

It is built as a client-only TypeScript single-page app.

- **UI and build**: React with shadcn/ui components, styled by Tailwind CSS and built by Vite.
- **State**: the whole state is held in memory, and the browser's IndexedDB keeps the durable copy
  ([R-01](research.md#r-01), [R-05](research.md#r-05)).
- **Business rules**: every rule lives in a dependency-free domain layer of pure functions. The store
  layer calls the domain, writes the resulting changes to storage atomically, and only then updates
  the screen ([R-06](research.md#r-06), [R-16](research.md#r-16)).
- **Bank files**: decoded with `TextDecoder` and split into records with Papa Parse. Mapping,
  parsing and duplicate flagging are domain rules ([contracts/csv-import.md](contracts/csv-import.md)).
- **Backups**: one JSON file ([contracts/backup-file.md](contracts/backup-file.md)).
- **AI features**: category suggestions in review (v1.2) and a finance chat on every screen (v1.3)
  ask OpenAI, and only while the user has turned AI features on ([contracts/ai.md](contracts/ai.md),
  [R-24](research.md#r-24), [R-25](research.md#r-25)). From v1.6 the app asks
  `api.openai.com` itself, with the user's own key, checked before it is stored, and the model the
  user chose ([R-31](research.md#r-31), [R-32](research.md#r-32)). Answers stream back, and the
  chat's conversation is stored with the rest of the data ([R-26](research.md#r-26)).
- **Look** (v1.4): the reference design's palette, cards and fonts, with the fonts bundled
  ([contracts/ui.md](contracts/ui.md#look), [R-27](research.md#r-27)).
- **Resizable chat** (v1.4): a separator on the finance chat's edge sets its width, which stays in
  memory ([contracts/ui.md](contracts/ui.md#finance-chat), [R-28](research.md#r-28)).
- **Installable app** (v1.5): a manifest and a service worker of our own make the app installable
  and let it open offline. A newer version waits until the user selects Update in Settings
  ([contracts/app-updates.md](contracts/app-updates.md), [R-30](research.md#r-30)).
- **Getting started** (v1.7): Import creates an account in place and proposes a new bank CSV
  format from the file, by column names and content, in a pure domain function, and every import
  finds the column names below any lines of account details
  ([contracts/csv-import.md](contracts/csv-import.md#proposing-a-format), [R-33](research.md#r-33),
  [R-34](research.md#r-34), [R-35](research.md#r-35)). The finance chat explains itself while AI features are off and opens
  the key dialog of Settings ([R-36](research.md#r-36)). A screen FAQ shows twelve questions from
  one constant, which the guide to the app holds too ([R-37](research.md#r-37)). Every screen gets
  a sentence, new terms an explanation, and "profile" becomes "bank CSV format" in what the user
  reads ([R-38](research.md#r-38)).
- **Tests**: Vitest and Playwright, run in the existing GitHub Actions workflow
  ([R-17](research.md#r-17), [R-18](research.md#r-18)).
- **Deployment**: Vercel deploys every push to `main` as a static site, at
  `https://financialcopilot-three.vercel.app`. From v1.5 that address is where users run the app
  and keep their data, so it never changes. `npm start` is for developers
  ([R-20](research.md#r-20), [R-30](research.md#r-30), [quickstart.md](quickstart.md#run)).

## Technical Context

**Language/Version**: TypeScript 6.0 (`~6.0.3`), strict, compiled for current browsers. Node.js 24
LTS (at least 24.13.1) runs the tooling only ([R-02](research.md#r-02)).

**Primary Dependencies**: the latest stable versions on 2026-10-01. Ranges are caret on these
versions, and `package-lock.json` pins exact builds.

The app is built on two frameworks, React and Tailwind CSS. Development adds three more: Vite,
Vitest and Playwright. Everything else is a library or a lint tool. The shadcn/ui components are
source copied into the repo, not a dependency, and the router and the store are small modules of
our own (constitution II; [R-03](research.md#r-03), [R-04](research.md#r-04),
[R-05](research.md#r-05), [R-17](research.md#r-17)).

| Dependency | Version | Used for |
|---|---|---|
| React | 19.3 | UI ([R-03](research.md#r-03)) |
| Tailwind CSS, with `@tailwindcss/vite` | 4.3 | Styling ([R-03](research.md#r-03)) |
| `shadcn`: CLI and base stylesheet, with `class-variance-authority` 0.7, `cn` 0.4 and `tw-animate-css` 1.4 | 4.21 | Copying in components, and the helpers they use ([R-03](research.md#r-03)) |
| Base UI (`@base-ui/react`) | 1.8 | Accessible primitives under the components ([R-03](research.md#r-03)) |
| `lucide-react` | 1.49 | Icons |
| `@fontsource-variable/figtree` and `@fontsource-variable/fraunces` | 5.3 | The text and heading fonts, bundled (v1.4, [R-27](research.md#r-27)) |
| Recharts, with its `react-is` peer | 3.8, as pinned by shadcn's chart component | Charts ([R-14](research.md#r-14)) |
| `idb` | 8.0 | IndexedDB ([R-06](research.md#r-06)) |
| Papa Parse, with `@types/papaparse` 5.5 | 5.7 | CSV ([R-09](research.md#r-09)) |
| zod | 4.6 | Validating backups and the AI's answers ([R-13](research.md#r-13), [R-24](research.md#r-24)) |

| Dev dependency | Version |
|---|---|
| Vite, with `@vitejs/plugin-react` 6.1, and `@types/node` for `vite.config.ts` | 8.3 |
| Vitest | 5.0 |
| `fake-indexeddb` | 6.2 |
| Playwright | 1.63 |
| ESLint, with typescript-eslint 8.71 and `eslint-plugin-react-hooks` 7.1 | 10.11 |
| Prettier | 3.9 |
| dependency-cruiser | 18.5 |

These dev dependencies serve [R-16](research.md#r-16) and [R-17](research.md#r-17). v1.5, v1.6
and v1.7 add no dependency: the service worker and its Vite plugin are code of our own, the app
asks OpenAI with `fetch`, and FAQ uses the browser's own `<details>` ([R-30](research.md#r-30),
[R-31](research.md#r-31), [R-37](research.md#r-37)).

**Storage**: IndexedDB in the user's browser profile, through `idb`
([data-model.md](data-model.md#storage-layout)). The finance chat's conversation is a second
record in the settings store, so the schema stays at version 1 and v1.2 still opens it
([R-26](research.md#r-26)). The user's OpenAI key (v1.6) is a third record there, outside the
settings, so a backup never holds it ([data-model.md](data-model.md#openai-key)). Backups are JSON
files ([contracts/backup-file.md](contracts/backup-file.md)). The service worker keeps the app's
files in Cache Storage, apart from the data ([contracts/app-updates.md](contracts/app-updates.md#caches)).

**Testing**: Vitest covers domain unit tests and store integration tests against `fake-indexeddb`,
both in Node. Playwright covers everything in the browser, both UI behaviour and end-to-end
journeys, on the production build in Chromium and Firefox. Service workers are blocked in every
spec but `e2e/us9-installable.spec.ts`, and a project `offline` runs the journeys of User Stories
1–7 in Chromium without a network ([R-30](research.md#r-30)). All of it runs in GitHub Actions
([R-17](research.md#r-17), [R-18](research.md#r-18)).

**Target Platform**: Current desktop Chrome, Edge and Firefox. Users open the app at its Vercel
address, and in Chrome and Edge can install it from there; Firefox runs it in a tab
([R-20](research.md#r-20), [R-30](research.md#r-30)). Developers serve it from `localhost`
([R-01](research.md#r-01)).

**Project Type**: Client-only single-page web application, installable, with no backend. From
v1.6 no server of the project's takes part in the AI features ([FR-128](spec.md#fr-128),
[R-31](research.md#r-31)).

**Performance Goals**:

- Insights within 2 s with 5,000 transactions in the period ([SC-009](spec.md#sc-009)).
- A 5,000-row CSV in review within 10 s ([SC-010](spec.md#sc-010)).
- The transaction list's first render within 1 s at 10,000 transactions
  ([R-21](research.md#r-21)). Firefox takes longer, so its fix is listed under Not in v1
  ([Out of Scope](spec.md#out-of-scope)) and the check is skipped until then.
- The finance chat shows a question with "Thinking…", and Stop ends an answer, each within 1 s with
  5,000 transactions in the months a question sends ([SC-015](spec.md#sc-015),
  [R-26](research.md#r-26)).

**Constraints**:

- No network use, and no request from the browser outside the app's origin, but to
  `https://api.openai.com` for the AI features the user asks for with AI features on, and for the
  key check. The CSP allows exactly that origin ([FR-061](spec.md#fr-061),
  [R-19](research.md#r-19), [R-31](research.md#r-31)).
- The key never leaves the browser but to OpenAI, never enters a backup, and no screen shows it
  whole ([FR-126](spec.md#fr-126)).
- A newer version never replaces the running one without Update, and the files and messages
  between page and worker stay compatible from version to version
  ([FR-124](spec.md#fr-124), [contracts/app-updates.md](contracts/app-updates.md#compatibility)).
- Money in integer euro cents and dates as local calendar strings ([R-08](research.md#r-08)).
- Every change that touches several records is atomic ([R-06](research.md#r-06)).
- One running tab ([R-07](research.md#r-07)).
- Desktop viewport only ([Out of Scope](spec.md#out-of-scope)).
- The Vercel project is never renamed and its production domain never changes: the data lives in
  that origin ([quickstart.md](quickstart.md#vercel-setup)).

**Scale/Scope**: One user in one browser profile. The design point is 10,000 transactions, several
years of use, with headroom to about 50,000. There are 9 stored entity types and 12 screens, FAQ
(v1.7) included ([data-model.md](data-model.md), [contracts/ui.md](contracts/ui.md)).

Nothing in this context remains marked NEEDS CLARIFICATION: every open technical question is
resolved in [research.md](research.md).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The check is against the constitution as amended on 2026-10-01, including the new post-push
quality gate.

| Principle | How this plan complies | Before research | After design |
|---|---|---|---|
| I. Single Source of Truth | The design documents link to spec requirements instead of restating them. Package versions appear only in this plan, and message wording only in `src/ui/messages.ts`. Interpretations of the spec are recorded once, in research, and marked to be moved into the spec | Pass | Pass |
| II. KISS | No backend, API or server process: from v1.6 the app asks OpenAI itself. The whole state lives in memory. No virtualisation, translations or dark mode. Offline use (v1.5) is one service worker of about 100 lines of our own, with no dependency, which caches the build's files and nothing else ([R-30](research.md#r-30)). The app is built on two frameworks (React, Tailwind CSS), with three for development (Vite, Vitest, Playwright), each replacing far more code than it costs. shadcn/ui components are added one at a time, when a task first needs them. The router and the store are small modules of our own ([R-03](research.md#r-03), [R-04](research.md#r-04), [R-05](research.md#r-05), [R-17](research.md#r-17)). Each library replaces code we would otherwise write ([R-06](research.md#r-06), [R-09](research.md#r-09), [R-13](research.md#r-13)) | Pass | Pass |
| III. DRY | No shared abstraction is planned ahead. The one shared path, parsing for both import and preview, has two real uses from the start ([contracts/csv-import.md](contracts/csv-import.md#pipeline)) | Pass | Pass |
| IV. SOLID | No interfaces: storage code is tested against `fake-indexeddb` instead of behind a repository interface ([R-06](research.md#r-06)). The clock and ids are passed in as values ([R-05](research.md#r-05)). There is one domain module per business area | Pass | Pass |
| V. Clean Architecture | `src/domain` imports nothing outside itself. Files, persistence, store and UI all depend inward. dependency-cruiser checks this in CI ([R-16](research.md#r-16)) | Pass | Pass |
| VI. Clean Code | ESLint (typescript-eslint and the React hooks rules) and Prettier run in CI, on strict TypeScript ([R-02](research.md#r-02), [R-16](research.md#r-16)) | Pass | Pass |
| VII. Test-Driven Development | Tests are written first for every task, at four levels, all in the existing CI workflow. The workflow also runs on pull requests ([R-17](research.md#r-17), [R-18](research.md#r-18)) | Pass | Pass |
| VIII. User Experience & Defensive Error Handling | shadcn/ui components on Tailwind CSS give a consistent, modern UI ([R-03](research.md#r-03)). Every refusal has a code and a plain-language message ([contracts/ui.md](contracts/ui.md#message-catalogue)). A failed save leaves the state unchanged and says so. A startup failure, a second tab and an unexpected error each have their own message ([R-07](research.md#r-07), [R-15](research.md#r-15)) | Pass | Pass |

| Quality gate | Enforced by |
|---|---|
| All tests pass, and new behaviour has a test that fails without it | The CI workflow ([R-18](research.md#r-18)), and test-first ordering in `tasks.md` |
| No business-rule module imports framework, UI or persistence code | `npm run check:architecture` in CI ([R-16](research.md#r-16)) |
| No duplicated documentation or speculative abstraction | Review against this plan. Documents link to their source and do not restate it |
| Expected error paths are handled and show a clear message | The message catalogue, and `e2e/messages.spec.ts` for [SC-012](spec.md#sc-012) |
| After a push to `main`, the localhost and Vercel deployments are checked against the user stories | CI's `test` job on the local build, CI's `deployed` job on the Vercel deployment, and a manual walkthrough on both ([R-18](research.md#r-18), [quickstart.md](quickstart.md#after-pushing-to-main)) |

**Result**: the plan passes every principle and gate, both before research and after design, the
design of v1.5, v1.6 and v1.7 included. No deviation needs justifying.

**v1.7** adds no dependency, process, object store or field, so it is a MINOR release
([data-model.md](data-model.md#storage-layout)). Each principle holds for it:

- **I**: FAQ's text exists once, in `src/ai/faq.ts`, for both the screen and the guide; the column
  names of a proposal exist once, in [csv-import.md](contracts/csv-import.md#column-names), which
  the code follows ([R-33](research.md#r-33), [R-37](research.md#r-37)).
- **II**: the proposal reads only what the spec lists, with no presets of banks; FAQ is native
  `<details>` with no Markdown renderer ([R-33](research.md#r-33), [R-37](research.md#r-37)).
- **III**: the key dialog and the account dialog are each shared because a second screen now
  uses them, not ahead of it ([R-35](research.md#r-35), [R-36](research.md#r-36)).
- **V**: the proposal and the sign hint are pure domain functions; only the encoding, a matter of
  bytes, sits in `src/files` ([R-33](research.md#r-33)).
- **VII**: the proposal is tested first against fixtures of real layouts with made-up rows
  ([R-34](research.md#r-34)), and User Story 11 gets its journey ([quickstart.md](quickstart.md#us11-getting-started)).
- **VIII**: everything v1.7 adds serves this principle, the screens' sentences and FAQ most
  directly.

**v1.3** added a route of our own to the local server, which passed the AI features' requests on
to OpenAI with the key from `.env`: a partial deviation from KISS's "no server process"
([R-24](research.md#r-24)). **v1.6** removes it. The app asks `api.openai.com` itself with the
user's key, so the project runs no server, holds no key and has no `.env`
([R-31](research.md#r-31)). The browser now reaches one origin outside the app's own, which the CSP
names ([R-19](research.md#r-19)).

**v1.5** adds a manifest, a service worker and a Vite plugin, all of our own, and no dependency.
`vite-plugin-pwa` was weighed and would not be simpler: its worker takes over by itself once every
window is closed, against [FR-124](spec.md#fr-124), and its worker would be ours anyway
([R-30](research.md#r-30)). The worker's caches and messages are a contract kept from version to
version ([contracts/app-updates.md](contracts/app-updates.md)), so they are tested like the backup
format. v1.5 and v1.6 add no object store, and the database keeps schema version 1, so each is a
MINOR release ([data-model.md](data-model.md#storage-layout)).

The chat's streamed answers, Stop, sources and stored conversation, which the owner asked for on
2026-10-16, need no further deviation: no dependency, process or object store is added, and the
database keeps schema version 1, so v1.3 stays a MINOR release ([R-26](research.md#r-26)).

### Interpretations to confirm

None remain. The two that filled gaps in the spec were confirmed on 2026-10-02 and are now
recorded there: names unique by name key ([R-08](research.md#r-08)) and zero amounts proposed as
expenses ([R-12](research.md#r-12) item 1).

The limitations v1 accepts knowingly, such as bank files whose date cells hold a time, are listed
in [R-22](research.md#r-22).

## Project Structure

### Documentation (this feature)

```text
specs/001-finance-tracker-v1/
├── spec.md              # The feature specification
├── plan.md              # This file
├── research.md          # Phase 0: technical decisions R-01 – R-38
├── data-model.md        # Phase 1: entities, invariants, storage layout, seed data
├── quickstart.md        # Phase 1: how to run and validate v1
├── contracts/
│   ├── csv-import.md    # Bank CSV files → pending batch
│   ├── backup-file.md   # Backup file format, version 1
│   ├── ai.md            # AI features: the app ↔ OpenAI, the key check, failures (v1.6)
│   ├── app-updates.md   # The installable app: emitted files, the worker's caches and messages (v1.5)
│   └── ui.md            # Screens, navigation, shared patterns, message catalogue
└── tasks.md             # Phase 2: written by /speckit-tasks, not by this command
```

### Source Code (repository root)

```text
.github/workflows/regressiontests.yml  # The existing CI workflow: jobs `test` and `deployed` (R-18)
.nvmrc                                 # Node.js 24 LTS (R-02)
.dependency-cruiser.cjs                # src/domain imports nothing outside itself (R-16)
eslint.config.js
.prettierrc.json
index.html                             # Links the manifest; the production build adds the CSP (R-19), commit (R-18) and app-build (R-30) meta tags
package.json, package-lock.json
playwright.config.ts                   # Chromium and Firefox against `vite preview`, or BASE_URL (R-17)
components.json                        # shadcn/ui: Base UI, aliases into src/ui/ (R-03)
tsconfig.json, tsconfig.app.json, tsconfig.node.json  # `@/*` alias via `paths` alone (R-03)
vite.config.ts                         # Tailwind and worker plugins, base "./", strict ports, Vitest settings (R-20)
public/manifest.webmanifest            # Name, start URL, display, colours and icons (R-30)
public/icons/                          # icon-192.png, icon-512.png, icon-maskable-512.png (R-30)
worker/serviceWorker.js                # The service worker: caches, build in use, messages (R-30)
worker/plugin.ts                       # Emits sw.js with the build's header, and app-build into index.html (R-30)
scripts/check-models.ts                # npm run check:models: each listed model on the demonstration data (R-32)

src/
├── main.tsx              # Start-up: lock, open storage, load state, render (R-07, R-15)
├── domain/               # Business rules: pure TypeScript, importing nothing outside src/domain
│   ├── types.ts          # The entities of data-model.md
│   ├── dates.ts          # Calendar dates, months, period presets
│   ├── names.ts          # Name keys and uniqueness
│   ├── seed.ts           # First-launch data
│   ├── amounts.ts        # The amount grammar, shared by CSV import and the amount field (R-03)
│   ├── accounts.ts       # Balances, account rules, reconciliation
│   ├── transactions.ts   # Validation, kind changes, list order and filters
│   ├── categories.ts     # Category rules, effects of deletion
│   ├── budgets.ts        # Limits and progress
│   ├── insights.ts       # Aggregates for a period
│   ├── chat.ts           # The data a finance chat question sends, and the conversation's turns
│   │                     # and sources (R-25, R-26)
│   ├── invariants.ts     # The state invariants of data-model.md
│   └── import/           # Profile checks, date parsing, rows, duplicates, vendor groups,
│                         # review edits, confirmation; propose.ts proposes a new bank CSV
│                         # format and the sign hint (v1.7, R-33)
├── files/                # Boundary formats: CSV bytes → records (TextDecoder, Papa Parse), and
│                         # the encoding a file is proposed with (R-33); backup JSON in and out
│                         # (zod, configured once in zod.ts)
├── ai/                   # The one network boundary: talks to api.openai.com with the user's key,
│                         # the key check, the models (models.ts), and each AI feature's prompt
│                         # and answer (R-24, R-25, R-31, R-32); the guide to the app and FAQ's
│                         # text (faq.ts), which the guide and the FAQ screen share (v1.7, R-37)
├── pwa/                  # The page's side of the worker: updates.ts registers it and compares
│                         # versions, install.ts keeps the install question (R-30)
├── persistence/          # IndexedDB: schema, seeding, loading, atomic writes (idb)
├── store/                # In-memory state and actions: decide in the domain, write, then apply;
│                         # proposeFormat joins encoding, records and proposal (v1.7, R-33)
└── ui/                   # React, shadcn/ui and Tailwind CSS
    ├── app/              # Shell, hash router (R-04), CSPProvider (R-19), error boundary
    ├── components/
    │   ├── ui/           # shadcn/ui components, copied in by its CLI; our code from then on
    │   └── …             # The shared patterns of contracts/ui.md, such as the amount field, and
    │                     # from v1.7 KeyDialog and ScreenIntro (R-36, R-38)
    ├── lib/utils.ts      # shadcn's `cn` class-name helper
    ├── index.css         # Tailwind entry, theme tokens, fonts and the card utility (R-27)
    ├── screens/          # One folder per screen of contracts/ui.md, faq/ included (v1.7)
    ├── format.ts         # The one amount formatter and the one date formatter
    └── messages.ts       # The one message catalogue

e2e/
├── fixtures/             # Small CSV files (quickstart.md); banks/ holds the exports of five
│                         # banks, rebuilt with made-up rows (v1.7, R-34)
├── support/              # Network guard, data generators, backup helpers, versions.ts for builds
│                         # of another version (R-30)
├── ui/                   # UI behaviour specs, one per screen of contracts/ui.md (R-17)
└── *.spec.ts             # One journey per user story, plus messages and performance;
                          # us9-installable.spec.ts alone runs with a service worker
```

Tests for `src/` sit next to the module they test, as in `src/domain/accounts.test.ts`.

**`package.json` scripts**:

| Script | What it runs |
|---|---|
| `start` | Build, then preview on port 4173 |
| `dev` | Dev server on port 5173 |
| `build` | Production build |
| `lint` | ESLint and Prettier check |
| `check:architecture` | dependency-cruiser |
| `typecheck` | TypeScript type check |
| `test` | Vitest |
| `test:e2e` | Build, then Playwright |
| `verify` | Every check, in CI order |
| `fixtures:sc001` | Writes the SC-001 file to `tmp/` |
| `check:models` | Each listed model on the demonstration data, with `OPENAI_API_KEY` and `DEMO_BACKUP` from the environment; not part of `test` or CI (R-32) |

**`.gitignore` gains**: `node_modules/`, `dist/`, `coverage/`, `test-results/`,
`playwright-report/`, `blob-report/`, `tmp/` and `.env*`. From v1.6 nothing reads `.env` and no
`.env.example` exists; `.env*` stays ignored so that an old key on a developer's computer stays out
of git. A fresh clone needs only `npm ci`, and each user enters their own key in the app
(portable-checkout rule).

**Structure Decision**: one project at the repository root, with each folder in `src/` a layer.
Dependencies point inward:

- `ui` depends on `store` and on `domain`, for types and pure derivations.
- `store` depends on `persistence`, `files`, `ai` and `domain`.
- `pwa` depends on nothing in `src/`; `ui` uses it for Install app and the update notice.
- `ai` depends on `files`, for zod, and on `domain`, for types only.
- `persistence` and `files` depend on `domain`, for types only.
- `domain` depends on nothing.

The UI reaches storage only through the store. The domain rule is the one automated check
([R-16](research.md#r-16)), because it is the constitution's gate. There is no `backend/` or
`frontend/` split, because the app has no server of its own; v1.6 removes `server/`
([R-01](research.md#r-01), [R-31](research.md#r-31)). `worker/` is build input, not a layer: the
browser runs the worker apart from the page, and the page talks to it only by the messages of
[contracts/app-updates.md](contracts/app-updates.md#messages).

## Complexity Tracking

v1.0 and v1.1 had no deviation to justify. v1.2 added one, a hosted n8n workflow, which v1.3
replaced with a route of its own in the local server, passing the AI features' requests on to
OpenAI with the key from `.env` ([R-24](research.md#r-24)). v1.6 removes that route: the app asks
OpenAI itself with the user's key ([R-31](research.md#r-31)). v1.5's service worker is code of our
own with no dependency and needs no deviation ([Constitution Check](#constitution-check)). v1.7
needs none either.

No deviation remains to justify.
