# Contract: Bank CSV → pending batch (v1.8 changes)

**Spec**: [FR-142](../spec.md#fr-142), [FR-146](../spec.md#fr-146), [FR-156](../spec.md#fr-156),
[FR-158](../spec.md#fr-158) · **Entities**: [data-model.md](../data-model.md#pending-row) ·
**Everything else**: [001 csv-import.md](../../001-finance-tracker-v1/contracts/csv-import.md)

v1.8 changes what happens after the rows are parsed: duplicates are matched with a window for
transfers, rows are paired with the other side of a transfer, and each row's usual choice is found.
Reading, decoding, the layout, cells, amounts, dates and failure codes stay as 001 defines them.

<a id="pipeline"></a>
## Pipeline

Steps 1–6 of 001's [Pipeline](../../001-finance-tracker-v1/contracts/csv-import.md#pipeline) stay.
Its steps 7 and 8 become:

7. **Flag duplicates** once, using [the matching rule](#duplicate-matching)
   ([FR-156](../spec.md#fr-156)).
8. **Pair transfers** once among the rows not flagged ([Suggested transfers](#suggested-transfers),
   [FR-142](../spec.md#fr-142)).
9. **Find usual choices** once for every parsed row ([Usual choices](#usual-choices),
   [FR-146](../spec.md#fr-146)), and give each row its starting assignment
   ([data-model.md](../data-model.md#state-transitions), [FR-158](../spec.md#fr-158)).
10. **Store** the batch. The storage transaction refuses again if a batch already exists, in
    addition to the check before the import starts ([FR-155](../spec.md#fr-155)).

Steps 7–9 are one pure domain function each, run in this order by `createBatch`, so the preview,
which stops at step 6, is unchanged.

<a id="duplicate-matching"></a>
## Duplicate matching

Replaces 001's
[Duplicate matching](../../001-finance-tracker-v1/contracts/csv-import.md#duplicate-matching). The
rule is [FR-156](../spec.md#fr-156). This section fixes how it is computed.

- **Signed effect**: an entry's amount and direction combine into its *signed effect* on an
  account, negative for money out and positive for money in.
  - For a ledger transaction, the effect on each account it touches is defined in
    [001 data-model.md](../../001-finance-tracker-v1/data-model.md#derived-values). A transfer
    therefore has one effect on its source account and another on its destination.
  - For a parsed row, the effect is its `amountCents` on the batch account.
- **Match**: a row matches an entry when their account and signed effect on that account are
  equal, and:
  - for an expense, an income or an earlier row, their dates are equal;
  - for a transfer, their dates are at most 4 days apart, either way.
- **Earlier row**: an earlier row of the same batch is a parsed row with a lower row number.
  Unparsable rows are ignored.
- **Text**: counterparties play no part, just as descriptions do.
- **Speed** ([SC-010](../../001-finance-tracker-v1/spec.md#sc-010)): expenses, incomes and earlier
  rows are matched by a hash of (date, signed effect). Transfers touching the batch account are
  matched by a hash of signed effect, holding their dates; a row then looks at each date of that
  effect. 5,000 rows take linear time in practice, since few transfers share one amount.

The window means that re-importing a file whose row became one side of a transfer through
[FR-144](../spec.md#fr-144) flags it, even though the transfer carries the other bank's date
([SC-030](../spec.md#sc-030)).

<a id="suggested-transfers"></a>
## Suggested transfers

The rule is [FR-142](../spec.md#fr-142); the algorithm is [R-41](../research.md#r-41).

- **Candidates**: every ledger expense or income whose account is not the batch account, whose
  category's role is not `unaccounted`, and whose amount is not zero.
- **Other side**: a row and a candidate are each other's other side when the candidate's amount is
  the row's absolute `amountCents`, the row is money in and the candidate an expense, or the row
  is money out and the candidate an income, and their dates are at most 4 days apart.
- **Rows**: parsed rows not flagged as duplicates. A row whose `amountCents` is zero has no other
  side.
- **Pairing**: all possible pairs are sorted by days apart, then the row's number, then the
  candidate's date, then its `seq`. Pairs are taken in that order, skipping a pair whose row or
  candidate is already taken. The outcome is the same in every run.
- **Result**: the row holds a transfer with the candidate's account as counter-account and
  `pairedTransactionId` set to the candidate's id
  ([data-model.md](../data-model.md#pending-row)).
- **Speed**: candidates are indexed by amount, so 5,000 rows against 10,000 transactions take
  linear time in practice ([SC-010](../../001-finance-tracker-v1/spec.md#sc-010)).

A row's vendor plays no part in pairing: the two banks name the transfer differently.

<a id="usual-choices"></a>
## Usual choices

The rule is [FR-146](../spec.md#fr-146); the algorithm is [R-42](../research.md#r-42).

- **Vendor key**: as in [FR-026](../../001-finance-tracker-v1/spec.md#fr-026), the trimmed vendor
  text, compared ignoring case. A row with `counterparty` `null` has no usual choice.
- **The transactions that count**, for a row with money out:
  - expenses whose `vendor` has the row's vendor key, on any account;
  - transfers whose `accountId` is the batch account and whose `vendor` has that key.

  For a row with money in:
  - incomes whose `vendor` has that key, on any account;
  - transfers whose `destinationAccountId` is the batch account and whose `destinationVendor` has
    that key.
- **Choices**: each category is one choice (`category:<id>`), and the transfers with each
  counter-account are one choice (`transfer:<account id>`). A choice held by more than half of the
  transactions that count is the usual choice. When that choice is a category with role
  `uncategorised` or `unaccounted`, there is none.
- **Every row**: every parsed row, a duplicate included, gets its usual choice, so including it
  later shows the same start ([R-42](../research.md#r-42)). A row that also has a suggested
  transfer keeps a usual category in `usualCategoryId`, and drops a usual transfer.
- **Speed**: one pass over the transactions builds the counts per (vendor key, direction) for the
  batch account; each row then reads its entry ([SC-010](../../001-finance-tracker-v1/spec.md#sc-010)).

<a id="vendor-groups"></a>
## Vendor groups

Replaces 001's
[Vendor groups](../../001-finance-tracker-v1/contracts/csv-import.md#vendor-groups). The grouping
rule is [FR-026](../../001-finance-tracker-v1/spec.md#fr-026), applied to the rows under review that
do not hold a suggested transfer ([data-model.md](../data-model.md#derived-values),
[FR-143](../spec.md#fr-143)). In data terms, a group is the set of those rows that share a vendor key
and a side. This section adds what review shows and how later changes behave.

- A group shows the first row's counterparty text, the side, the row count and the total.
- Setting a group's assignment sets it on every row currently in the group, without marks, and
  keeps each row in review ([data-model.md](../data-model.md#state-transitions)). The assignment
  is either a category of the group's side or a transfer to or from another account.
- A row that is included later ([FR-025](../../001-finance-tracker-v1/spec.md#fr-025)), brought
  back ([FR-153](../spec.md#fr-153)), or whose suggested transfer ends
  ([FR-143](../spec.md#fr-143)), joins its group with its own assignment unchanged.
- A row set aside leaves its group ([FR-152](../spec.md#fr-152)). A group left with one row shows it
  as a plain row.
- A group shows a mark only when all its rows hold the same mark and the same assignment
  ([FR-147](../spec.md#fr-147), [FR-093](../../001-finance-tracker-v1/spec.md#fr-093)).

<a id="outcomes"></a>
## Outcomes

001's [Outcomes](../../001-finance-tracker-v1/contracts/csv-import.md#outcomes) stay. The batch's
counts add the suggested transfers ([FR-143](../spec.md#fr-143)) and the rows set aside
([FR-153](../spec.md#fr-153)).
