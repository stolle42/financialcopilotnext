# Quickstart: validating the review queue (v1.8)

**Plan**: [plan.md](plan.md) · **Spec**: [spec.md](spec.md) · **Everything else**:
[001 quickstart.md](../001-finance-tracker-v1/quickstart.md)

This guide shows that v1.8 works end to end. Prerequisites, setup, running the app, the automated
checks and the checks of v1.0–v1.7 stay as 001's quickstart describes them; every one of them must
still pass.

## Prerequisites and run

As in 001: [Prerequisites](../001-finance-tracker-v1/quickstart.md#prerequisites),
[Setup](../001-finance-tracker-v1/quickstart.md#setup) and
[Run](../001-finance-tracker-v1/quickstart.md#run). v1.8 adds no dependency to install beyond
`npm ci`.

To look at a build of this branch before its version number changes, use `npm run dev` or a
private window, since the service worker keeps serving the installed build of the same version.

## Automated checks

The commands of 001's
[Automated checks](../001-finance-tracker-v1/quickstart.md#automated-checks) stay;
`npm run verify` runs them all. v1.8 adds:

| Where | Proves |
|---|---|
| `src/domain/import/transfers.test.ts` | Every rule of [FR-142](spec.md#fr-142): the 4-day window, other account, opposite direction, equal non-zero amount, no "Unaccounted", one-to-one, closest first, ties by row and transaction, duplicates left out |
| `src/domain/import/usual.test.ts` | [FR-146](spec.md#fr-146): more than half, exactly half, "Uncategorised" winning, transfers per counter-account, each side of a transfer by its own vendor, rows without vendor |
| Changed domain tests | Duplicates with the 4-day window for transfers ([FR-156](spec.md#fr-156)); confirmation converting a fitting pair and booking one that no longer fits ([FR-144](spec.md#fr-144)); set-aside rows ([FR-152](spec.md#fr-152)); groups without paired rows; marks cleared by assignments and category deletion ([FR-147](spec.md#fr-147)); the new invariants ([data-model.md](data-model.md#invariants)) |
| `src/files/backup.test.ts` | A v1.7 backup restores; a v1.8 backup round-trips with every new field ([SC-014](../001-finance-tracker-v1/spec.md#sc-014), [contracts/backup-file.md](contracts/backup-file.md)) |
| `e2e/ui/review.spec.ts`, `e2e/ui/category-picker.spec.ts` | The behaviour of [contracts/ui.md](contracts/ui.md): marks, the set-aside field and drawer, the current and seen look, the picker's search and New category… |

## Validation scenarios

Each user story's *Independent Test* is automated as one end-to-end file. Data the tests need is
loaded through the backup restore, as in 001.

**Fixtures** in `e2e/fixtures/`, made-up rows in the layout of `mybank-2026-10.csv`
([R-46](research.md#r-46)):

| File | Account | Holds |
|---|---|---|
| `checking-2026-10.csv` | Checking | 5 payments to the card; a sixth paid 5 days before the card books it; one paid with a 1.50 fee on the card's side; 50.00 to a shop; "Geldautomat" withdrawals; coffees under 1.00; interest of 0.12 |
| `card-2026-10.csv` | Credit card | The 5 payments received 0 to 4 days later; the sixth; the one with the fee; a shop refund of 50.00 two days after Checking's 50.00; purchases from repeat vendors |

<a id="us12-suggested-transfers"></a>
### US12: Suggested transfers

- **Run**: `e2e/us12-suggested-transfers.spec.ts`
- **Covers**: [User Story 12](spec.md#user-story-12), [SC-029](spec.md#sc-029),
  [SC-030](spec.md#sc-030)
- **Steps**: import `checking-2026-10.csv` into Checking and confirm; import `card-2026-10.csv`
  into the credit card.
- **Expected**:
  - Review shows 6 suggested transfers, with "Pairs with" naming each Checking transaction: the 5
    payments and the shop refund. The sixth payment and the one with the fee are not suggested.
  - Turning the shop refund's Transfer switch off leaves it an income in "Uncategorised".
  - The confirmation states the rows entering the ledger and that 5 transactions will become
    transfers. After confirming, the ledger holds exactly those 5 transfers, with Checking's
    dates, and both balances match the files.
  - Importing both files again flags every row as a duplicate: confirming adds nothing.

<a id="us13-usual-choices"></a>
### US13: Usual choices

- **Run**: `e2e/us13-usual-choices.spec.ts`
- **Covers**: [User Story 13](spec.md#user-story-13), [SC-031](spec.md#sc-031)
- **Steps**: restore a backup whose ledger holds vendors in the proportions of the story's
  scenarios, then import the next month; then the generated pair for SC-031: a backup with one
  confirmed month across about 40 vendors and a 300-row file of the next month.
- **Expected**: REWE's rows start in Groceries marked "From earlier", on the rows and the group;
  Amazon's start in "Uncategorised"; a REWE refund starts in Refunds; Geldautomat rows start as
  transfers to Cash. Picking Groceries again removes the mark. In the generated review, every row
  whose vendor has a usual choice starts with it, and every other row in "Uncategorised".

<a id="us14-keyboard-review"></a>
### US14: Keyboard review

- **Run**: `e2e/us14-keyboard-review.spec.ts`
- **Covers**: [User Story 14](spec.md#user-story-14)
- **Steps**: import a file giving 40 items, then drive review with `keyboard.press` only: type a
  few letters and Tab on each item, Shift+Tab once; reload part way through.
- **Expected**: the first item is current with its picker in focus; "gro" narrows the list to
  categories containing it, and Tab picks the first and moves on; each item passed shows the check
  icon; the count of items not seen falls to "All seen"; after the reload, the seen items still
  show as seen and the first unseen item is current; Tab on the last item focuses Confirm.

<a id="us15-set-aside"></a>
### US15: Set aside

- **Run**: `e2e/us15-set-aside.spec.ts`
- **Covers**: [User Story 15](spec.md#user-story-15), [SC-034](spec.md#sc-034)
- **Steps**: import a file with 30 rows under 1.00 among others, enter 1.00, bring one row back,
  confirm; import another file.
- **Expected**: the 30 rows leave the review and the line says 30 are set aside; "abc" and 0 show
  `set-aside-amount-invalid` and set nothing aside; the brought-back row stays under review; the
  29 others enter the ledger in "Uncategorised", and every balance equals the balance the same
  file gives with nothing set aside; the next import sets rows under 1.00 aside from the start.

<a id="us16-new-category"></a>
### US16: New category from a picker

- **Run**: `e2e/us16-new-category.spec.ts`
- **Covers**: [User Story 16](spec.md#user-story-16)
- **Steps**: in review, choose New category… on a group and create "Pets"; type "pets" in a
  row's picker and press Enter; in the transaction form with kind Income, create "Gifts"; on
  Transactions, create one from a cell.
- **Expected**: every row of the group holds Pets, without marks, and Pets is on Categories; Enter
  with no match opens the dialog named "pets", which refuses it as taken; Gifts is an income
  category held by the form; Cancel leaves each field as it was; the categories stay after
  discarding the batch.

### Messages

`e2e/messages.spec.ts` also triggers `set-aside-amount-invalid`
([contracts/ui.md](contracts/ui.md#message-catalogue)).

<a id="performance"></a>
### Performance

`e2e/performance.spec.ts` keeps its checks. Its [SC-010](../001-finance-tracker-v1/spec.md#sc-010)
check now restores a generated backup of 10,000 transactions with vendors on two accounts first,
so the import of the 5,000-row file also pairs transfers and finds usual choices
([R-41](research.md#r-41), [R-42](research.md#r-42)).

| Check | Setup | Expected |
|---|---|---|
| [SC-010](../001-finance-tracker-v1/spec.md#sc-010) | Restore the generated backup, then import a generated 5,000-row CSV | The review is shown within 10 s |

<a id="manual-checks"></a>
## Manual checks

These criteria measure a person, so a person runs them, as in 001's
[Manual checks](../001-finance-tracker-v1/quickstart.md#manual-checks), on `npm start` before a
push and at the web address after the release.

| Criterion | Procedure | Pass |
|---|---|---|
| [SC-032](spec.md#sc-032) | Restore a backup with a pending batch of 40 items, then categorise every item with the keyboard only | Under 3 min, and the person can say at every moment which item is current |
| [SC-033](spec.md#sc-033) | Show 5 people a review in which about a third of the items are seen | Each points out the current item and the seen ones within 5 s |
| [SC-035](spec.md#sc-035) | In review, create a category from a group's picker and assign it | Under 20 s, without leaving review, and every other choice in review is unchanged |
| [SC-036](spec.md#sc-036) | With a saved bank CSV format and one month confirmed in v1.8, import the next month (`npm run fixtures:sc036` writes both to `tmp/`) and review it until no row is in "Uncategorised" | Under 3 min from choosing the file to confirming |
| Explanations ([FR-154](spec.md#fr-154)) | Read review with suggested transfers, marks from earlier and the set-aside field | Each sentence of FR-154 is shown where it applies, with nothing to open |

## Release checklist

v1.8 is released by 001's
[release checklist](../001-finance-tracker-v1/quickstart.md#release-checklist), with the tag
`v1.8`. Step 5 adds the [manual checks](#manual-checks) above.
