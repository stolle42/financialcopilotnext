# Implementation Plan: Review queue — suggested transfers, usual categories, keyboard review

**Branch**: `018-review-queue` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/018-review-queue/spec.md`

This plan states only what v1.8 adds to or changes in
[001's plan](../001-finance-tracker-v1/plan.md). The stack, the layers, the scripts and the CI
workflow stay as it describes them.

## Summary

v1.8 makes a monthly review take fewer decisions ([spec](spec.md)):

- **Suggested transfers**: when a batch is created, rows are paired with the other side of a
  transfer already in the ledger, closest dates first and one-to-one, by a pure domain function.
  Confirming a pair changes the ledger transaction into one transfer instead of adding a second
  ([R-41](research.md#r-41), [contracts/csv-import.md](contracts/csv-import.md#suggested-transfers)).
  Duplicates match ledger transfers within 4 days, so a re-imported side is caught
  ([contracts/csv-import.md](contracts/csv-import.md#duplicate-matching)).
- **Usual choices**: confirmed transactions keep their row's vendor, one per side of a transfer
  ([R-40](research.md#r-40)). A new row starts with the category or transfer more than half of its
  vendor's transactions hold, found in one pass over the ledger ([R-42](research.md#r-42)).
- **One category picker**: Base UI's Combobox, already a dependency, replaces the category select
  in the form, the cell editor and review, with search while typing and **New category…** as its
  last item, which opens the dialog Categories uses ([R-43](research.md#r-43)).
- **Keyboard review**: review lists its items in one order; Tab picks the highlighted category and
  moves the current item, which stands out by an outline, a bar and an arrow; an item the focus
  leaves is marked seen on its rows and stored ([R-44](research.md#r-44)).
- **Set aside**: one stored amount; whether a row is set aside is derived each time, and one flag
  keeps a row the user touched in review ([R-45](research.md#r-45)).
- **Version**: every new field is optional and v1.7 drops fields it does not know, so the backup
  format and the database schema stay at version 1 and v1.8 is a MINOR release
  ([R-39](research.md#r-39)).

## Technical Context

**Language/Version**: as in [001](../001-finance-tracker-v1/plan.md#technical-context): TypeScript
6.0, strict; Node.js 24 LTS for the tooling.

**Primary Dependencies**: unchanged. v1.8 adds no package. shadcn/ui's combobox component is
copied in with its CLI, as its other components were; it is built on the `Combobox` of
`@base-ui/react` 1.8, which the project already depends on ([R-43](research.md#r-43)).

**Storage**: IndexedDB through `idb`, schema version 1, unchanged. New fields are optional
additions to records the stores already hold: vendors on transactions, review progress on the
pending batch's rows, the set-aside amount in the settings
([data-model.md](data-model.md#storage-layout)). Backups keep format version 1
([contracts/backup-file.md](contracts/backup-file.md)).

**Testing**: as in 001: Vitest for the domain, files and store, Playwright in Chromium and Firefox
on the production build. v1.8's tests and fixtures are in [R-46](research.md#r-46) and
[quickstart.md](quickstart.md).

**Target Platform**: unchanged: current desktop Chrome, Edge and Firefox, at the Vercel address.

**Project Type**: unchanged: client-only, installable single-page web application, no backend.

**Performance Goals**:

- A 5,000-row CSV in review within 10 s
  ([SC-010](../001-finance-tracker-v1/spec.md#sc-010)), now with transfer pairing and usual choices
  against 10,000 transactions. Both index the ledger once, by amount and by vendor, so the cost
  stays linear in practice ([R-41](research.md#r-41), [R-42](research.md#r-42),
  [quickstart.md](quickstart.md#performance)).
- Tab moves the current item without a visible delay on a review of 300 rows: one stored write of
  the batch per move, as every review change already makes ([R-44](research.md#r-44)).

**Constraints**: as in [001](../001-finance-tracker-v1/plan.md#technical-context), and:

- v1.7 must still read v1.8's database and backups, so a user can go back a version without
  losing data ([R-39](research.md#r-39)).
- Every picker keeps the rules of [FR-030](../001-finance-tracker-v1/spec.md#fr-030): one side, no
  "Unaccounted", no empty choice.
- Confirming a batch, pairs included, is one atomic storage transaction
  ([R-06](../001-finance-tracker-v1/research.md#r-06)).

**Scale/Scope**: as in 001. No new entity type or screen; four fields on existing entities, one
setting, one shared component, one moved dialog.

Nothing in this context remains marked NEEDS CLARIFICATION: [research.md](research.md) resolves
R-39 – R-46.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The check is against the constitution 1.3.0.

| Principle | How this plan complies | Before research | After design |
|---|---|---|---|
| I. Single Source of Truth | This feature's documents state only what v1.8 changes and link to 001 for the rest. Each replaced section of 001's data model and contracts becomes a link to its new statement, so each rule is stated once ([.claude/rules/specs.md](../../.claude/rules/specs.md)). The corrected version assumption lives in the spec, with its reason in [R-39](research.md#r-39) | Pass | Pass |
| II. KISS | No dependency added: the picker uses Base UI's Combobox, already installed. Set aside is derived, not stored per row; the current item is screen state, not stored. Pairing is a greedy walk the spec states, not a matching algorithm ([R-41](research.md#r-41), [R-44](research.md#r-44), [R-45](research.md#r-45)) | Pass | Pass |
| III. DRY | `NewCategoryDialog` is shared now that the pickers are its second user; `CategoryPicker` replaces `CategorySelect` in all four places rather than sitting beside it. Nothing else is extracted ahead ([R-43](research.md#r-43)) | Pass | Pass |
| IV. SOLID | No interface added. Pairing, usual choices and the review's items are one domain module each ([R-41](research.md#r-41), [R-42](research.md#r-42), [R-44](research.md#r-44)) | Pass | Pass |
| V. Clean Architecture | Every new rule is a pure function in `src/domain`; the store calls it, writes, then applies; the UI only reads derived values. dependency-cruiser keeps checking it | Pass | Pass |
| VI. Clean Code | Names follow the spec's terms: suggested transfer, usual choice, set aside, seen | Pass | Pass |
| VII. Test-Driven Development | Every user story's tests are written first and seen to fail, then implemented ([R-46](research.md#r-46)) | Pass | Pass |
| VIII. User Experience & Defensive Error Handling | Each new term gets its sentence on screen ([FR-154](spec.md#fr-154)); the current and seen items differ by shape, not only colour; an invalid set-aside amount has its own message code ([contracts/ui.md](contracts/ui.md#message-catalogue)). A pair that changed while pending is shown and booked safely ([FR-144](spec.md#fr-144)) | Pass | Pass |
| IX. Versioning | No feature is removed, and v1.7 reads v1.8's data, so v1.8 bumps MINOR: `package.json` 1.8.0, tag `v1.8` ([R-39](research.md#r-39)) | Pass | Pass |

| Quality gate | Enforced by |
|---|---|
| All tests pass, and new behaviour has a test that fails without it | CI, and test-first ordering in `tasks.md` |
| No business-rule module imports framework, UI or persistence code | `npm run check:architecture` |
| No duplicated documentation or speculative abstraction | The replacement links in 001; review against this plan |
| Expected error paths are handled and show a clear message | `set-aside-amount-invalid`, the dialog's name codes, and `e2e/messages.spec.ts` |
| After a push to `main`, the localhost and Vercel deployments are checked | 001's [release checklist](../001-finance-tracker-v1/quickstart.md#release-checklist), with this feature's [manual checks](quickstart.md#manual-checks) |

**Result**: the plan passes every principle and gate, before research and after design. No
deviation needs justifying.

## Project Structure

### Documentation (this feature)

```text
specs/018-review-queue/
├── spec.md              # The feature specification: FR-142 – FR-160, SC-029 – SC-036
├── plan.md              # This file
├── research.md          # Phase 0: technical decisions R-39 – R-46
├── data-model.md        # Phase 1: Transaction, Pending row, Settings, derived values,
│                        # invariants 4, 7, 8 and state transitions, replacing 001's
├── quickstart.md        # Phase 1: how to validate v1.8
├── contracts/
│   ├── csv-import.md    # Duplicate matching, suggested transfers, usual choices, vendor groups
│   ├── ui.md            # Review, the category picker, the form's and the cell's Category
│   └── backup-file.md   # The added fields and Compatibility
├── checklists/
│   └── requirements.md  # The spec quality checklist
└── tasks.md             # Phase 2: written by /speckit-tasks, not by this command
```

### Source Code (repository root)

Only files v1.8 adds or changes. Tests sit next to their module, as in 001.

```text
src/
├── domain/
│   ├── types.ts                 # vendor, destinationVendor; assignment marks; keptInReview, seen, groupSeen;
│   │                            # setAsideUnderCents (data-model.md)
│   ├── transactions.ts          # A kind change away from transfer drops destinationVendor
│   ├── categories.ts            # Deletion also clears marks and usualCategoryId in the batch
│   ├── settings.ts              # Setting and clearing the set-aside amount
│   ├── invariants.ts            # Invariants 4, 7 and 8 as restated
│   └── import/
│       ├── transfers.ts         # NEW: pairTransfers, pairFits (R-41)
│       ├── usual.ts             # NEW: usualChoices (R-42)
│       ├── items.ts             # NEW: review items in display order, seen and not-seen counts (R-44)
│       ├── batch.ts             # createBatch: duplicates, pairs, usual choices, starting assignments
│       ├── duplicates.ts        # The 4-day window for ledger transfers
│       ├── review.ts            # Assignments without marks, keptInReview, bring back, mark seen;
│       │                        # the set-aside rows in the review view (R-45)
│       ├── groups.ts            # Groups leave out paired and set-aside rows; marks on groups
│       ├── suggestions.ts       # Rows set aside are not sent
│       └── confirm.ts           # Converts fitting pairs; books set-aside rows; keeps vendors
├── files/
│   └── backup.ts                # Schemas accept the new optional fields; format stays 1 (R-39)
├── store/
│   ├── import.ts                # bringBack, markSeen, assign with a new category
│   └── settings.ts              # setSetAsideAmount
├── ai/
│   ├── appGuide.ts              # The guide describes v1.8 (FR-136 of 001)
│   └── faq.ts                   # Answers that name review describe v1.8 (FR-139 of 001)
└── ui/
    ├── components/
    │   ├── ui/combobox.tsx      # NEW: shadcn/ui's combobox, copied in by its CLI (R-43)
    │   ├── CategoryPicker.tsx   # NEW: replaces CategorySelect.tsx, which is deleted (R-43)
    │   └── NewCategoryDialog.tsx  # MOVED from screens/categories/: initial name, returns the id
    ├── screens/
    │   ├── categories/CategoriesScreen.tsx  # Imports the moved dialog
    │   ├── transactions/TransactionForm.tsx, CellEditor.tsx  # Use CategoryPicker
    │   └── import/
    │       ├── ReviewScreen.tsx       # Header counts, set-aside field, keyboard line, body order,
    │       │                          # current item and focus (R-44)
    │       ├── ReviewGroups.tsx       # Current and seen look; Tab between items
    │       ├── AssignmentControl.tsx  # CategoryPicker; switch-off to the usual category; marks
    │       ├── RowSummary.tsx         # Current and seen look
    │       ├── SuggestedTransfers.tsx # NEW: the block, its sentence and "Pairs with" (contracts/ui.md)
    │       ├── SetAside.tsx           # NEW: the field, its sentence, count and drawer with Bring back
    │       └── useReviewFocus.ts      # NEW: current item, refs, Tab and Shift+Tab (R-44)
    └── messages.ts              # set-aside-amount-invalid

