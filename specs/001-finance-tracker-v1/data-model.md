# Data Model: Financial Copilot v1

**Spec**: [spec.md](spec.md) · **Decisions**: [research.md](research.md)

This file defines how the [key entities](spec.md#key-entities) are represented: fields, types,
references, and the invariants every stored state satisfies. Behaviour rules stay in the spec;
entries link to their requirement instead of restating it.

## Conventions

| Concept | Representation | Decision |
|---|---|---|
| Identifier | String UUID, created by the store layer and passed into domain functions | [R-05](research.md#r-05) |
| Money | Integer number of euro cents (safe integer) | [R-08](research.md#r-08) |
| Calendar date | `YYYY-MM-DD` string in the user's local calendar; no time, no zone | [R-08](research.md#r-08) |
| Today | The local calendar date when an action happens, passed into domain functions | [R-08](research.md#r-08) |
| Timestamp | ISO 8601 UTC string; display only | — |
| Name key | A name trimmed and lower-cased; uniqueness compares name keys | [R-08](research.md#r-08) |

## Entities

### Account

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `name` | string | Non-empty after trimming; unique by name key ([FR-001](spec.md#fr-001)) |
| `type` | `checking` \| `savings` \| `credit-card` \| `cash` \| `other` | Descriptive only ([FR-004](spec.md#fr-004)) |
| `openingBalanceCents` | integer, any sign | A credit card may start negative ([FR-001](spec.md#fr-001)) |

No balance is stored ([FR-002](spec.md#fr-002)); it is derived, see [Derived values](#derived-values).
Accounts are never deleted ([FR-006](spec.md#fr-006)), so references to an account cannot dangle.

### Category

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `side` | `expense` \| `income` | Two separate sets ([FR-030](spec.md#fr-030)) |
| `name` | string | Non-empty; unique by name key within its side ([FR-032](spec.md#fr-032)) |
| `color` | `#rrggbb` | Chosen from the palette in [contracts/ui.md](contracts/ui.md#shared-patterns) |
| `role` | `uncategorised` \| `unaccounted` \| `null` | Non-null means protected ([FR-033](spec.md#fr-033)) |

The protected categories are found by `role`, never by name, because they can be renamed.

### Transaction

| Field | Type | Present when | Notes |
|---|---|---|---|
| `id` | string | always | |
| `seq` | positive integer | always | Creation order, unique; breaks ties between equal dates in the list ([FR-016](spec.md#fr-016)) |
| `date` | calendar date | always | |
| `amountCents` | integer ≥ 0 | always | [FR-010](spec.md#fr-010) |
| `accountId` | Account id | always | For a transfer, the account the money leaves |
| `description` | string, may be empty | always | |
| `kind` | `expense` \| `income` \| `transfer` | always | |
| `categoryId` | Category id | expense, income | Category of the same side ([FR-011](spec.md#fr-011)) |
| `destinationAccountId` | Account id | transfer | Differs from `accountId` ([FR-011](spec.md#fr-011)) |

A transaction never holds both `categoryId` and `destinationAccountId`. Kind changes follow
[FR-015](spec.md#fr-015). Saving from the manual-entry form refuses the "Unaccounted" category
unless the transaction already held it (editing a reconciliation entry;
[FR-030](spec.md#fr-030), [contracts/ui.md](contracts/ui.md#transaction-form)).

### Budget

| Field | Type | Notes |
|---|---|---|
| `categoryId` | Category id | Key; an expense category with `role` null ([FR-040](spec.md#fr-040)) |
| `limitCents` | integer > 0 | Monthly limit; one current value applies to every month ([FR-041](spec.md#fr-041)) |

At most one budget per category, which is why the category id is the key.

### Mapping profile

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `name` | string | Non-empty; unique by name key ([FR-021](spec.md#fr-021)) |
| `hasHeaderRow` | boolean | `false` is the "no header row" flag ([FR-021](spec.md#fr-021)) |
| `dateColumn` | column ref | |
| `descriptionColumn` | column ref | The cell may be empty |
| `counterpartyColumn` | column ref \| `null` | `null`: review is ungrouped ([FR-026](spec.md#fr-026)) |
| `amount` | see below | |
| `dateFormat` | one of the formats in [contracts/csv-import.md](contracts/csv-import.md#date-formats) | |
| `decimalSeparator` | `,` \| `.` | The thousands separator is the other one ([FR-028](spec.md#fr-028)) |
| `encoding` | one of the encodings in [contracts/csv-import.md](contracts/csv-import.md#encodings) | |

`amount` is one of:

- `{ mode: "signed", column, invertSign }`, a single signed column, optionally inverted
  ([FR-023](spec.md#fr-023)).
- `{ mode: "debit-credit", debitColumn, creditColumn }`. The column decides the direction, so this
  mode has no sign inversion ([R-12](research.md#r-12)).

A **column ref** is the header text when `hasHeaderRow` is true and a 0-based column position when
it is false. Every ref in one profile is the same variant.

### Pending batch

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `accountId` | Account id | The account being imported into ([FR-020](spec.md#fr-020)) |
| `fileName` | string | Display only |
| `createdAt` | timestamp | Display only |
| `rows` | pending row list, in file order | |

At most one exists ([FR-022](spec.md#fr-022)). The batch holds no reference to its mapping profile:
everything review needs was parsed into the rows at creation. So editing, renaming or deleting the
profile cannot change the batch ([FR-021](spec.md#fr-021)).

### Pending row

Every row has a `rowNumber`: its record number in the file, counting the header (when present) as
row 1, as a spreadsheet shows it. It identifies the row within the batch and in messages. The row's
`status` decides its other fields.

**`status: "unparsable"`** ([FR-028](spec.md#fr-028)):

| Field | Type | Notes |
|---|---|---|
| `cells` | string list | The raw cells, shown next to the reason |
| `failure` | failure code + details | Codes in [contracts/csv-import.md](contracts/csv-import.md#unparsable-rows) |

**`status: "parsed"`**:

| Field | Type | Notes |
|---|---|---|
| `date` | calendar date | |
| `amountCents` | integer, any sign | Signed effect on the batch account after sign inversion: negative is money out ([FR-023](spec.md#fr-023)) |
| `description` | string, may be empty | |
| `counterparty` | string \| `null` | Trimmed cell text; `null` when unmapped or empty, so the row has no vendor ([FR-026](spec.md#fr-026)) |
| `duplicate` | boolean | Set once when the batch is created, never recomputed ([FR-024](spec.md#fr-024)) |
| `included` | boolean | Starts as `!duplicate` ([FR-025](spec.md#fr-025)) |
| `assignment` | `{ type: "category", categoryId }` \| `{ type: "transfer", counterAccountId }` | Starts as the row side's "Uncategorised" ([FR-029](spec.md#fr-029)) |

A category assignment uses the row's side: expense when `amountCents` ≤ 0, income otherwise
([R-12](research.md#r-12)). A transfer's counter-account differs from the batch account.

### Settings

| Field | Type | Notes |
|---|---|---|
| `manualEntryAccountId` | Account id | Default account of the manual-entry form ([FR-006](spec.md#fr-006)) |

## Derived values

Derived values are computed by domain functions from the state above and never stored.

**Signed effect** of a transaction on an account:

| Kind | On `accountId` | On `destinationAccountId` |
|---|---|---|
| expense | −amount | — |
| income | +amount | — |
| transfer | −amount | +amount |

- **Account balance**: `openingBalanceCents` plus the sum of signed effects on the account
  ([FR-002](spec.md#fr-002)).
- **Proposed kind** of a parsed row: expense when `amountCents` ≤ 0, income otherwise
  ([FR-023](spec.md#fr-023), [R-12](research.md#r-12)).
- **Vendor key** of a parsed row: the name key of `counterparty`, or none when it is `null`
  ([FR-026](spec.md#fr-026)).
- **Rows under review**: parsed rows with `included` true ([FR-025](spec.md#fr-025)). Vendor groups
  are formed over these rows, per side ([FR-026](spec.md#fr-026)).
- **Budget progress** and **Insights aggregates**: see [R-14](research.md#r-14).

## Invariants

Every stored state satisfies these. Restoring a backup checks all of them and refuses the file if any
fails ([FR-072](spec.md#fr-072)); domain tests assert that no operation can break them.

1. Ids are unique within each entity type; transaction `seq` values are unique.
2. Account names are non-empty and unique by name key.
3. Each side has exactly one category with role `uncategorised` and exactly one with role
   `unaccounted`. Category names are non-empty and unique by name key within a side. Colours match
   `#rrggbb`.
4. Every transaction has a valid calendar date, a safe-integer `amountCents` ≥ 0, and an existing
   `accountId`. An expense or income references an existing category of its own side and has no
   destination. A transfer references an existing destination account different from `accountId`
   and has no category.
5. Every budget references an existing expense category with role `null`, and has a safe-integer
   `limitCents` > 0.
6. Mapping profile names are unique by name key. Each profile's column refs match its
   `hasHeaderRow` variant, and its date format, decimal separator and encoding come from the
   supported lists.
7. At most one pending batch exists, and it references an existing account. Its row numbers are
   unique. Every parsed row has a valid date and a safe-integer amount. A category assignment
   references an existing category of the row's side with a role other than `unaccounted`
   ([FR-030](spec.md#fr-030)). A transfer assignment references an existing account other than the
   batch account. Every unparsable row carries a known failure code.
8. `settings.manualEntryAccountId` references an existing account.

## State transitions

**Pending batch**

```text
(none) ── import a file ──────────────▶ pending            FR-020 – FR-028
pending ── confirm ───────────────────▶ (none) + ledger    FR-027
pending ── discard ───────────────────▶ (none)             FR-027
pending ── import another file ───────▶ refused, unchanged FR-022
```

**Pending row**: an unparsable row never changes and is never confirmed. In a parsed row,
`assignment` switches between a category of the row's side and a transfer
([FR-023](spec.md#fr-023)). The UI offers the `included` toggle only for duplicate rows
([FR-025](spec.md#fr-025)).

**Confirmation** turns each row under review into a transaction on the batch account, all in one
storage transaction ([FR-027](spec.md#fr-027)):

| Assignment | `amountCents` ≤ 0 | `amountCents` > 0 |
|---|---|---|
| category | expense, `accountId` = batch account | income, `accountId` = batch account |
| transfer | transfer from the batch account to the counter-account | transfer from the counter-account to the batch account |

The amount becomes the absolute value. New transactions get consecutive `seq` values in file
order. Confirmation does not change `settings` ([FR-006](spec.md#fr-006)).

**Category deletion** ([FR-034](spec.md#fr-034)): the category's transactions move to the same
side's "Uncategorised", its budget is removed, and pending rows assigned to it move to the same
side's "Uncategorised". The last part keeps invariant 7 true ([R-12](research.md#r-12)).

**Manual-entry default** ([FR-006](spec.md#fr-006)): `settings.manualEntryAccountId` changes only
when a transaction is created from the manual-entry form. It becomes that transaction's `accountId`.

## Storage layout

One IndexedDB database, `financial-copilot`, schema version 1 ([R-06](research.md#r-06)):

| Store | Key | Records |
|---|---|---|
| `accounts` | `id` | Account |
| `categories` | `id` | Category |
| `transactions` | `id` | Transaction |
| `budgets` | `categoryId` | Budget |
| `profiles` | `id` | Mapping profile |
| `pendingBatch` | `id` | Pending batch, at most one record |
| `settings` | fixed key `settings` | Settings, exactly one record |

There are no secondary indexes, because the whole state is loaded into memory at start
([R-05](research.md#r-05)). The backup file holds the same records ([contracts/backup-file.md](contracts/backup-file.md)).

## Seed data

Written in the same storage transaction that creates the database, so a first launch is
all-or-nothing ([R-06](research.md#r-06)).

- Account "Cash", type `cash`, opening balance 0 ([FR-006](spec.md#fr-006)).
- `settings.manualEntryAccountId` set to that account.
- Categories ([FR-031](spec.md#fr-031)):

| Side | Name | Colour | Role |
|---|---|---|---|
| expense | Groceries | `#40c057` | — |
| expense | Eating out | `#fd7e14` | — |
| expense | Housing | `#4c6ef5` | — |
| expense | Utilities | `#15aabf` | — |
| expense | Transport | `#228be6` | — |
| expense | Health | `#fa5252` | — |
| expense | Shopping | `#e64980` | — |
| expense | Leisure | `#be4bdb` | — |
| expense | Travel | `#12b886` | — |
| expense | Uncategorised | `#adb5bd` | `uncategorised` |
| expense | Unaccounted | `#495057` | `unaccounted` |
| income | Salary | `#37b24d` | — |
| income | Interest | `#fab005` | — |
| income | Gifts | `#7950f2` | — |
| income | Uncategorised | `#adb5bd` | `uncategorised` |
| income | Unaccounted | `#495057` | `unaccounted` |

The list includes "Groceries" and "Eating out" because acceptance scenarios start from them
([User Story 1](spec.md#user-story-1), [User Story 6](spec.md#user-story-6)). It leaves out
"Refunds" on both sides, because [User Story 6](spec.md#user-story-6) scenario 5 creates them.
