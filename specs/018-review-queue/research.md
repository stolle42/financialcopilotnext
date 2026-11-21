# Research: Review queue (v1.8)

**Plan**: [plan.md](plan.md) · **Spec**: [spec.md](spec.md) · **Earlier decisions**:
[001 research](../001-finance-tracker-v1/research.md), R-01 – R-38, which still hold

Each item records one technical decision of v1.8: what was chosen, why, and what else was weighed.
The numbers continue after R-38 ([.claude/rules/specs.md](../../.claude/rules/specs.md)).

<a id="r-39"></a>
### R-39 · v1.8 is a MINOR release: optional fields, backup format 1, database schema 1

- **Decision**: everything v1.8 stores is a new **optional** field of a record that exists
  already: the vendors of a transaction, the marks and flags of a pending row, and the skip amount
  amount in the settings ([data-model.md](data-model.md)). The backup keeps `formatVersion` 1 and
  the database keeps schema version 1. A v1.7 file or database lacks the fields and is complete.
  The version becomes **1.8**, `package.json` `1.8.0`, tag `v1.8`.
- **Rationale**:
  - [Constitution IX](../../.specify/memory/constitution.md#ix-versioning) asks for a MAJOR
    version only when an earlier version *cannot read* what this one writes. v1.7's backup schemas
    are zod objects, which drop keys they do not know (`src/files/backup.ts`), and its database
    code stores records as they are. So v1.7 reads a v1.8 backup or database, without what v1.8
    added. This is how v1.2 (`suggested`, `aiFeatures`), v1.3 (`conversation`) and v1.6 (`model`)
    grew the format ([001 backup-file.md](../001-finance-tracker-v1/contracts/backup-file.md#compatibility)).
  - Read by v1.7, a v1.8 state is valid: a row holding a suggested transfer becomes a row marked
    as a transfer, a usual category an ordinary category, and nothing is skipped. The one loss
    is meaning, not data: confirming in v1.7 a batch whose suggested transfers are still pending
    books each as a new transfer and leaves the paired expense or income in place. Going back to
    v1.7 needs an old build, since the app only updates forward
    ([FR-124](../001-finance-tracker-v1/spec.md#fr-124)), so this is accepted.
  - The spec's assumption that a v1.7 app refuses a v1.8 backup was wrong: v1.7 refuses only a
    higher `formatVersion`. The assumption now says that v1.7 reads it without the new fields
    ([spec.md](spec.md#assumptions)).
- **Alternatives considered**:
  - **`formatVersion` 2, version 2.0**: v1.7 would refuse a v1.8 backup with "saved by a newer
    version", which is clearer. But a MAJOR version warns that going back is unsafe, which here it
    is not, and every v1.8 file would need a second code path for the format. Rejected.
  - **A database schema version 2 with an upgrade step**: nothing needs a new store or index, so
    an upgrade would add code that changes nothing.

<a id="r-40"></a>
### R-40 · A vendor for each side of a transaction

- **Decision**, for [FR-145](spec.md#fr-145) and [FR-146](spec.md#fr-146): a transaction keeps
  the counterparty text as its bank booked it on each account, in two optional fields:
  - `vendor`: as booked on `accountId`. An expense, an income, and the source side of a transfer.
  - `destinationVendor`: as booked on `destinationAccountId`. Transfers only.

  A row confirmed as an expense, an income, or a transfer it starts or is marked as, writes its
  counterparty to the field of the batch's account. When a suggested transfer converts its paired
  transaction ([FR-144](spec.md#fr-144)), the paired transaction's own vendor and the row's
  counterparty each go to the field of their own account. The text is stored as booked, and
  compared by name key ([R-08](../001-finance-tracker-v1/research.md#r-08)), as vendor groups do.
- **Rationale**:
  - FR-146 counts "the transfers with that vendor whose source is the batch's account". A transfer
    made from a pair joins two bookings, each with its own counterparty. With one vendor field, the
    side whose file was imported second would lose its vendor, and its usual transfer would never
    form. With one field per side, both files find their usual choice the next month.
  - The text as booked, not its name key, so a later screen can show the vendor without the file.
- **Alternatives considered**:
  - **One `vendor` field**: simpler by one field, but it breaks usual transfers for paired
    transfers, as above.
  - **A separate vendor list with ids**: a new store and a reference to maintain on every edit,
    for no behaviour the spec asks for.

<a id="r-41"></a>
### R-41 · Pairing rows with the other side of a transfer: closest dates first, once

- **Decision**, for [FR-142](spec.md#fr-142): a pure function `pairTransfers(rows, accountId,
  transactions,
  categories)` in `src/domain/import/transfers.ts`, called by `createBatch` after duplicates are
  flagged:
  1. **Candidates**: the expenses and incomes on another account with a category whose role is not
     `unaccounted`, indexed by amount in a `Map`. A row with a non-zero amount looks up its
     absolute amount and keeps the transactions that move money the other way (a row with money in
     pairs with an expense, a row with money out with an income) and are at most 4 days from its
     date.
  2. **Order**: every candidate pair is sorted by days apart, then by row number, then by the
     transaction's date and `seq`.
  3. **Pick**: walking that order, a pair is taken when neither its row nor its transaction is
     taken yet.

  Only rows that are not flagged as duplicates take part. The row stores the paired
  transaction's id, and its account as the counter-account ([data-model.md](data-model.md#pending-row)).
  A small function `pairFits(row, state)` checks, when review shows the row and when it is
  confirmed, that the paired transaction still exists and is an expense or income of that amount
  on that account ([FR-144](spec.md#fr-144)).
- **Rationale**:
  - The greedy walk is the rule the spec states: the closest pair is made first, and ties follow
    file order. A matching algorithm that maximises the number of pairs could pair other rows than
    a person would, and would be harder to explain.
  - Candidate pairs are few: equal amounts within 4 days. With 5,000 rows and 10,000 transactions,
    the lookup and the sort stay far below the 10 s of
    [SC-010](../001-finance-tracker-v1/spec.md#sc-010), which the performance check measures
    ([quickstart.md](quickstart.md#performance)).
- **Alternatives considered**:
  - **Suggesting at review time instead of creation**: suggestions would change while the user
    reviews, against FR-142.
  - **Matching on description text as well**: banks describe the two sides differently ("Payment
    to card" against "Payment received"); the spec leaves text out, as duplicates do.

<a id="r-42"></a>
### R-42 · Usual choices from one index of the ledger by vendor

- **Decision**, for [FR-146](spec.md#fr-146) and [FR-158](spec.md#fr-158): a pure function
  `usualChoices(rows, accountId, transactions, categories)` in `src/domain/import/usual.ts`, also called by
  `createBatch`:
  1. One pass over the ledger builds a `Map` from (vendor name key, way the money moves) to a
     count per choice: `category:<id>` for an expense or income with that `vendor`;
     `transfer:<counter-account>` for a transfer whose `vendor` matches on its source side or whose
     `destinationVendor` matches on its destination side ([R-40](#r-40)). Only transfers whose side
     with that vendor is the batch's account count.
  2. For each parsed row with a counterparty, the choice with more than half the count of its key
     is its usual choice. When that choice is the side's "Uncategorised", or a category with role
     `unaccounted`, the row has none.

  Every parsed row gets its usual choice, flagged rows included, so a flagged row the user
  includes starts with it too ([FR-158](spec.md#fr-158)). A row with a suggested transfer starts
  with that transfer instead. If its usual choice is a category, that category is kept in the
  transfer assignment, as what turning the switch off returns to ([FR-143](spec.md#fr-143)).
- **Rationale**:
  - One pass and one lookup per row: linear, as duplicates are.
  - "Unaccounted" holds only reconciliation entries, which have no vendor; excluding it keeps
    invariant 7 true if a user ever edits a vendor's transaction into it.
- **Alternatives considered**:
  - **The most frequent choice, without the majority rule**: rejected by the owner, who asked for
    more than 50 %.
  - **Weighting recent transactions more**: a rule the spec does not state, and harder to explain
    in the mark's sentence ([FR-154](spec.md#fr-154)).

<a id="r-43"></a>
### R-43 · One category picker: Base UI's Combobox, with New category… as its last item

- **Decision**, for [FR-148](spec.md#fr-148) and [FR-149](spec.md#fr-149): `CategoryPicker` in
  `src/ui/components/` replaces `CategorySelect` in all four places it is used (the transaction
  form, the cell editor, review's rows and groups). It is built on the `Combobox` of
  `@base-ui/react`, already a dependency, through shadcn/ui's combobox component, added with its
  CLI ([R-03](../001-finance-tracker-v1/research.md#r-03)):
  - The items are `pickerCategories(categories, side)`, as now, then one item **New category…**.
    A filter of our own keeps the categories whose name contains the typed text, trimmed and
    ignoring case, and always keeps New category…. `autoHighlight` highlights the first item.
  - So with no category matching, the list shows "No category matches" and New category… alone,
    highlighted, and Enter opens the dialog with the typed text as its name, as FR-148 asks,
    without a key handler of our own.
  - `NewCategoryDialog` moves from `src/ui/screens/categories/` to `src/ui/components/`, gains an
    initial name and returns the new category's id. Categories, the form, the cell editor and
    review use the same dialog (constitution III: now a second user).
  - The picker exposes the highlighted category, so review's Tab can pick it first
    ([R-44](#r-44)).
- **Rationale**:
  - Base UI's Combobox brings the keyboard and ARIA behaviour of a listbox with search: arrow keys,
    Enter, Escape, `aria-activedescendant`. Writing it ourselves would be more code than the rest
    of v1.8's UI.
  - One component keeps every picker alike ([FR-065](../001-finance-tracker-v1/spec.md#fr-065)) and
    keeps the rules of [FR-030](../001-finance-tracker-v1/spec.md#fr-030) in one place.
- **Alternatives considered**:
  - **cmdk**: a new dependency for what Base UI already has.
  - **Typeahead in the existing Select**: Base UI's Select jumps to an item by its first letters
    but does not filter, and has no place for typed text, so Enter with no match could not open
    New category.
  - **Base UI's Autocomplete**: allows free text as a value, which a category field must not
    ([FR-158](spec.md#fr-158)).

<a id="r-44"></a>
### R-44 · The current item lives in the screen; seen marks live in the rows

- **Decision**, for [FR-150](spec.md#fr-150) and [FR-151](spec.md#fr-151):
  - **Items**: review lists its items in one array, in the order it shows them: suggested
    transfers, vendor groups (each followed by its rows while unfolded), plain rows. A pure
    function in the domain builds the array from the review view; the screen keeps which item is
    current and which groups are unfolded as React state, not stored.
  - **Tab**: each item's field (the picker, or the Transfer switch of a row holding a transfer)
    has a `keydown` handler. Tab and Shift+Tab call `preventDefault`, pick the highlighted category
    if a search is open, make the next or previous item current and focus its field through a map
    of refs. On the last item, Tab is left to the browser, so the focus moves on to Confirm. The
    item scrolls into view with `scrollIntoView({ block: "nearest" })`.
  - **Seen**: each item's element has a `focusout` handler. When the focus leaves the current item
    for anything else in the app, the store marks it seen: `seen: true` on a row, or
    `groupSeen: true` on every row of a group, which leaves the rows' own `seen` as it was. Focus
    moving into the item's own category list or New category dialog does not count; both are
    portalled, so the handler checks the event's `relatedTarget` against them. A group counts as
    seen when all its rows have `groupSeen`. Like every review change, it is saved at once
    ([FR-155](spec.md#fr-155)).
  - **Look**: the current item has a 2 px outline, a bar at its left edge and an arrow icon before
    it. A seen item has a check icon and its text in the secondary ink. Both differ in shape, not
    only in colour ([contracts/ui.md](contracts/ui.md#review)).
- **Rationale**:
  - The current item is where the user is now; storing it would make every Tab a second write
    with nothing to restore, since review opens on the first unseen item anyway.
  - Marks on rows, not on groups: groups are derived and change when rows are skipped or chosen for review,
    rows are not. A group's mark is a second flag on its rows, because a group seen while
    folded never showed its rows, so they are not seen.
  - Seen on leaving the focus, not on Tab only: Tab from the last item goes to Confirm, and
    clicking elsewhere leaves an item too; both must count, or "All seen" could not be reached.
  - Tab handled per item, not by a global key listener, so Tab elsewhere on the screen (the
    skip field, the drawers, the footer) moves focus as browsers do.
- **Alternatives considered**:
  - **Arrow keys between items**: the arrow keys already move the highlight inside an open
    picker; the owner asked for Tab.
  - **A seen group marks its rows seen**: rejected by the owner, since the rows of a folded group
    were never shown.
  - **A seen mark stored on each group**: groups are derived, so the mark would be lost when the
    group changes.
  - **Switching to another window does not count**: dropped by the owner. It needs a
    `document.hasFocus()` check that an end-to-end test cannot drive, since Playwright keeps every
    page focused, and an item marked seen this way is still current when the user comes back.

<a id="r-45"></a>
### R-45 · Skipping rows is derived from the amount; one flag keeps a row in review

- **Decision**, for [FR-152](spec.md#fr-152) and [FR-153](spec.md#fr-153):
  - The amount is `settings.setAsideUnderCents`, a positive number of cents, absent while the
    field is empty. The field parses with the shared amount grammar
    ([001 csv-import.md](../001-finance-tracker-v1/contracts/csv-import.md#amount-grammar)) and
    saves on every change that is valid; an empty or invalid field removes it, so nothing is set
    aside.
  - Whether a row is skipped is computed by the review view each time, never stored: a parsed,
    included row holding a category, without `keptInReview`, whose absolute amount is less than
    the amount. Changing the amount therefore applies at once, and rows come back holding what
    they held.
  - `keptInReview: true` on a row records the two things that keep it from being skipped: the
    user assigned it anything, or chose to review it.
- **Rationale**:
  - Deriving means no row ever holds a stale "skipped" flag after the amount changes, and a
    backup restored with another amount skips what that amount says.
  - One flag, because FR-152 treats both cases the same and nothing else reads them.
- **Alternatives considered**:
  - **A `setAside` flag on each row, written when the amount changes**: a write of the whole batch
    on every keystroke, and two facts to keep in agreement.
  - **One amount per account**: the spec chose one amount for every account.

<a id="r-46"></a>
### R-46 · Tests: two accounts' fixtures, generated months, and keyboard journeys

- **Decision**, for [SC-029](spec.md#sc-029) – [SC-036](spec.md#sc-036):
  - **Domain tests first**, next to their modules: `transfers.test.ts` (each rule of FR-142, ties,
    one-to-one, duplicates left out), `usual.test.ts` (majority, "Uncategorised" winning, half and
    half, transfers per counter-account, both sides of a transfer), and the changed
    `duplicates.test.ts`, `confirm.test.ts`, `groups.test.ts`, `review.test.ts`,
    `categories.test.ts`, `invariants.test.ts` and `backup.test.ts` (a v1.7 file restores; a v1.8
    file round-trips exactly, [SC-014](../001-finance-tracker-v1/spec.md#sc-014)).
  - **Fixtures**: two small files of one month, `checking-2026-10.csv` and `card-2026-10.csv`,
    with 5 transfers between them booked 0 to 4 days apart, a sixth 5 days apart, one with a fee,
    a refund that happens to match, a cash withdrawal, and amounts under 1.00 both ways
    ([quickstart.md](quickstart.md#us12-suggested-transfers)).
  - **Generated data** for [SC-031](spec.md#sc-031) and the performance check: a backup with a
    confirmed month across about 40 vendors, with vendors, and a 300-row file of the next month,
    written by the test run and never committed, as v1's large data is.
  - **Journeys**: one end-to-end file per user story, US12 – US16, plus the review and picker
    behaviour in `e2e/ui/`. The keyboard journey drives review with `keyboard.press` only.
  - [SC-032](spec.md#sc-032), [SC-033](spec.md#sc-033), [SC-035](spec.md#sc-035) and
    [SC-036](spec.md#sc-036) measure people, so they are manual checks
    ([quickstart.md](quickstart.md#manual-checks)).
- **Rationale**: the rules are pure functions, so most of v1.8 is proved by fast unit tests; the
  journeys prove that the screens use them. The fixtures stay small enough to read.
- **Alternatives considered**: **real bank exports with transfers**: they would hold the owner's
  data, and `e2e/fixtures/banks/` already shows layouts with made-up rows
  ([R-34](../001-finance-tracker-v1/research.md#r-34)).
