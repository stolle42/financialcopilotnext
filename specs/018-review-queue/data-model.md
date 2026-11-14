# Data Model: Review queue (v1.8)

**Spec**: [spec.md](spec.md) · **Decisions**: [research.md](research.md) · **Everything else**:
[001 data-model.md](../001-finance-tracker-v1/data-model.md)

This file restates only the parts of the data model that v1.8 changes. Each one replaces the
section of 001 named in its heading, and that section links here
([.claude/rules/specs.md](../../.claude/rules/specs.md)). Conventions, the other entities, seed
data and the storage layout's stores stay as 001 defines them.

Every field v1.8 adds is optional, so a state saved by v1.7 is a valid v1.8 state, and v1.7 reads a
v1.8 state without them ([R-39](research.md#r-39)).

<a id="transaction"></a>
## Transaction

Replaces 001's [Transaction](../001-finance-tracker-v1/data-model.md#transaction).

| Field | Type | Present when | Notes |
|---|---|---|---|
| `id` | string | always | |
| `seq` | positive integer | always | Creation order, unique; breaks ties between equal dates in the list ([FR-016](../001-finance-tracker-v1/spec.md#fr-016)) |
| `date` | calendar date | always | |
| `amountCents` | integer ≥ 0 | always | [FR-010](../001-finance-tracker-v1/spec.md#fr-010) |
| `accountId` | Account id | always | For a transfer, the account the money leaves |
| `description` | string, may be empty | always | |
| `kind` | `expense` \| `income` \| `transfer` | always | |
| `categoryId` | Category id | expense, income | Category of the same side ([FR-011](../001-finance-tracker-v1/spec.md#fr-011)) |
| `destinationAccountId` | Account id | transfer | Differs from `accountId` ([FR-011](../001-finance-tracker-v1/spec.md#fr-011)) |
| `vendor` | non-empty string | optional | The counterparty as booked on `accountId`, kept from the row it was confirmed from ([FR-145](spec.md#fr-145), [R-40](research.md#r-40)) |
| `destinationVendor` | non-empty string | optional, transfer only | The counterparty as booked on `destinationAccountId` ([R-40](research.md#r-40)) |

A transaction never holds both `categoryId` and `destinationAccountId`. Kind changes follow
[FR-015](../001-finance-tracker-v1/spec.md#fr-015); a change away from transfer drops
`destinationVendor` and keeps `vendor`. No screen shows or edits a vendor, and no other edit
changes it ([FR-145](spec.md#fr-145)). A transaction entered by hand, or confirmed before v1.8, has
neither field. Saving from the manual-entry form refuses the "Unaccounted" category unless the
transaction already held it (editing a reconciliation entry;
[FR-030](../001-finance-tracker-v1/spec.md#fr-030),
[001 contracts/ui.md](../001-finance-tracker-v1/contracts/ui.md#transaction-form)).

<a id="pending-row"></a>
## Pending row

Replaces 001's [Pending row](../001-finance-tracker-v1/data-model.md#pending-row).

Every row has a `rowNumber`: its record number in the file, counting the header (when present) as
row 1, as a spreadsheet shows it. It identifies the row within the batch and in messages. The row's
`status` decides its other fields.

**`status: "unparsable"`** ([FR-028](../001-finance-tracker-v1/spec.md#fr-028)):

| Field | Type | Notes |
|---|---|---|
| `cells` | string list | The raw cells, shown next to the reason |
| `failure` | failure code + details | Codes in [001 csv-import.md](../001-finance-tracker-v1/contracts/csv-import.md#unparsable-rows) |

**`status: "parsed"`**:

| Field | Type | Notes |
|---|---|---|
| `date` | calendar date | |
| `amountCents` | integer, any sign | Signed effect on the batch account after sign inversion: negative is money out ([FR-023](../001-finance-tracker-v1/spec.md#fr-023)) |
| `description` | string, may be empty | |
| `counterparty` | string \| `null` | Trimmed cell text; `null` when unmapped or empty, so the row has no vendor ([FR-026](../001-finance-tracker-v1/spec.md#fr-026)) |
| `duplicate` | boolean | Set once when the batch is created, never recomputed ([FR-156](spec.md#fr-156)) |
| `included` | boolean | Starts as `!duplicate` ([FR-025](../001-finance-tracker-v1/spec.md#fr-025)) |
| `assignment` | see below | Starts as [FR-158](spec.md#fr-158) says ([State transitions](#state-transitions)) |
| `keptInReview` | `true`, or absent | Present once the user assigned the row anything or brought it back, so it is never set aside ([FR-152](spec.md#fr-152), [R-45](research.md#r-45)) |
| `seen` | `true`, or absent | Present once the row, or its vendor group, was current and another item became current ([FR-151](spec.md#fr-151), [R-44](research.md#r-44)) |

**`assignment`** is one of:

| Type | Fields | Notes |
|---|---|---|
| category | `categoryId`, `suggested?`, `usual?` | A category of the row's side. `suggested` is `true` when the AI suggested it ([FR-093](../001-finance-tracker-v1/spec.md#fr-093)); `usual` is `true` when it is the row's usual category ([FR-147](spec.md#fr-147)). Each is absent otherwise, never `false`, and never both |
| transfer | `counterAccountId`, `usual?`, `pairedTransactionId?`, `usualCategoryId?` | `usual` is `true` when it is the row's usual transfer ([FR-147](spec.md#fr-147)). `pairedTransactionId` is present while the row holds its suggested transfer: the id of the transaction it pairs with ([FR-142](spec.md#fr-142)). `usualCategoryId`, only beside `pairedTransactionId`, is the row's usual category, which turning the switch off gives the row ([FR-143](spec.md#fr-143)). Never both `usual` and `pairedTransactionId` |

A category assignment uses the row's side: expense when `amountCents` ≤ 0, income otherwise
([R-12](../001-finance-tracker-v1/research.md#r-12)). A transfer's counter-account differs from the
batch account. `pairedTransactionId` is not a reference the state must keep valid: the transaction
may be deleted or changed while the batch is pending, and the row then confirms as an ordinary
transfer ([FR-144](spec.md#fr-144), [Derived values](#derived-values)).

<a id="settings"></a>
## Settings

Replaces 001's [Settings](../001-finance-tracker-v1/data-model.md#settings).

| Field | Type | Notes |
|---|---|---|
| `manualEntryAccountId` | Account id | Default account of the manual-entry form ([FR-006](../001-finance-tracker-v1/spec.md#fr-006)) |
| `aiFeatures` | `true`, or absent | Present while the user has the AI features switch on ([FR-095](../001-finance-tracker-v1/spec.md#fr-095)); never `false`. AI features are on only while it is present and a key is stored ([001 OpenAI key](../001-finance-tracker-v1/data-model.md#openai-key)) |
| `model` | model id, or absent | The chosen model ([FR-129](../001-finance-tracker-v1/spec.md#fr-129), [FR-130](../001-finance-tracker-v1/spec.md#fr-130)). Absent means the default. Any non-empty string is kept, also one no longer in the list; the model in use is then the default ([R-32](../001-finance-tracker-v1/research.md#r-32)) |
| `setAsideUnderCents` | positive safe integer, or absent | The amount under which review sets rows aside, for every account; absent while the field is empty ([FR-152](spec.md#fr-152), [R-45](research.md#r-45)) |

Settings is part of a backup, `model` and `setAsideUnderCents` included
([FR-160](spec.md#fr-160)). Since v1.6 it never holds the key, so nothing that saves
`state.settings` can carry it.

<a id="derived-values"></a>
## Derived values

Replaces the bullet **Rows under review** of 001's
[Derived values](../001-finance-tracker-v1/data-model.md#derived-values), and adds the values below
it. Like every derived value, they are computed by domain functions and never stored.

- **Set aside**: a parsed row is set aside while all of these hold ([FR-152](spec.md#fr-152)):
  `included` is true; `settings.setAsideUnderCents` is present and the absolute `amountCents` is
  less than it; its assignment is a category; and it has no `keptInReview`.
- **Rows under review**: parsed rows with `included` true that are not set aside
  ([FR-025](../001-finance-tracker-v1/spec.md#fr-025)).
- **Vendor groups** are formed over the rows under review that do not hold a suggested transfer,
  per side ([FR-026](../001-finance-tracker-v1/spec.md#fr-026), [FR-143](spec.md#fr-143)). A row
  holding a suggested transfer is shown as a plain row
  ([contracts/csv-import.md](contracts/csv-import.md#vendor-groups)).
- **Pair fits**: a row's `pairedTransactionId` names a transaction that still exists, is an expense
  or income on `counterAccountId`, and has the row's absolute amount
  ([FR-144](spec.md#fr-144), [R-41](research.md#r-41)).
- **Review items**: the suggested transfers, the vendor groups (each followed by its rows while
  unfolded) and the plain rows, in the order review shows them
  ([contracts/ui.md](contracts/ui.md#review)). The order of Tab ([FR-150](spec.md#fr-150)).
- **Seen item**: a row with `seen`; a vendor group all of whose rows have `seen`
  ([FR-151](spec.md#fr-151)). **Items not seen**: the suggested transfers, vendor groups and plain
  rows that are not seen.

<a id="invariants"></a>
## Invariants

Replaces invariants 4, 7 and 8 of 001's
[Invariants](../001-finance-tracker-v1/data-model.md#invariants); the others stay. Restoring a
backup checks all of them ([FR-072](../001-finance-tracker-v1/spec.md#fr-072)).

4. Every transaction has a valid calendar date, a safe-integer `amountCents` ≥ 0, and an existing
   `accountId`. An expense or income references an existing category of its own side and has no
   destination. A transfer references an existing destination account different from `accountId`
   and has no category. `vendor`, when present, is non-empty after trimming; `destinationVendor`
   is present only on a transfer, and is then non-empty after trimming.
7. At most one pending batch exists, and it references an existing account. Its row numbers are
   unique. Every parsed row has a valid date and a safe-integer amount.
   - A category assignment references an existing category of the row's side with a role other
     than `unaccounted` ([FR-030](../001-finance-tracker-v1/spec.md#fr-030)). A suggested category
     assignment references a category with role `null`
     ([FR-092](../001-finance-tracker-v1/spec.md#fr-092)). It never holds both `suggested` and
     `usual`.
   - A transfer assignment references an existing account other than the batch account. It never
     holds both `usual` and `pairedTransactionId`. `usualCategoryId` is present only with
     `pairedTransactionId`, and references an existing category of the row's side with role
     `null`.
   - `keptInReview` and `seen`, when present, are `true`.
   - Every unparsable row carries a known failure code.
8. `settings.manualEntryAccountId` references an existing account. `settings.model`, when
   present, is a non-empty string. `settings.setAsideUnderCents`, when present, is a safe integer
   greater than 0. Settings holds no field for the key.

<a id="state-transitions"></a>
## State transitions

Replaces the **Pending row**, **Confirmation** and **Category deletion** parts of 001's
[State transitions](../001-finance-tracker-v1/data-model.md#state-transitions); the others stay.

**Creating a batch** ([FR-142](spec.md#fr-142), [FR-146](spec.md#fr-146),
[FR-156](spec.md#fr-156), [FR-158](spec.md#fr-158)), in this order:

1. Duplicates are flagged ([contracts/csv-import.md](contracts/csv-import.md#duplicate-matching)).
2. Rows that are not flagged are paired with the other side of a transfer
   ([R-41](research.md#r-41)).
3. Every parsed row's usual choice is found ([R-42](research.md#r-42)).
4. Each parsed row starts with:

| The row has | `assignment` |
|---|---|
| a suggested transfer | transfer with the paired transaction's account and `pairedTransactionId`; `usualCategoryId` when its usual choice is a category |
| else a usual category | that category with `usual: true` |
| else a usual transfer | transfer with that counter-account and `usual: true` |
| else | the side's "Uncategorised" |

No row starts with `keptInReview` or `seen`.

**Pending row**: an unparsable row never changes and is never confirmed. In a parsed row:

| Event | Effect |
|---|---|
| The user picks a category, for the row or its group, also by creating one ([FR-149](spec.md#fr-149)) | That category, without marks; `keptInReview` |
| The user turns the Transfer switch on, or picks a counter-account | A transfer with that account, without marks; `keptInReview` ([FR-143](spec.md#fr-143)) |
| The user turns the Transfer switch off | The category in `usualCategoryId` if the row held a suggested transfer with one, otherwise the side's "Uncategorised", without marks; `keptInReview` ([FR-143](spec.md#fr-143), [FR-147](spec.md#fr-147)) |
| The user brings a row set aside back ([FR-153](spec.md#fr-153)) | `keptInReview`; the assignment stays |
| The set-aside amount changes ([FR-152](spec.md#fr-152)) | Nothing stored on the row: whether it is set aside is derived |
| Applying AI suggestions ([FR-092](../001-finance-tracker-v1/spec.md#fr-092)) | A row under review still in "Uncategorised" gets the suggested category with `suggested: true` |
| The current item changes from this row, or from its group ([FR-151](spec.md#fr-151)) | `seen` |
| The UI includes or excludes a flagged row ([FR-025](../001-finance-tracker-v1/spec.md#fr-025)) | `included` |

**Confirmation** ([FR-157](spec.md#fr-157)) changes the ledger in one storage transaction:

- A row under review with a suggested transfer whose pair fits changes the paired transaction
  into a transfer from the account the money leaves to the account it enters. Its `id`, `seq`,
  `date`, `amountCents` and `description` stay; `categoryId` goes. Its own vendor moves to the
  field of its own account, and the row's counterparty fills the field of the batch account
  ([FR-144](spec.md#fr-144), [R-40](research.md#r-40)).
- Every other included row becomes a new transaction on the batch account:

| Row | `amountCents` ≤ 0 | `amountCents` > 0 |
|---|---|---|
| set aside | expense in the side's "Uncategorised" | income in the side's "Uncategorised" |
| category | expense with that category | income with that category |
| transfer, or a suggested transfer whose pair no longer fits | transfer from the batch account to the counter-account | transfer from the counter-account to the batch account |

  The amount becomes the absolute value. New transactions get consecutive `seq` values in file
  order. The row's counterparty, when not `null`, becomes `vendor` when the batch account is
  `accountId`, and `destinationVendor` when it is the destination ([FR-145](spec.md#fr-145)).
- The batch is deleted. Confirmation does not change `settings`
  ([FR-006](../001-finance-tracker-v1/spec.md#fr-006)). A suggested or usual category books
  exactly as a chosen one, and the transaction keeps no mark ([FR-147](spec.md#fr-147)).

**Category deletion** ([FR-034](../001-finance-tracker-v1/spec.md#fr-034)): the category's
transactions move to the same side's "Uncategorised", and its budget is removed. Pending rows
assigned to it move to the same side's "Uncategorised" without marks, and a transfer assignment
whose `usualCategoryId` names it loses that field. This keeps invariant 7 true
([R-12](../001-finance-tracker-v1/research.md#r-12)).

<a id="storage-layout"></a>
## Storage layout

The stores and keys of 001's
[Storage layout](../001-finance-tracker-v1/data-model.md#storage-layout) stay, and the schema
version stays 1. v1.8 adds fields only: `vendor` and `destinationVendor` to records of
`transactions`, `keptInReview`, `seen` and the assignment marks to rows of the `pendingBatch`
record, and `setAsideUnderCents` to the `settings` record. v1.7 reads a v1.8 database, and v1.8 a
v1.7 one, without migrating ([R-39](research.md#r-39)). The backup holds the same records
([contracts/backup-file.md](contracts/backup-file.md)).
