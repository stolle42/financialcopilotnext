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
- For AI features only: an OpenAI API key of your own, of a project with a monthly budget or
  prepaid credit, entered in the app ([AI features](#ai-features))

## Setup

```bash
git clone https://github.com/stolle42/financialcopilotnext.git
cd financialcopilotnext
npm ci
npx playwright install --with-deps chromium firefox   # once per machine, for end-to-end tests
```

## Run

**Users** open the app at `https://financialcopilot-three.vercel.app`, in Chrome, Edge or Firefox,
and keep their real data there ([FR-121](spec.md#fr-121)). Nothing needs installing first; in
Chrome and Edge, **Install app** in the header installs it ([FR-122](spec.md#fr-122)). After the
first visit it works offline, and a newer version waits until the user selects Update in Settings
([FR-123](spec.md#fr-123), [FR-124](spec.md#fr-124)).

**Developers** run it from the project folder:

| Command | Serves | Use |
|---|---|---|
| `npm start` | Production build at `http://localhost:4173`, with its service worker | Checking the production build before a push, with its own data |
| `npm run dev` | Dev server with hot reload at `http://localhost:5173`, without a service worker | Development, with its own test data |

Each address holds data of its own, apart from the web address's; a backup moves data between
them ([FR-121](spec.md#fr-121)). The two ports keep the build's data and development data apart. A browser keeps data per origin, meaning
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
app's own origin that no stand-in answers. That guard is the regression test for
[FR-061](spec.md#fr-061). The tests of the AI features answer at `https://api.openai.com/v1/responses`
and `/v1/models` in OpenAI's place, so no request reaches OpenAI and the checks need no key
([R-31](research.md#r-31)). Playwright blocks service workers, so that the guard and the stand-ins
see every request, except in the specs of [US9](#us9-installable-app) ([R-30](research.md#r-30)).

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
  1. Fill every entity type, including a pending batch with review progress, a conversation of
     the finance chat, and a chosen model, with AI features on and a key stored.
  2. Save a backup.
  3. Open a fresh browser context with empty storage and restore the backup there.
  4. Save again.
- **Expected**: the two files' `data` objects are deep-equal
  ([contracts/backup-file.md](contracts/backup-file.md#exactness-sc-014)), and neither file holds
  the key or its last 4 characters ([FR-126](spec.md#fr-126)).

### US8: Finance chat

- **Run**: `e2e/us8-finance-chat.spec.ts`, with a stand-in answering at
  `https://api.openai.com/v1/responses` in OpenAI's place ([R-26](research.md#r-26),
  [R-31](research.md#r-31)). It runs at the web address too.
- **Covers**: [User Story 8](spec.md#user-story-8) scenarios 1–11
- **Expected**: a source closes the chat and opens the transaction list with its filters, the chat
  opened again there shows the conversation, and it survives a reload.

<a id="us9-installable-app"></a>
### US9: Installable app

- **Run**: `e2e/us9-installable.spec.ts`, with service workers allowed, against the local build
  only, since it publishes a second version ([R-30](research.md#r-30)).
- **Covers**: [User Story 9](spec.md#user-story-9) scenarios 1–8. Of scenario 2, the browser's
  question and the app's own window are [manual checks](#installable-app-checks).
- **Offline** ([SC-018](spec.md#sc-018)): after a first visit, the test cuts the network and
  reloads, in Chromium and Firefox. The Playwright project `offline` runs the specs of US1–US7 in
  Chromium the same way, with the network cut once the service worker controls the page.
- **Update** ([SC-019](spec.md#sc-019)): `e2e/support/versions.ts` serves `dist/`, then a second
  build made with `TEST_APP_VERSION`. With one persistent browser profile, the test closes and opens
  the browser three times, checking the header and the notice each time, then selects Backup and
  Update.
- **Expected**: the header shows the old version until Update, and the new one after it, with
  every record as before; Install app shows only while a `beforeinstallprompt` is kept, and never
  in Firefox.

### US10: Own OpenAI key and model choice

- **Run**: `e2e/us10-own-key.spec.ts`, with stand-ins answering at `/v1/models` and
  `/v1/responses` ([R-31](research.md#r-31)).
- **Covers**: [User Story 10](spec.md#user-story-10) scenarios 1–9.
- **Expected**: the key check sends nothing but the key; every request to OpenAI carries the key
  and the model in use and goes to `https://api.openai.com`; the app's own origin receives nothing
  for an AI feature ([FR-128](spec.md#fr-128)); a refused key shows its message within 10 s and
  stores nothing ([SC-021](spec.md#sc-021)).

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
| [SC-015](spec.md#sc-015) | Restore a generated backup with 5,000 transactions in the last 13 months, turn on AI features, and ask the chat with the stand-in holding its answer; then select Stop | The question and "Thinking…" show within 1 s of sending, and Stop ends the answer within 1 s |
| List render ([R-21](research.md#r-21)) | Restore a generated backup with 10,000 transactions, then open the app | The transaction list shows within 1 s. Skipped: Firefox takes longer ([R-21](research.md#r-21)), and the fix is listed under Not in v1 ([Out of Scope](spec.md#out-of-scope)) |

## Manual checks

These criteria measure a person's time or impression, so a person runs them, with a stopwatch where
noted. Use the app at its web address, or `npm start` before a push, with a fresh browser profile.

| Criterion | Procedure | Pass |
|---|---|---|
| [SC-006](spec.md#sc-006), [SC-013](spec.md#sc-013) | A person who has never seen the app opens it and records "€4.50, Eating out", using only on-screen labels | Done within 2 min, without opening help or settings |
| [SC-002](spec.md#sc-002) | Open the form, then record a categorised cash expense | Under 15 s from opening the form |
| [SC-001](spec.md#sc-001) | With a saved profile that maps a counterparty column, import a generated file of about 300 rows from about 40 vendors and review it until no row is in "Uncategorised" | Under 5 min from choosing the file to confirming |
| [FR-064](spec.md#fr-064), [FR-065](spec.md#fr-065) | Walk every screen at default zoom on a desktop viewport | Clear hierarchy, comfortable spacing, and categories that look the same everywhere |
| [FR-112](spec.md#fr-112) – [FR-116](spec.md#fr-116) | Walk every screen, a dialog, the chat and a notification, on `localhost` and at the web address, beside the reference design at `financialcopilot4you.lovable.app` | The reference's canvas, cards, ink, periwinkle and fonts, as [ui.md](contracts/ui.md#look) lists them; each screen keeps its layout, labels and flows; the browser's network log shows the fonts coming from the app's own origin |
| [FR-117](spec.md#fr-117) | Open the chat, drag its left edge toward the screen and back, then move it with the arrow keys | The edge follows the pointer without lag and stops at 320px and at three quarters of the window; closed and opened again, the chat keeps its width |

`npm run fixtures:sc001` writes the SC-001 file to `tmp/` ([plan.md](plan.md#project-structure)).

<a id="installable-app-checks"></a>
**Installable app**, at the web address with a fresh browser profile:

| Criterion | Procedure | Pass |
|---|---|---|
| [SC-016](spec.md#sc-016) | Give a person who has never used a terminal the address, in Chrome, Edge or Firefox | They are recording a transaction within 1 min, without downloading or setting up anything |
| [SC-017](spec.md#sc-017), [FR-122](spec.md#fr-122) | In Chrome, then in Edge, select Install app and confirm the browser's question | Two selections; the app opens in a window of its own under its name and icon, is listed with the computer's programs, holds the same data as the tab, and offers no Install app |
| [FR-122](spec.md#fr-122) | Open the app in Firefox | No Install app, and the app works as in Chrome |
| [FR-075](spec.md#fr-075) | In Chrome, not installed, open Backup while the browser has not granted persistent storage | The note says that installing the app helps keep the data, with Install app |
| [SC-018](spec.md#sc-018) | Open the installed app once, disconnect the network, close it and open it again; record an expense and save a backup | The app opens with all data, and both work |
| [SC-019](spec.md#sc-019), at each release from v1.6 on | Before publishing, open the app on the old version. Publish, open the app, then close and open it three times, once after restarting the computer; then select Backup, then Update | The header shows the old version and Settings the notice each time; Backup downloads a file; after Update the header shows the new version, the notice is gone, and every record is as before |

<a id="ai-features"></a>
## AI features

**Suggest categories** in review ([FR-090](spec.md#fr-090)) and the **finance chat**
([FR-100](spec.md#fr-100)) ask OpenAI straight from the app, with the user's own key
([R-31](research.md#r-31), [contracts/ai.md](contracts/ai.md)). They need AI features turned on in
Settings with a key that OpenAI accepts ([FR-095](spec.md#fr-095), [FR-127](spec.md#fr-127)).
Everything else works without them. They work wherever the app runs: at the web address,
installed, and on `localhost` ([FR-128](spec.md#fr-128)).

**Once, for each user**:

1. On OpenAI's platform, create an API key. Give its project a monthly budget, or prepaid credit
   without automatic recharge: OpenAI charges the user's own account for every request.
2. In the app, open Settings, turn on AI features, paste the key into the dialog and select
   Turn on. The key stays on this computer and never goes into a backup ([FR-126](spec.md#fr-126)).
3. Each computer, and each address, needs the key entered once.

**Developers updating from v1.5**: delete `.env` from the project folder. Nothing reads it any
more, and no OpenAI key belongs in the project ([FR-128](spec.md#fr-128)). Searching `dist/` for
the first 12 characters of your key finds nothing.

**Key smoke test**, to tell a key problem from an app problem, with the key in the shell for this
command only:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"
```

```powershell
(Invoke-WebRequest -Uri https://api.openai.com/v1/models -Headers @{ Authorization = "Bearer $env:OPENAI_API_KEY" }).StatusCode
```

Expected: `200`. A `401` means OpenAI does not accept the key, as the app's dialog would say.

<a id="model-check"></a>
**Model check**, by the owner, once per model, before a release that lists it
([FR-131](spec.md#fr-131), [R-32](research.md#r-32)):

```bash
OPENAI_API_KEY=<key> DEMO_BACKUP=tmp/demo-backup.json npm run check:models
```

```powershell
$env:OPENAI_API_KEY = "<key>"; $env:DEMO_BACKUP = "tmp/demo-backup.json"; npm run check:models; Remove-Item Env:OPENAI_API_KEY
```

`DEMO_BACKUP` is a backup of the demonstration data. The script prints, per model, the suggestions
right out of 100 and each chat answer beside the facts the app works out. The owner and Claude
judge the answers, and the results and the day's prices go into
[R-32](research.md#r-32). It is not part of `npm test` and never runs in CI.

**Manual checks**, at the web address with your own key, and again on `localhost` before a push:

| Check | Procedure | Pass |
|---|---|---|
| AI features off | Open review, then the chat, with AI features off | Suggest categories is unavailable, and review says it needs AI features, with a link to Settings; the chat says the same and offers nothing to send |
| Dialog | In Settings, turn on AI features, then Cancel | One dialog: the data-sharing warning names OpenAI and says what each feature sends; two or three lines on the key and its cost; a link to OpenAI's API keys page, which opens in a new tab; an empty key field, with Turn on unavailable. Cancel leaves the switch off |
| [SC-021](spec.md#sc-021) | Turn on AI features with the key `sk-not-a-real-key` | Within 10 s: "OpenAI didn't accept this key. Check that you copied all of it.", the field keeps the text, and the switch stays off; reloaded, no key shows |
| [SC-020](spec.md#sc-020) | A person with a key at hand, who has not seen the dialog, turns AI features on | Done within 2 min of opening Settings, guided only by the dialog |
| AI features on | Turn on AI features with your key; reload | The switch stays on, Settings shows `sk-…` and the key's last 4 characters, Remove key and gpt-5.4-mini; the browser's network log shows one request, to `api.openai.com/v1/models` |
| Model | Choose gpt-6.1-sol, open the chat and ask a question | The chat says "Answers by gpt-6.1-sol", and the request in the network log names that model |
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
| Remove key | Select Remove key, then Cancel; then again, and confirm | Cancel keeps the key; confirming turns AI features off, shows no key, and turning them on asks for one |
| Web address | At the web address, ask the chat and select Suggest categories | Answers as on `localhost`; the network log shows requests only to the app's address and to `api.openai.com`, and the key only in requests to `api.openai.com` |
| Leaving | Select Suggest categories, then leave review before the answer; ask the chat, close it and open another screen before the answer, then open the chat again | No row changes, and no message appears later; the chat's answer is there when it is complete |

<a id="release-checklist"></a>
## Release checklist

The steps of a release that can only happen around the merge to `main`. They live here, not in
`tasks.md`, so every task of a phase can be ticked on its branch. The first task of the next phase
checks that each step of this release was done (constitution IX).

| Step | When | Done when |
|---|---|---|
| 1. Old version open | Before the merge | In the browser where the app is installed, the web address shows the previous version in the header, for the [SC-019 check](#installable-app-checks) |
| 2. Merge | When CI is green on the pull request | The phase's pull request is squash-merged into `main` |
| 3. Tag | Right after the merge | The tag `vMAJOR.MINOR` is on the squash commit on `main`, and pushed with `git push origin vMAJOR.MINOR` |
| 4. CI | After the merge | The `test` and `deployed` jobs are green, as [after pushing to main](#after-pushing-to-main) says |
| 5. Checks at the web address | Once the new version is served | The [manual checks](#manual-checks), the [AI features](#ai-features) with the owner's key and the [installable app checks](#installable-app-checks) pass there, with the Update from step 1 |
| 6. Fixes | When a step fails | Each failure is fixed on a new branch, which is released as its own version |

<a id="after-pushing-to-main"></a>
## After pushing to main

The constitution's quality gates ask for both the localhost and the Vercel deployment to be checked
against the user stories after every push to `main` ([R-18](research.md#r-18)).

| Check | How | Passes when |
|---|---|---|
| Local build | CI's `test` job runs every end-to-end journey on the production build, served on `localhost` | The `test` job is green |
| Vercel deployment | Once Vercel reports a production deployment, CI's `deployed` job waits until the production domain serves the pushed commit, then runs the same journeys there | The `deployed` job is green |
| User experience | A person walks the [manual checks](#manual-checks) on `http://localhost:4173` (`npm start`) and on the Vercel production domain | Every row passes on both; the [installable app checks](#installable-app-checks) at the web address only |

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
   branch is `main`. The production domain is `financialcopilot-three.vercel.app`.
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

**Never rename the Vercel project or change its production domain.** The production domain is
where users keep their real data, and a browser keeps data per address: at a new address the app
would open empty for every user, and their installed apps would stop updating
([FR-121](spec.md#fr-121), [R-20](research.md#r-20)). Every push to `main` reaches users, so a
change that is not ready stays on a branch; a version takes effect for a user only when they select
Update ([FR-124](spec.md#fr-124)). No environment variable holds an OpenAI key
([FR-128](spec.md#fr-128)).