e2e/
├── fixtures/checking-2026-10.csv, card-2026-10.csv   # NEW (quickstart.md)
├── support/generate.ts          # Ledgers with vendors; the SC-031 and SC-036 data
├── support/write-sc036.ts       # NEW: npm run fixtures:sc036 writes the SC-036 backup and file to tmp/
├── ui/review.spec.ts            # Changed: marks, set aside, current and seen items
├── ui/category-picker.spec.ts   # NEW: search, keys, New category… in each picker
├── us12-suggested-transfers.spec.ts … us16-new-category.spec.ts   # NEW: one per user story
├── messages.spec.ts             # Adds set-aside-amount-invalid
└── performance.spec.ts          # SC-010 against a ledger with vendors

package.json                     # version 1.8.0; script fixtures:sc036
```

**001 documents changed by this plan**: the sections of
[001 data-model.md](../001-finance-tracker-v1/data-model.md) and of its
[csv-import](../001-finance-tracker-v1/contracts/csv-import.md),
[ui](../001-finance-tracker-v1/contracts/ui.md) and
[backup-file](../001-finance-tracker-v1/contracts/backup-file.md) contracts that this feature
restates now read "Replaced in v1.8 by …", keeping their headings and anchors.

**Structure Decision**: the layers of
[001](../001-finance-tracker-v1/plan.md#project-structure) stay. The new rules are domain modules
in `src/domain/import/`, because they run when a batch is created or reviewed. The review screen
keeps living in `src/ui/screens/import/`.

## Complexity Tracking

No deviation to justify.
