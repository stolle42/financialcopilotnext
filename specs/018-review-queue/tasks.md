# Tasks: Review queue (v1.8)

**Input**: Design documents from `specs/018-review-queue/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: written first, for every user story, before any code task
([constitution](../../.specify/memory/constitution.md), test-first). Phase 2 holds the tests of
all five stories; T194 runs them and checks that each fails for the right reason. Only then do the
code phases start, and they run without stopping.

**Organization**: the code phases follow the user stories in priority order, US12 – US16, so each
story can be built and checked on its own once the foundation is done. Task IDs continue after
001's T159 ([.claude/rules/specs.md](../../.claude/rules/specs.md)).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story the task belongs to, US12 – US16
- Paths are from the repository root

**Scope**: [User Story 12](spec.md#user-story-12) – [User Story 16](spec.md#user-story-16) of
v1.8: transfers between the user's own accounts are suggested in review and confirmed as one
transfer, vendors start in their usual category or transfer, review is worked through with the
keyboard while the current and seen items stand out, small amounts are set aside, and every
category picker searches as the user types and creates a category in place
([FR-142](spec.md#fr-142) – [FR-160](spec.md#fr-160), [R-39](research.md#r-39) –
[R-46](research.md#r-46)). The owner asked for it after v1.7, on 2026-11-14. No new dependency.
Every new stored field is optional: the database schema stays 1 and the backup format stays 1, so
v1.7 and v1.8 read each other's data ([R-39](research.md#r-39),
[data-model.md](data-model.md#storage-layout)).

Every fixture holds made-up rows only, and generated data is written by the test run and never
committed ([R-46](research.md#r-46)).

---

## Phase 1: Setup

**Purpose**: check the previous release, and add the component and the test data that the tests
of Phase 2 need.

- [X] T160 (Project owner, with Claude) Check that every step of v1.7's
  [release checklist](../001-finance-tracker-v1/quickstart.md#release-checklist) was done: the
  v1.7 pull request squash-merged into `main`, the tag `v1.7` on that squash commit and pushed,
  CI's `test` and `deployed` jobs green, and the manual checks, the
  [AI features](../001-finance-tracker-v1/quickstart.md#ai-features) and the
  [installable app checks](../001-finance-tracker-v1/quickstart.md#installable-app-checks), the
  Update from v1.6 included, walked at the web address. Each step not done is done now, and this
  task records what was found.

  Found: merged and tag `v1.7` pushed on `main`'s head. CI on `main` was red once, from the
  Firefox run of `e2e/us3-insights.spec.ts` (a 5 s heading check timed out); the same test passed
  on the pull request, so the failed jobs were re-run. The manual checks at the web address are the
  owner's to walk.
- [X] T161 [P] Add shadcn/ui's combobox with its CLI (`npx shadcn@latest add combobox`) as
  `src/ui/components/ui/combobox.tsx`, built on the `Combobox` of `@base-ui/react`, which is
  already a dependency, so `package.json` gains no package ([R-43](research.md#r-43),
  [001 R-03](../001-finance-tracker-v1/research.md#r-03)). Nothing uses it yet; `npm run lint`
  and `npm run typecheck` pass.
- [X] T162 [P] Two fixtures of one month in the layout of `e2e/fixtures/mybank-2026-10.csv`, made-up
  rows only ([quickstart.md](quickstart.md#validation-scenarios), [R-46](research.md#r-46)):
  - `e2e/fixtures/checking-2026-10.csv`: 5 payments to the card; a sixth paid 5 days before the
    card books it; one whose card side carries a 1.50 fee; 50.00 to a shop; "Geldautomat"
    withdrawals; coffees under 1.00; interest of 0.12;
  - `e2e/fixtures/card-2026-10.csv`: the 5 payments received 0 to 4 days after Checking booked
    them; the sixth; the one with the fee; a shop refund of 50.00 two days after Checking's 50.00;
    and purchases from repeat vendors.

  A comment block in neither file: the layout must stay the bank's. The expected pairs are
  written down in the US12 test (T174), not in the files.
- [X] T163 [P] Generated data, written by the test run into the test's output folder and never
  committed ([R-46](research.md#r-46), [quickstart.md](quickstart.md#us13-usual-choices)):
  - in `e2e/support/generate.ts`, ledgers whose imported transactions carry `vendor` and, on
    transfers, `destinationVendor` ([data-model.md](data-model.md#transaction)); a backup with one
    confirmed month on two accounts across about 40 vendors, in which some vendors have a usual
    category, some a usual transfer, and some no choice held by more than half; and a 300-row file
    of the next month for [SC-031](spec.md#sc-031), with a list of the starting choice each row
    must have;
  - the performance data: a backup of 10,000 transactions with vendors on two accounts, to restore
    before the 5,000-row file ([quickstart.md](quickstart.md#performance));
  - a new `e2e/support/write-sc036.ts`, and the script `"fixtures:sc036": "node
    e2e/support/write-sc036.ts"` in `package.json`, which writes the backup and the next month's
    file for the [SC-036](spec.md#sc-036) manual check into `tmp/`, which `.gitignore` already
    holds.

  Dates end yesterday at the latest. Test first in `e2e/support/generate.test.ts` if that file
  exists, otherwise by the first test that uses each generator.

---

## Phase 2: Tests first (every user story)

**Purpose**: every test of v1.8, unit and end-to-end, written before any code. A test may import
a module or function that does not exist yet (`transfers.ts`, `usualChoices`, `CategoryPicker`):
that is a right reason to fail. A test must not fail for a typo, a wrong selector of something
that already exists, or a broken fixture.

**⚠️ CRITICAL**: no code task of Phase 3 or later starts before T194 is done.

### Tests of the foundation

- [X] T164 [P] In `src/domain/invariants.test.ts`, invariants 4, 7 and 8 of
  [data-model.md](data-model.md#invariants), one test each for these inputs:
  - vendors: a `vendor` of `"  "` breaks them, and so does a `destinationVendor` on an expense;
  - category marks: an assignment with both `suggested` and `usual`, and one with
    `suggested: false` or `usual: false`, break them;
  - transfer marks: one with both `usual` and `pairedTransactionId` breaks them; so does a
    `usualCategoryId` without `pairedTransactionId`, one naming an income category on an expense
    row, and one naming "Uncategorised"; a `pairedTransactionId` that names no transaction does
    not;
  - `keptInReview: false`, `seen: false` and `groupSeen: false` each break them;
  - `settings.setAsideUnderCents` of 0, -1, 1.5 and `2 ** 53` breaks them; 1 and 100 do not;
  - a state saved by v1.7, with none of these fields, holds every invariant.
- [X] T165 [P] In `src/files/backup.test.ts`, the backup file of
  [contracts/backup-file.md](contracts/backup-file.md) ([FR-160](spec.md#fr-160),
  [SC-014](../001-finance-tracker-v1/spec.md#sc-014)):
  - a v1.7 backup restores, with transactions without vendors, a pending batch without marks,
    `keptInReview`, `seen` or `groupSeen`, and settings without `setAsideUnderCents`;
  - a v1.8 backup holding every new field (both vendors, a suggested transfer with
    `usualCategoryId`, a usual category, a usual transfer, `keptInReview`, `seen`, `groupSeen` and
    `setAsideUnderCents`) round-trips to an equal state;
  - `formatVersion` stays 1, and a file breaking T164's invariants is refused as before.
- [X] T166 [P] The ledger's vendor fields and category deletion:
  - in `src/domain/transactions.test.ts`: changing a transfer holding both vendors into an expense
    keeps `vendor` and drops `destinationVendor`; changing an expense with `vendor` into a transfer
    keeps it; editing date, amount, description, account or category changes neither field; the
    manual-entry form's new transaction has neither ([FR-145](spec.md#fr-145),
    [data-model.md](data-model.md#transaction));
  - in `src/domain/categories.test.ts`: deleting a category moves pending rows assigned to it to
    the same side's "Uncategorised" without `suggested` or `usual`, and a transfer assignment whose
    `usualCategoryId` names it loses that field and keeps `pairedTransactionId`
    ([data-model.md](data-model.md#state-transitions), [FR-147](spec.md#fr-147)).
- [X] T167 [P] The guide and FAQ describe v1.8, with no new question
  ([Assumptions](spec.md#assumptions)):
  - in `src/ai/appGuide.test.ts`: the guide's part on importing names suggested transfers and
    that turning Transfer off keeps the two apart, the mark "From earlier", "Set aside rows
    under", and that typing finds a category and Tab moves to the next row;
  - in `src/ai/faq.test.ts`: still twelve questions; the answer on reviewing an import names
    suggested transfers, "From earlier" and setting small amounts aside, and never says
    "profile".
- [X] T168 [P] In `e2e/performance.spec.ts`, the [SC-010](../001-finance-tracker-v1/spec.md#sc-010)
  check first restores T163's backup of 10,000 transactions with vendors on two accounts, then
  imports the generated 5,000-row file, so pairing and usual choices are inside the 10 s
  ([quickstart.md](quickstart.md#performance), [R-41](research.md#r-41),
  [R-42](research.md#r-42)). Its other checks stay.

### Tests of User Story 12: suggested transfers

- [X] T169 [P] [US12] A new `src/domain/import/transfers.test.ts` for
  `pairTransfers(rows, accountId, transactions, categories)` and `pairFits(row, state)`
  ([FR-142](spec.md#fr-142), [FR-144](spec.md#fr-144), [R-41](research.md#r-41),
  [csv-import.md](contracts/csv-import.md#suggested-transfers)):
  - a row with money in pairs with an expense of equal amount on another account dated 0, 2 and 4
    days before or after it, and a row with money out with such an income; 5 days apart pairs
    nothing;
  - nothing pairs with a transaction on the batch's account, with a transfer, with an expense in
    "Unaccounted", with a different amount, with an amount of zero, or in the same direction
    (money in with an income);
  - each transaction pairs with one row at most and each row with one transaction: with rows of
    500.00 on 3 and 5 March and an expense of 500.00 on 4 March, only the 3 March row pairs, since
    both are a day apart and the earlier row wins (scenario 6); with rows 1 and 3 days away, the
    closer pairs first; on equal days and the same row, the earlier transaction by date, then
    `seq`;
  - rows flagged as duplicates take no part;
  - the result names, per row number, the paired transaction's id and its account;
  - `pairFits` is true for an unchanged pair, and false once the paired transaction is deleted,
    changed in amount, moved to another account or made a transfer
    ([data-model.md](data-model.md#derived-values)).
- [X] T170 [P] [US12] In `src/domain/import/duplicates.test.ts`, the duplicate rule of
  [FR-156](spec.md#fr-156) ([csv-import.md](contracts/csv-import.md#duplicate-matching)): a row on
  Savings dated 2 May with money in matches a transfer from Checking to Savings dated 30 April (2
  days), on its destination side; a row on Checking with money out matches it on its source side
  up to 4 days apart; 5 days apart matches nothing; the direction must agree on that account (a
  row on Savings with money out does not match); expenses and incomes still match on the exact
  date only; and earlier rows of the same batch still match on the exact date.
- [X] T171 [P] [US12] In `src/domain/import/batch.test.ts`, `createBatch` flags duplicates first
  and pairs only the rows not flagged, then starts each paired row as a transfer assignment with
  the paired transaction's account as `counterAccountId` and its id as `pairedTransactionId`,
  without `usual` ([data-model.md](data-model.md#state-transitions) steps 1, 2 and 4). No row
  starts with `keptInReview`, `seen` or `groupSeen`. A row flagged as a duplicate that would pair gets no
  suggested transfer.
- [X] T172 [P] [US12] Review of a suggested transfer ([FR-143](spec.md#fr-143)):
  - in `src/domain/import/review.test.ts`: turning the Transfer switch off gives the row its
    `usualCategoryId` when it has one, and otherwise the side's "Uncategorised", without marks;
    choosing another counter-account leaves an ordinary transfer without `pairedTransactionId`;
    assigning the row a category directly or through a group it is not in leaves it alone;
  - in `src/domain/import/groups.test.ts`: `reviewView` leaves rows holding `pairedTransactionId`
    out of every vendor group, lists them as suggested transfers by date, each with whether its
    pair fits and the paired transaction, and counts them; a group of three whose one row is
    paired becomes a group of two; a group left with one row shows it as a plain row
    ([FR-026](../001-finance-tracker-v1/spec.md#fr-026)).
- [X] T173 [P] [US12] In `src/domain/import/confirm.test.ts`, confirmation of
  [data-model.md](data-model.md#state-transitions) ([FR-144](spec.md#fr-144),
  [FR-145](spec.md#fr-145), [FR-157](spec.md#fr-157)):
  - a row with a fitting pair adds no transaction: the paired expense becomes a transfer from its
    account to the batch account, keeping its `id`, `seq`, `date`, `amountCents` and
    `description`, without `categoryId`; its own `vendor` stays on its own side, and the row's
    counterparty becomes the vendor of the batch account's side; a paired income becomes a
    transfer from the batch account to its account, with the vendors placed the same way;
  - a row whose pair no longer fits enters the ledger as a transfer with that counter-account, as
    a marked row would, and the transaction it paired with is unchanged;
  - every new transaction keeps the row's counterparty as `vendor` when the batch account is its
    `accountId`, and as `destinationVendor` when it is the destination; a row without counterparty
    gives neither;
  - `confirmationCounts` gives the rows that will enter the ledger, how many of them set aside
    (zero here) and how many transactions will become transfers;
  - both balances are right after confirming scenario 2's batch.
- [X] T174 [P] [US12] A new `e2e/us12-suggested-transfers.spec.ts`, User Story 12's six scenarios,
  [SC-029](spec.md#sc-029) and [SC-030](spec.md#sc-030), on T162's fixtures
  ([quickstart.md](quickstart.md#us12-suggested-transfers)): after importing and confirming
  `checking-2026-10.csv` into Checking, importing `card-2026-10.csv` shows "6 suggested transfers"
  in the header and under "Suggested transfers", with the sentence of [FR-154](spec.md#fr-154),
  each row marked "Suggested" with "Pairs with:" naming Checking's account, date, description and
  amount; the sixth payment and the one with the fee are not suggested and stay in review as
  rows of the group "Checking"; turning the shop refund's
  Transfer switch off leaves it an income in "Uncategorised"; the Confirm modal says 5
  transactions will become transfers; Transactions then holds those 5 as transfers dated as on
  Checking and no expense or income for them; both balances match the files; and importing both
  files again flags every row as a duplicate, so confirming adds nothing. One more test edits the
  paired transaction on Transactions while the batch is pending and sees "Pairs with:" say it has
  changed, and the row confirm as an ordinary transfer. A test of SC-029 as it stands writes copies
  of both fixtures without the shop's 50.00 and its refund into its own output folder, imports and
  confirms them with every default, and finds exactly 5 transfers, no expense or income for them,
  and both balances matching the files.

### Tests of User Story 13: usual choices

- [X] T175 [P] [US13] A new `src/domain/import/usual.test.ts` for
  `usualChoices(rows, accountId, transactions, categories)` ([FR-146](spec.md#fr-146),
  [R-42](research.md#r-42), [csv-import.md](contracts/csv-import.md#usual-choices)):
  - 3 of 5 REWE expenses in Groceries give Groceries; 2 of 4 Amazon expenses in Household and 2 in
    Hobbies give none; 3 of 5 in "Uncategorised" give none, as do 3 of 5 in "Unaccounted";
  - a REWE refund gets Refunds from REWE's one income, ignoring REWE's expenses;
  - 4 of 5 Geldautomat rows on Checking as transfers to Cash give a usual transfer to Cash; 2 to
    Cash and 2 to Savings give none;
  - a transfer from Checking to Cash with `vendor` "Geldautomat" counts for a Checking row from
    Geldautomat, and not for a Cash row; one with `destinationVendor` "Geldautomat" counts for a
    Cash row only;
  - " rewe " matches "REWE"; a row without counterparty, and transactions without vendor, count
    for nothing;
  - rows flagged as duplicates get their usual choice too.
- [X] T176 [US13] In `src/domain/import/batch.test.ts`, after T171, the starting assignments of
  [data-model.md](data-model.md#state-transitions) step 4 and [FR-158](spec.md#fr-158): a usual
  category starts as that category with `usual: true`; a usual transfer as a transfer with that
  counter-account and `usual: true`; a row with both a suggested transfer and a usual category
  starts with the suggested transfer and keeps the category as `usualCategoryId`; a row with a
  suggested transfer and a usual transfer starts with the suggested transfer, without `usual`; any
  other row starts in its side's "Uncategorised".
- [X] T177 [US13] Marks from earlier ([FR-147](spec.md#fr-147),
  [contracts/ui.md](contracts/ui.md#review) Marks), after T172:
  - in `src/domain/import/review.test.ts`: assigning a row any category, even its usual one,
    directly or through its group, removes `usual` and `suggested`; turning the switch on or off,
    and choosing another counter-account, remove `usual`; an AI suggestion applies only to rows
    still in "Uncategorised", so a usual row never gets `suggested`;
  - in `src/domain/import/groups.test.ts`: a group shows a mark only when all its rows hold the
    same assignment with the same mark, and otherwise the shared assignment without a mark, or
    "Mixed";
  - in `src/domain/import/suggestions.test.ts`: rows holding a usual category are not sent
    (scenario 5).
- [ ] T178 [P] [US13] A new `e2e/us13-usual-choices.spec.ts`, User Story 13's seven scenarios and
  [SC-031](spec.md#sc-031) ([quickstart.md](quickstart.md#us13-usual-choices)): a restored backup
  whose ledger holds vendors in the proportions of the scenarios; REWE's rows start in Groceries
  marked "From earlier" on the rows and the group, with the sentence of
  [FR-154](spec.md#fr-154) once above the first item holding it; Amazon's start in
  "Uncategorised"; a REWE refund in Refunds; Geldautomat rows as transfers to Cash, and turning
  Transfer off leaves them in "Uncategorised"; picking Groceries again removes the mark; a
  transaction confirmed, then edited on Transactions to another category, counts with that
  category in the next import (scenario 6); and on T163's generated month, every row starts with
  the choice the generator listed.
- [ ] T179 [US13] In `e2e/ui/review.spec.ts`, a block for the marks
  ([contracts/ui.md](contracts/ui.md#review) Marks): "Suggested" with a sparkle icon and "From
  earlier" with a history icon differ in icon and word; the mark's sentence is its accessible
  description on every row that holds it; a group whose rows are mixed shows no mark and its
  unfolded rows show theirs.

### Tests of User Story 14: keyboard review

- [ ] T180 [P] [US14] A new `src/domain/import/items.test.ts` for the review items
  ([data-model.md](data-model.md#derived-values), [R-44](research.md#r-44)): `reviewItems(view,
  unfolded)` lists the suggested transfers, then the vendor groups largest first, each followed by
  its rows when its key is in `unfolded`, then the plain rows by date; a row item is seen when it
  has `seen`, and a group when all its rows have `groupSeen`; the rows of an unfolded group that
  hold only `groupSeen` are not seen, and a group whose rows all have `seen` but not `groupSeen` is
  not seen; `notSeenCount` counts the suggested transfers, groups and plain rows not seen, never
  rows inside a group; `firstNotSeen` gives the first item not seen, and the first item when all
  are seen.
- [ ] T181 [US14] Seen marks ([FR-151](spec.md#fr-151), [FR-155](spec.md#fr-155)), after T177:
  - in `src/domain/import/review.test.ts`: `markSeen(batch, rowNumbers)` sets `seen: true` and
    `markGroupSeen(batch, rowNumbers)` sets `groupSeen: true` on each row named, on nothing else,
    and change no assignment or mark;
  - in `src/store/import.test.ts`: `markSeen(store, item)` sets `seen` on a row item, and for a
    group sets `groupSeen` on all its rows and leaves their `seen` as it was; the batch reloaded
    from storage still holds both.
- [ ] T182 [P] [US14] The end-to-end helpers for the picker: in `e2e/support/app.ts`, a
  `pickCategory(page, scope, name)` that types into a category picker and picks the item named
  `name`, and `choose` keeps working for the selects that stay (account, kind, counter-account).
  Every existing spec that picks a category through the old select uses it:
  `e2e/ui/transaction-form.spec.ts`, `e2e/ui/transactions.spec.ts`, `e2e/ui/review.spec.ts`,
  `e2e/us1-ledger.spec.ts`, `e2e/us2-import.spec.ts` and any other that `grep` finds. These specs
  then fail only for want of the picker.
- [ ] T183 [P] [US14] A new `e2e/ui/category-picker.spec.ts`, the search of
  [contracts/ui.md](contracts/ui.md#category-picker) ([FR-148](spec.md#fr-148)), in the
  transaction form, in a Category cell on Transactions, and on a review row and group: typing
  "gro" shows only categories whose name contains it, ignoring case and spaces around it, in the
  list's order, with the first highlighted; the arrow keys move the highlight and Enter picks;
  Escape closes the list and leaves the field as it was; "Unaccounted" and an empty choice never
  show; with nothing matching, the list says "No category matches".
- [ ] T184 [P] [US14] A new `e2e/us14-keyboard-review.spec.ts`, User Story 14's seven scenarios,
  with `page.keyboard` only from the moment review opens
  ([quickstart.md](quickstart.md#us14-keyboard-review)): on a batch of 40 items, the first item is
  current and its picker has focus; "gro" and Tab give the item Groceries and make the next one
  current; Tab with nothing typed, and with text matching nothing, keeps the item's category;
  Shift+Tab goes back one item; on a row holding a transfer, its Transfer switch takes the picker's
  place; each item left shows the check icon; after reloading with 12 seen, the 12 still look
  seen, the header says 28, and the 13th is current; Tab on the last item focuses Confirm, that
  item shows the check icon, and the header's "N not seen yet" reads "All seen"; a group passed
  while folded shows its rows not seen when unfolded; clicking a row makes it current.
- [ ] T185 [US14] In `e2e/ui/review.spec.ts`, after T179 and T182, a block for the current and
  seen items ([contracts/ui.md](contracts/ui.md#review)): the current item has the 2px outline,
  the 4px left bar and the arrow icon; a seen item that is not current has the check icon and its
  text in the secondary ink; an item not seen has neither; the current item scrolls into view
  when it changes; unfolding a group makes it current and its rows follow it; clicking another
  item, or focusing Discard in the footer, makes the current item seen
  ([FR-151](spec.md#fr-151)), while opening its own list does not; the
  keyboard line with the sentence of [FR-154](spec.md#fr-154) shows above the items.

### Tests of User Story 15: set aside

- [ ] T186 [P] [US15] The set-aside amount ([FR-152](spec.md#fr-152), [R-45](research.md#r-45)):
  - in `src/domain/settings.test.ts`: `setSetAsideAmount(state, cents)` stores
    `setAsideUnderCents` ([Settings](data-model.md#settings)), and `undefined` removes it; 0, a
    negative amount and a fraction of a cent are refused;
  - in `src/store/settings.test.ts`: "1.00", "1,00" and "0.5" store 100, 100 and 50; "abc", "0",
    "-1" and "1.005" store nothing, remove the amount and give `set-aside-amount-invalid`; an
    empty field removes the amount; the amount survives a reload.
- [ ] T187 [US15] Rows set aside ([FR-152](spec.md#fr-152), [FR-153](spec.md#fr-153),
  [data-model.md](data-model.md#derived-values)), after T181:
  - in `src/domain/import/groups.test.ts`: with 100 set, expenses of 0.50 and 0.99 and an income
    of 0.12 are set aside, and expenses of 1.00 and 25.00 stay under review; a transfer of 0.50,
    suggested, usual or marked, stays; a row with `keptInReview` stays; an excluded duplicate is
    not set aside; set-aside rows are in no group and no plain row, and are listed by date with
    their count; with the amount absent nothing is set aside; lowering or clearing it brings rows
    back holding what they held, their usual category included;
  - in `src/domain/import/review.test.ts`: assigning a row anything sets `keptInReview`;
    `bringBack(batch, rowNumber)` sets it and keeps the assignment;
  - in `src/domain/import/suggestions.test.ts`: rows set aside are not sent;
  - in `src/domain/import/items.test.ts`: rows set aside are no item and count as neither seen nor
    not seen.
- [ ] T188 [US15] In `src/domain/import/confirm.test.ts`, after T173: set-aside rows enter the
  ledger as an expense or income in their side's "Uncategorised", also one whose usual category is
  Groceries; a row brought back confirms with what it holds; `confirmationCounts` gives the rows
  set aside; with 30 rows under 1.00, every balance equals the balance the same batch gives with
  nothing set aside ([SC-034](spec.md#sc-034), [FR-157](spec.md#fr-157),
  [FR-159](spec.md#fr-159)).
- [ ] T189 [P] [US15] A new `e2e/us15-set-aside.spec.ts`, User Story 15's seven scenarios and
  [SC-034](spec.md#sc-034) ([quickstart.md](quickstart.md#us15-set-aside)): entering 1.00 takes
  the 30 rows under 1.00 out of review and the line says "30 rows under €1.00 set aside"; a row
  given a category first stays; "abc" and 0 show the message of `set-aside-amount-invalid` and set
  nothing aside; bringing one row back from the drawer puts it under review; the Confirm modal
  says how many rows enter the ledger in "Uncategorised" because they were set aside; the 29 do,
  and every balance equals the same file's with nothing set aside; the next import sets rows under
  1.00 aside from the start. In `e2e/messages.spec.ts`, `set-aside-amount-invalid` is triggered
  and shows its catalogue text ([contracts/ui.md](contracts/ui.md#message-catalogue)).
- [ ] T190 [US15] In `e2e/ui/review.spec.ts`, after T185, a block for the set-aside field and
  drawer ([contracts/ui.md](contracts/ui.md#review)): the field sits between the header and the
  suggestions, empty at first, with the sentence of [FR-154](spec.md#fr-154) beside it; the
  header's set-aside count shows only when not zero and opens the drawer; the drawer lists date,
  description, vendor and amount by date, each with Bring back; Suggest categories counts neither
  rows set aside nor rows holding a usual category.

### Tests of User Story 16: new category from a picker

- [ ] T191 [P] [US16] In `src/store/import.test.ts`, creating a category from a review picker
  ([FR-149](spec.md#fr-149)): `assignRow` and `assignGroup` with a new category's name and colour
  create the category on the row's side and assign it in one change, without marks and with
  `keptInReview`; a taken name is refused with `category-name-taken` and nothing changes; the
  category stays after `discardBatch`.
- [ ] T192 [US16] In `e2e/ui/category-picker.spec.ts`, after T183, New category…
  ([contracts/ui.md](contracts/ui.md#category-picker)): it is always the last item, also while
  searching; with nothing matching it is the only item, highlighted, and Enter opens the dialog
  with the typed text as the name; the dialog is Categories' own, its colour the first one the
  side does not use; creating picks the new category in the form, the cell (which saves) and
  review; Cancel leaves each field as it was; opening the dialog from the current review item
  leaves that item current and not seen ([FR-151](spec.md#fr-151)).
- [ ] T193 [P] [US16] A new `e2e/us16-new-category.spec.ts`, User Story 16's five scenarios
  ([quickstart.md](quickstart.md#us16-new-category)): New category… on a review group creates
  "Pets", every row of the group holds it without marks, and Pets is on Categories; "pets" and
  Enter open the dialog named "pets", which says the name is taken; with kind Income, the form
  creates "Gifts" as an income category and holds it; Cancel keeps the field; after Discard, Pets
  is still on Categories.

### Red run

- [ ] T194 Run the tests of Phase 2: `npm run lint` passes on them, `npm test` and
  `npm run test:e2e` run. Every assertion of new behaviour written in T163 – T193 fails for the
  right reason, a missing module, export or behaviour. Assertions that guard what v1.7 already
  does may pass, such as T165's v1.7 backup restore, T170's exact-date matching of expenses and
  incomes, and T168's timing if it is already within 10 s. Every other test passes. Report in a
  few lines which fail and why, and which new tests pass because they guard v1.7, then commit
  them, and go on to the code without waiting.

**Checkpoint**: every test of v1.8 exists, and each one of new behaviour fails for the reason it
should.

---

## Phase 3: Foundational (blocking)

**Purpose**: the stored fields every story reads, their invariants and their place in a backup.

**⚠️ CRITICAL**: no user story's code starts before this phase is done.

- [ ] T195 The new fields in `src/domain/types.ts` ([data-model.md](data-model.md),
  [R-39](research.md#r-39), [R-40](research.md#r-40)), all optional, so a v1.7 state is a valid
  v1.8 state:
  - `Transaction`: `vendor?` and `destinationVendor?`
    ([Transaction](data-model.md#transaction));
  - the category assignment: `suggested?: true` and `usual?: true`; the transfer assignment:
    `usual?: true`, `pairedTransactionId?` and `usualCategoryId?`; and the parsed pending row:
    `keptInReview?: true`, `seen?: true` and `groupSeen?: true`
    ([Pending row](data-model.md#pending-row));
  - `Settings`: `setAsideUnderCents?` ([Settings](data-model.md#settings)).

  Where a type can state a rule of [invariants](data-model.md#invariants) 4, 7 and 8, such as
  `true` instead of `boolean`, it does; T196 checks the rest.
- [ ] T196 [P] Invariants 4, 7 and 8 in `src/domain/invariants.ts`, as
  [data-model.md](data-model.md#invariants) restates them; T164 passes.
- [ ] T197 [P] The zod schemas of `src/files/backup.ts` accept the new optional fields, with
  [invariants 4, 7 and 8](data-model.md#invariants), and `formatVersion` stays 1
  ([contracts/backup-file.md](contracts/backup-file.md)); T165 passes.
- [ ] T198 [P] Vendors through edits and category deletion: in `src/domain/transactions.ts`, a
  kind change away from transfer drops `destinationVendor` and keeps `vendor`, and no other edit
  touches either; in `src/domain/categories.ts`, deleting a category also clears the marks of
  pending rows it held and removes `usualCategoryId` where it names it, in the same change
  ([data-model.md](data-model.md#state-transitions)); T166 passes.

**Checkpoint**: T164 – T166 pass; v1.7 data loads unchanged.

---

## Phase 4: User Story 12 - Suggested transfers (Priority: P12) 🎯 MVP

**Goal**: a row whose other side is already in the ledger is proposed as a transfer, and
confirming turns the two into one transfer ([FR-142](spec.md#fr-142) –
[FR-145](spec.md#fr-145), [FR-156](spec.md#fr-156), [FR-157](spec.md#fr-157)).

**Independent Test**: `e2e/us12-suggested-transfers.spec.ts` (T174), with T169 – T173.

- [ ] T199 [P] [US12] A new `src/domain/import/transfers.ts` with `pairTransfers(rows, accountId,
  transactions, categories)` and `pairFits(row, state)`, by the three steps of [R-41](research.md#r-41):
  candidates indexed by amount in a `Map`, every candidate pair sorted by days apart, row number,
  then the transaction's date and `seq`, and taken while neither side is taken; T169 passes.
- [ ] T200 [P] [US12] The 4-day window for ledger transfers in `src/domain/import/duplicates.ts`:
  a transfer matches a row on its source side with money out or on its destination side with
  money in, up to 4 days apart; all other matching stays exact
  ([csv-import.md](contracts/csv-import.md#duplicate-matching)); T170 passes.
- [ ] T201 [US12] `createBatch` in `src/domain/import/batch.ts` flags duplicates, pairs the rows
  not flagged with `pairTransfers`, and starts each paired row as its suggested transfer; T171
  passes. Depends on T199 and T200.
- [ ] T202 [P] [US12] Review of suggested transfers: in `src/domain/import/review.ts`, turning the
  switch off gives `usualCategoryId` or the side's "Uncategorised", and choosing a counter-account
  drops `pairedTransactionId`; in `src/domain/import/groups.ts`, `reviewView` also takes the
  ledger, leaves paired rows out of the groups, and lists the suggested transfers with their pair
  and whether it fits ([csv-import.md](contracts/csv-import.md#vendor-groups)); T172 passes.
- [ ] T203 [P] [US12] Confirmation in `src/domain/import/confirm.ts`: a fitting pair converts the
  paired transaction, one that no longer fits books as an ordinary transfer, every new transaction
  keeps the row's counterparty as `vendor` or `destinationVendor`, and `confirmationCounts` gives
  the counts of the modal ([data-model.md](data-model.md#state-transitions)); `confirmBatch` in
  `src/store/import.ts` writes it in one storage transaction and its notification says how many
  transactions were added and how many became transfers; T173 passes.
- [ ] T204 [US12] The screens ([contracts/ui.md](contracts/ui.md#review)): a new
  `src/ui/screens/import/SuggestedTransfers.tsx` with the heading "Suggested transfers", the
  sentence of [FR-154](spec.md#fr-154), and each row by date with its assignment control, the mark
  "Suggested" and "Pairs with:" or the line saying the paired transaction has changed;
  `ReviewScreen.tsx` shows the header count "N suggested transfers" when not zero and the section
  first in the body; `AssignmentControl.tsx` shows the mark on a suggested transfer; the Confirm
  modal states the rows entering the ledger and the transactions becoming transfers. T174 passes.

**Checkpoint**: User Story 12 works on its own; `npm run verify` passes apart from the tests of
later stories.

---

## Phase 5: User Story 13 - Usual choices (Priority: P13)

**Goal**: vendors the user sorted before start in their usual category or transfer, marked "From
earlier" ([FR-146](spec.md#fr-146), [FR-147](spec.md#fr-147), [FR-158](spec.md#fr-158)).

**Independent Test**: `e2e/us13-usual-choices.spec.ts` (T178), with T175 – T177 and T179.

- [ ] T205 [P] [US13] A new `src/domain/import/usual.ts` with `usualChoices(rows, accountId,
  transactions, categories)`: one pass over the ledger into a `Map` from (vendor name key, direction) to counts
  per `category:<id>` and `transfer:<counter-account>`, then for each row with a counterparty the
  choice held by more than half, none when that is "Uncategorised" or "Unaccounted"
  ([R-42](research.md#r-42)); T175 passes.
- [ ] T206 [US13] `createBatch` in `src/domain/import/batch.ts` finds usual choices after pairing
  and starts each row by the table of [data-model.md](data-model.md#state-transitions) step 4;
  T176 passes. Depends on T201 and T205.
- [ ] T207 [US13] Marks: in `src/domain/import/review.ts`, every assignment by the user, through a
  row or a group, also of the same category, and every switch or counter-account change leaves no
  `usual` or `suggested`; in `src/domain/import/groups.ts`, a group carries a mark only when all
  its rows hold the same assignment with the same mark; T177 passes.
- [ ] T208 [US13] The mark "From earlier" in `AssignmentControl.tsx`, `ReviewGroups.tsx` and
  `RowSummary.tsx`: a history icon and the word, unlike the sparkle of "Suggested"; the sentence
  of [FR-154](spec.md#fr-154) once above the first item holding it, and as the mark's accessible
  description on every one ([contracts/ui.md](contracts/ui.md#review) Marks). T178 and T179 pass.

**Checkpoint**: User Stories 12 and 13 work on their own.

---

## Phase 6: User Story 14 - Keyboard review (Priority: P14)

**Goal**: one current item that stands out, typing to search a category, Tab to the next item,
and seen items that look seen ([FR-148](spec.md#fr-148), [FR-150](spec.md#fr-150),
[FR-151](spec.md#fr-151)).

**Independent Test**: `e2e/us14-keyboard-review.spec.ts` (T184), with T180 – T183 and T185.

- [ ] T209 [P] [US14] A new `src/domain/import/items.ts` with `reviewItems(view, unfolded)`,
  `itemSeen`, `notSeenCount` and `firstNotSeen` ([data-model.md](data-model.md#derived-values),
  [R-44](research.md#r-44)); T180 passes.
- [ ] T210 [P] [US14] `markSeen(batch, rowNumbers)` and `markGroupSeen(batch, rowNumbers)` in
  `src/domain/import/review.ts`, and `markSeen(store, item)` in `src/store/import.ts`, which sets
  `seen` on a row item or `groupSeen` on every row of a group and saves at once
  ([FR-151](spec.md#fr-151), [FR-155](spec.md#fr-155)); T181 passes.
- [ ] T211 [US14] A new `src/ui/components/CategoryPicker.tsx` on T161's combobox: the items are
  `pickerCategories(categories, side)`, our filter keeps those whose name contains the trimmed text
  ignoring case, `autoHighlight` highlights the first, "No category matches" shows when none
  does, each item carries its colour swatch, and the picker exposes its highlighted category to
  its caller ([R-43](research.md#r-43), [contracts/ui.md](contracts/ui.md#category-picker)). It
  replaces `CategorySelect` in `src/ui/screens/transactions/TransactionForm.tsx`, in the cell
  editor `src/ui/screens/transactions/CellEditor.tsx` (open, with its search in focus), and in
  `src/ui/screens/import/AssignmentControl.tsx`; `src/ui/components/CategorySelect.tsx` is
  deleted. The SC-002 path of
  [contracts/ui.md](contracts/ui.md#transaction-form) still takes: amount, Tab, a few letters,
  Enter, Enter. T182 and T183 pass.
- [ ] T212 [US14] The current and seen items: a new `src/ui/screens/import/useReviewFocus.ts`
  keeps the current item and the unfolded groups as React state, starts on `firstNotSeen`, and
  holds a map of refs to each item's field; Tab and Shift+Tab in an item's picker or Transfer
  switch call `preventDefault`, pick the highlighted category when a search is open, make the
  next or previous item current, focus its field and `scrollIntoView({ block: "nearest" })`; on
  the last item, Tab is left to the browser. Clicking, touching or focusing an item makes it
  current, and unfolding a group does too. Each item's `focusout` marks it seen through
  `markSeen` when the focus leaves it, but not when `relatedTarget` is inside its own list or New
  category dialog ([R-44](research.md#r-44)). `ReviewScreen.tsx` shows the header's "N not seen yet" or "All
  seen" and the keyboard line; `ReviewGroups.tsx` and `RowSummary.tsx` show the current look (2px
  outline, 4px left bar, arrow icon) and the seen look (check icon, secondary ink)
  ([contracts/ui.md](contracts/ui.md#review)). T184 and T185 pass.

**Checkpoint**: User Stories 12 – 14 work on their own; every picker searches.

---

## Phase 7: User Story 15 - Set aside (Priority: P15)

**Goal**: rows under an amount leave review and enter the ledger in "Uncategorised"
([FR-152](spec.md#fr-152), [FR-153](spec.md#fr-153), [FR-157](spec.md#fr-157),
[FR-159](spec.md#fr-159)).

**Independent Test**: `e2e/us15-set-aside.spec.ts` (T189), with T186 – T188 and T190.

- [ ] T213 [P] [US15] `setSetAsideAmount` in `src/domain/settings.ts`, and in
  `src/store/settings.ts`, which parses the field with the shared
  [amount grammar](../001-finance-tracker-v1/contracts/csv-import.md#amount-grammar), stores a
  valid amount, and removes it when the field is empty or invalid, returning
  `set-aside-amount-invalid` for the latter ([R-45](research.md#r-45)); T186 passes.
- [ ] T214 [US15] Rows set aside: in `src/domain/import/groups.ts`, `reviewView` also takes
  `setAsideUnderCents` and derives the rows set aside by the rule of
  [data-model.md](data-model.md#derived-values), leaving them out of groups, plain rows and items;
  in `src/domain/import/review.ts`, every assignment sets `keptInReview`, and `bringBack(batch,
  rowNumber)` sets it; in `src/domain/import/suggestions.ts`, rows set aside are not sent; in
  `src/store/import.ts`, `bringBack(store, rowNumber)`. T187 passes.
- [ ] T215 [US15] Confirmation of rows set aside in `src/domain/import/confirm.ts`: each in its
  side's "Uncategorised", and `confirmationCounts` counts them; T188 passes.
- [ ] T216 [US15] The screens: `set-aside-amount-invalid` in `src/ui/messages.ts`, with the text
  of [contracts/ui.md](contracts/ui.md#message-catalogue); a new
  `src/ui/screens/import/SetAside.tsx` with the field "Set aside rows under" and its sentence, the
  line "N rows under €X set aside" as the button that opens the drawer, and the drawer listing the
  rows with Bring back; `ReviewScreen.tsx` places it between the header and the suggestions, shows
  the header count when not zero, and the Confirm modal's count of rows set aside. T189 and T190
  pass.

**Checkpoint**: User Stories 12 – 15 work on their own.

---

## Phase 8: User Story 16 - New category from a picker (Priority: P16)

**Goal**: every category picker ends with New category…, which creates a category and picks it at
once ([FR-149](spec.md#fr-149)).

**Independent Test**: `e2e/us16-new-category.spec.ts` (T193), with T191 and T192.

- [ ] T217 [US16] Move `src/ui/screens/categories/NewCategoryDialog.tsx` to
  `src/ui/components/NewCategoryDialog.tsx`; it takes an initial name and returns the new
  category's id through `onCreated`, and refuses names as Categories does
  ([FR-032](../001-finance-tracker-v1/spec.md#fr-032)). `CategoriesScreen.tsx` imports it from
  there, and `npm run check:architecture` passes.
- [ ] T218 [US16] In `src/store/import.ts`, `assignRow` and `assignGroup` take a new category
  (name and colour) as a choice, create it and assign it in one change, without marks and with
  `keptInReview`; T191 passes.
- [ ] T219 [US16] New category… as the last item of `CategoryPicker.tsx`, always kept by the
  filter, so Enter with no match opens the dialog with the typed text as its name; creating picks
  the category in the transaction form, in the cell editor (which saves), and on a review row or
  group through T218; Cancel leaves the field as it was ([R-43](research.md#r-43)). T192 and T193
  pass.

**Checkpoint**: every user story works on its own; every test of Phase 2 passes.

---

## Phase 9: Polish & cross-cutting concerns

- [ ] T220 [P] The guide in `src/ai/appGuide.ts` and the FAQ answer on reviewing an import in
  `src/ai/faq.ts` describe v1.8, in plain words for someone who is not an IT person, and add no
  question ([Assumptions](spec.md#assumptions)); T167 passes.
- [ ] T221 `npm run verify` passes: lint, architecture, typecheck, every unit test and every
  end-to-end test of v1.0 – v1.8 on Chromium and Firefox, the performance check (T168) included.
  Every link in `specs/018-review-queue/` and every "Replaced in v1.8 by" link in
  `specs/001-finance-tracker-v1/` resolves.
- [ ] T222 (Project owner, manual) On the branch, before the merge, on `localhost` (`npm start`):
  walk the [manual checks](quickstart.md#manual-checks) of [SC-032](spec.md#sc-032),
  [SC-033](spec.md#sc-033), [SC-035](spec.md#sc-035) and [SC-036](spec.md#sc-036) (with `npm run
  fixtures:sc036`), and the sentences of [FR-154](spec.md#fr-154). Its commit sets the version to
  `1.8.0` (constitution IX). What follows the merge, the tag `v1.8` on the feature's squash commit
  on `main`, the checks at the web address and the Update from v1.7, is the
  [release checklist](quickstart.md#release-checklist), which the next feature's first task
  checks.

**Checkpoint**: every task is done. The feature is a release, v1.8 (constitution IX), MINOR
because it adds features and removes none, and every field it stores is optional: v1.7 and v1.8
read each other's databases and backups unchanged, the database schema stays 1 and the backup
format stays 1 ([R-39](research.md#r-39), [data-model.md](data-model.md#storage-layout)). Merge,
then walk the [release checklist](quickstart.md#release-checklist).

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1, Setup**: T160 first. T161 – T163 have no dependency.
- **Phase 2, Tests first**: after T162 and T163, which the end-to-end tests read. Blocks every
  code task.
- **Phase 3, Foundational**: after T194. Blocks every story.
- **Phases 4 – 8, the stories**: after Phase 3, one after the other in priority order. They
  change the same files (`review.ts`, `groups.ts`, `confirm.ts`, `src/store/import.ts` and
  `ReviewScreen.tsx`), so two stories at once would edit them against each other. US13 needs
  US12's `createBatch` (T201) for T206; `items.ts` (T209) lists the suggested transfers of T202;
  US16 needs US14's `CategoryPicker` (T211).
- **Phase 9, Polish**: after every story. T222 is last.

### Within the tests (Phase 2)

Tasks in the same file run in order: `batch.test.ts` T171 → T176; `review.test.ts` and
`groups.test.ts` T172 → T177 → T181 → T187; `confirm.test.ts` T173 → T188;
`e2e/ui/review.spec.ts` T179 → T185 → T190 (and after T182); `category-picker.spec.ts` T183 →
T192.

### Within each story

Domain functions before the store, the store before the screens; each task ends with its tests
from Phase 2 passing, and is committed with its checkbox ticked.

### Parallel opportunities

- Setup: T161, T162, T163.
- Tests: T164 – T170 together; then T171 – T175, T178, T180, T182 – T184, T186, T189, T191 and
  T193, each in its own file.
- Foundation: T196, T197 and T198 after T195.
- Stories: T199 with T200; T202 with T203; T209 with T210. Beyond these, only the pure modules
  of later stories run ahead, each in its own file: T205 (`usual.ts`) and T213 (`settings.ts`)
  once Phase 3 is done, and T209 (`items.ts`) once T202 is.
- Polish: T220 beside any story phase once T167 is red.

---

## Parallel Example: Phase 2

```bash
# New test files, each on its own:
Task: "T169 [US12] pairTransfers and pairFits in src/domain/import/transfers.test.ts"
Task: "T175 [US13] usualChoices in src/domain/import/usual.test.ts"
Task: "T180 [US14] reviewItems in src/domain/import/items.test.ts"
Task: "T186 [US15] setSetAsideAmount in src/domain/settings.test.ts and src/store/settings.test.ts"
Task: "T193 [US16] e2e/us16-new-category.spec.ts"
```

## Parallel Example: User Story 12

```bash
# After T198:
Task: "T199 [US12] pairTransfers and pairFits in src/domain/import/transfers.ts"
Task: "T200 [US12] the 4-day window in src/domain/import/duplicates.ts"
# After T201:
Task: "T202 [US12] suggested transfers in review.ts and groups.ts"
Task: "T203 [US12] converting pairs in confirm.ts and src/store/import.ts"
```

## Parallel Example: User Stories 13 – 15

```bash
# Pure modules, ahead of their stories, beside US12:
Task: "T205 [US13] usualChoices in src/domain/import/usual.ts"
Task: "T213 [US15] setSetAsideAmount in src/domain/settings.ts and src/store/settings.ts"
# After T202:
Task: "T209 [US14] reviewItems in src/domain/import/items.ts"
```

---

## Implementation Strategy

### Tests first, then the MVP

1. Phase 1, with T160's check of v1.7's release.
2. Phase 2: every test of v1.8, red for the right reason (T194).
3. Phase 3: the stored fields.
4. Phase 4, User Story 12: suggested transfers. **Stop and validate**: T174 passes, and a
   checking and a card file confirm into one transfer per payment. This is the MVP: it protects
   every figure on Insights from transfers counted as spending.

### Incremental delivery

1. US12 keeps transfers out of spending.
2. US13 starts repeat vendors in their usual category, which removes most of a monthly review.
3. US14 makes the rest fast with the keyboard and shows where the user is.
4. US15 lets the user skip small amounts.
5. US16 removes the detour to Categories.

After each story: its tests pass and `npm run verify` is green apart from the tests of later
stories. The release is the whole feature (constitution IX), so nothing is pushed to `main` before
the merge.

### Parallel agent strategy

With several agents: one works through the story phases in order, while others build the pure
domain modules of later stories (`usual.ts`, `settings.ts`, and `items.ts` after T202) ahead of
time. They have their own tests and files, so they can merge into the branch before their screens
exist. The rest of each story waits for the story before it, since they share files.

---

## Notes

- Commit after every task, each message starting with its task ID, such as `T199: …`, with a
  short reason why the step matters ([git-history rule](../../.claude/rules/git-history.md)). Tick
  the task's checkbox in the same commit.
- Code and tests cite the FRs of this folder, and for a requirement 018 replaces, the new FR, not
  001's ([.claude/rules/specs.md](../../.claude/rules/specs.md)).
- Generated data stays out of git; fixtures hold made-up rows only.
- To look at the app between tasks, use `npm run dev` or a private window, since the installed
  build of the same version keeps serving until the version changes.
