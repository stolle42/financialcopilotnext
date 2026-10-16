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
- For AI features only: an OpenAI API key, of a project with a monthly budget or prepaid credit
  ([AI features](#ai-features))

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
app's own origin. That guard is the regression test for [FR-061](spec.md#fr-061). The tests of
the AI features answer at `/api/ai` in OpenAI's place, and the guard also fails a request there
that no test answers, so the checks need no key ([R-24](research.md#r-24)).

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
  1. Fill every entity type, including a pending batch with review progress and, where AI
     features can be on, a conversation of the finance chat.
  2. Save a backup.
  3. Open a fresh browser context with empty storage and restore the backup there.
  4. Save again.
- **Expected**: the two files' `data` objects are deep-equal
  ([contracts/backup-file.md](contracts/backup-file.md#exactness-sc-014)).

### US8: Finance chat

- **Run**: `e2e/us8-finance-chat.spec.ts`, with a stand-in answering at `/api/ai` in OpenAI's place
  ([R-26](research.md#r-26)). On a hosted copy only scenario 1 runs ([FR-106](spec.md#fr-106)).
- **Covers**: [User Story 8](spec.md#user-story-8) scenarios 1–11
- **Expected**: a source closes the chat and opens the transaction list with its filters, the chat
  opened again there shows the conversation, and it survives a reload.

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
| [SC-015](spec.md#sc-015) | Restore a generated backup with 5,000 transactions in the last 13 months, turn on AI features, and ask the chat with the stand-in holding its answer; then select Stop | The question and "Thinking…" show within 1 s of sending, and Stop ends the answer within 1 s. Skipped on a hosted copy |
| List render ([R-21](research.md#r-21)) | Restore a generated backup with 10,000 transactions, then open the app | The transaction list shows within 1 s. Skipped: Firefox takes longer ([R-21](research.md#r-21)), and the fix is listed under Not in v1 ([Out of Scope](spec.md#out-of-scope)) |

## Manual checks

These criteria measure a person's time or impression, so a person runs them, with a stopwatch where
noted. Use `npm start` with a fresh browser profile.

| Criterion | Procedure | Pass |
|---|---|---|
| [SC-006](spec.md#sc-006), [SC-013](spec.md#sc-013) | A person who has never seen the app opens it and records "€4.50, Eating out", using only on-screen labels | Done within 2 min, without opening help or settings |
| [SC-002](spec.md#sc-002) | Open the form, then record a categorised cash expense | Under 15 s from opening the form |
| [SC-001](spec.md#sc-001) | With a saved profile that maps a counterparty column, import a generated file of about 300 rows from about 40 vendors and review it until no row is in "Uncategorised" | Under 5 min from choosing the file to confirming |
| [FR-064](spec.md#fr-064), [FR-065](spec.md#fr-065) | Walk every screen at default zoom on a desktop viewport | Clear hierarchy, comfortable spacing, and categories that look the same everywhere |
| [FR-112](spec.md#fr-112) – [FR-116](spec.md#fr-116) | Walk every screen, a dialog, the chat and a notification, on `localhost` and on the hosted copy, beside the reference design at `financialcopilot4you.lovable.app` | The reference's canvas, cards, ink, periwinkle and fonts, as [ui.md](contracts/ui.md#look) lists them; each screen keeps its layout, labels and flows; the browser's network log shows the fonts coming from the app's own origin |

`npm run fixtures:sc001` writes the SC-001 file to `tmp/` ([plan.md](plan.md#project-structure)).

<a id="ai-features"></a>
## AI features

**Suggest categories** in review ([FR-090](spec.md#fr-090)) and the **finance chat**
([FR-100](spec.md#fr-100)) ask OpenAI through the route `/api/ai` that the local server adds
([R-24](research.md#r-24), [contracts/ai.md](contracts/ai.md#route)). They need an OpenAI key in
`.env` and AI features turned on in Settings ([FR-095](spec.md#fr-095)). Everything else works
without them. A hosted copy has no such route, so there AI features cannot be turned on
([FR-106](spec.md#fr-106)).

**Once**:

1. On OpenAI's platform, create a project for Financial Copilot and an API key in it. Give the
   project a monthly budget, or prepaid credit without automatic recharge
   ([R-24](research.md#r-24)).
2. Copy `.env.example` to `.env` in the project folder and put the key after `OPENAI_API_KEY=`.
   Git ignores `.env`: `git status` must not list it.
3. Restart `npm start` or `npm run dev`. The server reads the key when it starts.
4. After updating from v1.2 with AI features on, turn them off and on once in Settings, and read
   the warning: v1.3 sends to OpenAI, and the chat sends amounts and dates
   ([FR-095](spec.md#fr-095)).

**Smoke test**, with `npm start` running:

```bash
curl -s -X POST http://localhost:4173/api/ai \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-6.1-sol","store":false,"input":"Answer with OK."}'
```

```powershell
$body = '{"model":"gpt-6.1-sol","store":false,"input":"Answer with OK."}'
Invoke-RestMethod -Method Post -ContentType application/json -Body $body -Uri http://localhost:4173/api/ai
```

Expected: OpenAI's answer, with `"status": "completed"`. The same request with
`-H "Origin: https://example.com"` gets 403, and without a key in `.env` an empty 404. The key is
not in the build: searching `dist/` for its first characters finds nothing.

**Manual checks**, with `npm start` and the key in `.env`:

| Check | Procedure | Pass |
|---|---|---|
| AI features off | Open review, then the chat, with AI features off | Suggest categories is unavailable, and review says it needs AI features, with a link to Settings; the chat says the same and offers nothing to send |
| Warning | In Settings, turn on AI features, then Cancel | The data-sharing warning names OpenAI and says what each feature sends; Cancel leaves the switch off |
| AI features on | Turn on AI features again and select Turn on; reload | The switch stays on, and nothing was sent |
| Suggestions | Import a bank file with a counterparty column, then select Suggest categories in review | Rows get categories marked "Suggested", transfers such as a standing order to savings stay "Uncategorised", and the status line counts the rows |
| [SC-001](spec.md#sc-001) file | The same with the SC-001 file of about 300 rows | The answer arrives within 2 minutes |
| Mark | Change one suggested row, reload, then confirm | The changed row loses its mark, the other marks survive the reload, and the ledger holds the categories |
| Chat button | Open each screen of the sidebar, then Import, and scroll each to its end | The chat button shows at the bottom right of each, in the colour of Add transaction, with its icon and name, and no content stays under it |
| Chat example | With data that holds a subscription whose price rose, open the chat and select "Which of my subscriptions have become more expensive?" | The answer names that subscription, its old and new amount and the month of the change |
| Streaming | Ask "How can I reduce my spending?" | "Thinking…" shows until the first words, then the answer grows as it is written |
| Sources | Select a source under that answer, then open the chat again | The chat closes and Transactions opens with the source's category and dates as filters, and the rows add up to what the answer says; the conversation is still there |
| Stop | Ask "Where did I spend more this month than last month?" and select Stop while the answer is written | The answer ends at once, marked "Stopped", and its text so far stays |
| Chat follow-up | Ask "And which one costs the most?" | The answer refers to the subscriptions of the earlier answer |
| Missing data | Ask "Did I spend more on travel than in 2024?" | The answer says that the data does not reach back to 2024, and gives no figure for it |
| Out of scope | Ask "What is the capital of France?" | The chat's fixed answer, naming what it can help with, then the example questions |
| Follow-ups | Look under any complete answer, and select one of its follow-up questions | One to three follow-up questions show under the latest answer only; the one selected is sent at once |
| App question | Ask "How do I import a bank file?" | Steps that match the Import screen, with no sources |
| Change request | Ask "Set my groceries budget to €300." | The chat says that it cannot change anything and explains how to set the limit on Budgets; no budget changes |
| General finance | Ask "What is an emergency fund?" | An explanation marked as general, with no figure that the data does not hold |
| Chat kept | Close the chat and open it again; then open Budgets, open the chat there, and reload | The conversation is still there each time |
| Clear | Select Clear conversation, then Cancel; then again, and confirm | Cancel keeps the conversation; confirming empties it and shows the example questions |
| Offline | Disconnect from the internet, then ask the chat and select Suggest categories | `ai-unreachable` in both, and nothing changes |
| No key | Empty `OPENAI_API_KEY` in `.env`, restart `npm start`, then ask the chat | `ai-unreachable` |
| Hosted copy | On the Vercel production domain, open Settings | The AI features switch is off and unavailable, and the line beside it says to run the app locally |
| Leaving | Select Suggest categories, then leave review before the answer; ask the chat, close it and open another screen before the answer, then open the chat again | No row changes, and no message appears later; the chat's answer is there when it is complete |

## After pushing to main

The constitution's quality gates ask for both the localhost and the Vercel deployment to be checked
against the user stories after every push to `main` ([R-18](research.md#r-18)).

| Check | How | Passes when |
|---|---|---|
| Local build | CI's `test` job runs every end-to-end journey on the production build, served on `localhost` | The `test` job is green |
| Vercel deployment | Once Vercel reports a production deployment, CI's `deployed` job waits until the production domain serves the pushed commit, then runs the same journeys there | The `deployed` job is green |
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
4. Under Settings → Environment Variables, keep **Enable access to System Environment Variables**
   checked. Builds then receive the commit id, which the `deployed` job waits for
   ([R-18](research.md#r-18)).
5. Leave Web Analytics and Speed Insights disabled ([FR-061](spec.md#fr-061)).
6. In the GitHub repository, under Settings → Secrets and variables → Actions → Variables, add
   `VERCEL_PRODUCTION_URL`, holding the production domain with `https://`.

Use the Vercel copy for checks and demonstrations only, and keep real data in the local build
([FR-061](spec.md#fr-061)).
