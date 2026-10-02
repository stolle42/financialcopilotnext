# Quickstart: validating Financial Copilot v1

**Plan**: [plan.md](plan.md) · **Spec**: [spec.md](spec.md)

This guide covers how to run the app and how to show that v1 works end to end. Automated checks
come first; the criteria only a person can judge follow. Commands are the `package.json` scripts
defined during implementation ([plan.md](plan.md#project-structure)).

## Prerequisites

- Node.js 24 LTS, version 24.13.1 or later, and the npm that ships with it
  ([R-02](research.md#r-02))
- A current desktop Chrome, Edge or Firefox ([R-01](research.md#r-01))
- Git
- For the post-push check only: a Vercel project for this repository
  ([Vercel setup](#vercel-setup))

## Setup

```bash
git clone https://github.com/stolle42/financialcopilotnext.git
cd financialcopilotnext
npm ci
npx playwright install --with-deps chromium firefox   # once per machine, for end-to-end tests
```

## Run

| Command | Serves | Use |
|---|---|---|
| `npm start` | Production build at `http://localhost:4173` | Daily use with real data |
| `npm run dev` | Dev server with hot reload at `http://localhost:5173` | Development, with its own test data |

The two ports keep real data and development data apart. A browser keeps data per origin, meaning
scheme, host and port. Both ports are fixed and fail instead of moving if they are taken, so the
app never opens empty on another port ([R-20](research.md#r-20)).

Always open the app at exactly `http://localhost:4173`. The address `127.0.0.1:4173` reaches the
same server, but it is a different origin, with separate and empty data.

**Expected on first start**: the transaction list opens with an empty state
([FR-063](spec.md#fr-063)), and Accounts shows "Cash" at €0.00
([User Story 1](spec.md#user-story-1) scenario 1).

## Automated checks

Each command must pass locally and in CI ([R-18](research.md#r-18)).

| Command | Proves |
|---|---|
| `npm run lint` | ESLint and Prettier report nothing (constitution VI) |
| `npm run check:architecture` | No business-rule module imports framework, UI or persistence code (constitution V, [R-16](research.md#r-16)) |
| `npm run typecheck` | TypeScript strict mode compiles cleanly |
| `npm test` | Domain unit and store integration tests pass (Vitest, [R-17](research.md#r-17)) |
| `npm run test:e2e` | Builds, then runs the UI behaviour specs in `e2e/ui/` and the journeys below in Chromium and Firefox (Playwright) |
| `npm run verify` | All of the above, in the order CI runs them |

Every end-to-end test runs behind a network guard that fails the test on any request outside the
app's own origin. That guard is the regression test for [FR-061](spec.md#fr-061).

## Validation scenarios

Each user story's *Independent Test* in the spec is automated as one end-to-end spec file. Small
fixtures live in `e2e/fixtures/`. Large data sets are generated during the test run and never
committed. Tests that need existing data load it through the backup restore
([contracts/backup-file.md](contracts/backup-file.md)), a path that real users take too.

### US1: Ledger

- **Run**: `e2e/us1-ledger.spec.ts`
- **Covers**: [User Story 1](spec.md#user-story-1) scenarios 1–12
- **Expected**: balances match [FR-002](spec.md#fr-002) after every step
  ([SC-005](spec.md#sc-005)), and recording a transfer changes no spending or income figure
  ([SC-004](spec.md#sc-004)).

### US2: CSV import

- **Run**: `e2e/us2-import.spec.ts`
- **Covers**: [User Story 2](spec.md#user-story-2) scenarios 1–16

| Fixture | Shape | Exercises |
|---|---|---|
| `mybank-2026-08.csv` | Signed amount, `;` delimiter, `,` decimals, `DD.MM.YYYY`, Windows-1252, counterparty column | New profile, vendor groups (including a vendor with purchases and a refund, and rows without a counterparty), a credit-card payment to mark as transfer, an unparsable row, an identical same-day pair |
| `mybank-2026-09.csv` | Same layout; its first week overlaps the August file | Profile reuse, duplicates, [SC-003](spec.md#sc-003) |
| `debit-credit.csv` | Debit and credit columns, `,` delimiter, `.` decimals, `MM/DD/YYYY`, UTF-8, no counterparty. The unused column is blank in some rows and `0.00` in others | Debit/credit mode, zero counting as empty, rows with an amount in both columns or in neither, ungrouped review |
| `positive-purchases.csv` | Purchases as positive numbers | Sign inversion |
| `mybank-renamed-column.csv` | A mapped header renamed | Missing-columns refusal |
| `header-only.csv` | Header and no data | "No transactions" refusal |

- **Expected**:
  - Re-importing August after confirming it adds zero transactions with the review defaults
    ([SC-003](spec.md#sc-003)).
  - A pending batch survives a page reload with its review progress intact
    ([FR-022](spec.md#fr-022)).

### US3: Insights

- **Run**: `e2e/us3-insights.spec.ts`
- **Data**: a restored backup with three months of transactions, transfers, and both kinds of
  reconciliation entry.
- **Covers**: [User Story 3](spec.md#user-story-3) scenarios 1–7
- **Expected**: every chart total equals the sum of the period's non-transfer transactions, and
  "Unaccounted" shows its hatched segment.

### US4: Budgets

- **Run**: `e2e/us4-budgets.spec.ts`
- **Covers**: [User Story 4](spec.md#user-story-4) scenarios 1–6
- **Expected**: the over-limit bar carries its state marker, which the test asserts without
  reading any number ([SC-011](spec.md#sc-011)).

### US5: Reconcile

- **Run**: `e2e/us5-reconcile.spec.ts`
- **Covers**: [User Story 5](spec.md#user-story-5) scenarios 1–4

### US6: Categories

- **Run**: `e2e/us6-categories.spec.ts`
- **Covers**: [User Story 6](spec.md#user-story-6) scenarios 1–5

### US7: Backup and restore

- **Run**: `e2e/us7-backup.spec.ts`
- **Covers**: [User Story 7](spec.md#user-story-7) scenarios 1–3
- **Round trip** ([SC-014](spec.md#sc-014)):
  1. Fill every entity type, including a pending batch with review progress.
  2. Save a backup.
  3. Open a fresh browser context with empty storage and restore the backup there.
  4. Save again.
- **Expected**: the two files' `data` objects are deep-equal
  ([contracts/backup-file.md](contracts/backup-file.md#exactness-sc-014)).

### Messages

- **Run**: `e2e/messages.spec.ts`
- **Covers**: triggers every refusal that [SC-012](spec.md#sc-012) lists once
- **Expected**: a plain-language message for each, as in
  [contracts/ui.md](contracts/ui.md#message-catalogue).

### Performance

- **Run**: `e2e/performance.spec.ts`

| Check | Setup | Expected |
|---|---|---|
| [SC-009](spec.md#sc-009) | Restore a generated backup with 5,000 transactions in one period, then choose that period | All Insights sections render within 2 s |
| [SC-010](spec.md#sc-010) | Import a generated 5,000-row CSV | The review is shown within 10 s |
| List render ([R-21](research.md#r-21)) | Restore a generated backup with 10,000 transactions, then open the app | The transaction list shows within 1 s |

## Manual checks

These criteria measure a person's time or impression, so a person runs them, with a stopwatch where
noted. Use `npm start` with a fresh browser profile.

| Criterion | Procedure | Pass |
|---|---|---|
| [SC-006](spec.md#sc-006), [SC-013](spec.md#sc-013) | A person who has never seen the app opens it and records "€4.50, Eating out", using only on-screen labels | Done within 2 min, without opening help or settings |
| [SC-002](spec.md#sc-002) | Open the form, then record a categorised cash expense | Under 15 s from opening the form |
| [SC-001](spec.md#sc-001) | With a saved profile that maps a counterparty column, import a generated file of about 300 rows from about 40 vendors and review it until no row is in "Uncategorised" | Under 5 min from choosing the file to confirming |
| [FR-064](spec.md#fr-064), [FR-065](spec.md#fr-065) | Walk every screen at default zoom on a desktop viewport | Clear hierarchy, comfortable spacing, and categories that look the same everywhere |

`npm run fixtures:sc001` writes the SC-001 file to `tmp/` ([plan.md](plan.md#project-structure)).

## After pushing to main

The constitution's quality gates ask for both the localhost and the Vercel deployment to be checked
against the user stories after every push to `main` ([R-18](research.md#r-18)).

| Check | How | Passes when |
|---|---|---|
| Local build | CI's `test` job runs every end-to-end journey on the production build, served on `localhost` | The `test` job is green |
| Vercel deployment | Once Vercel reports a production deployment, CI's `deployed` job runs the same journeys on the production domain | The `deployed` job is green |
| User experience | A person walks the [manual checks](#manual-checks) on `http://localhost:4173` (`npm start`) and on the Vercel production domain | Every row passes on both |

To run the journeys against the production domain by hand, set `BASE_URL`:

```bash
BASE_URL=https://<production-domain> npx playwright test
```

```powershell
$env:BASE_URL = "https://<production-domain>"; npx playwright test
```

### Vercel setup

The project owner does this once ([R-20](research.md#r-20)):

1. In the Vercel dashboard, import the GitHub repository. Vercel detects Vite, and the production
   branch is `main`.
2. Under Settings → General → Vercel Toolbar, set **Preview** to Off.
3. Under Settings → Deployment Protection, keep Standard Protection or turn protection off. Do not
   choose All Deployments, which would put the production domain behind a login
   ([R-18](research.md#r-18)).
4. Leave Web Analytics and Speed Insights disabled ([FR-061](spec.md#fr-061)).
5. In the GitHub repository, under Settings → Secrets and variables → Actions → Variables, add
   `VERCEL_PRODUCTION_URL`, holding the production domain with `https://`.

Use the Vercel copy for checks and demonstrations only, and keep real data in the local build
([FR-061](spec.md#fr-061)).
