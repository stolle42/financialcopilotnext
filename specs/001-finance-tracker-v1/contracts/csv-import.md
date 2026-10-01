# Contract: Bank CSV → pending batch

**Spec**: [FR-020 – FR-029](../spec.md#fr-020) · **Entities**: [data-model.md](../data-model.md#mapping-profile)

This contract covers the interface between a bank's CSV export and the app: which files are
accepted, and how a mapping profile turns each record into a pending row. The behaviour rules are
in the spec. This file pins down the formats those rules leave open.

## Pipeline

One code path serves both the import and the profile preview ([FR-021](../spec.md#fr-021)). The
preview therefore always shows what the import will produce.

1. **Read** the file's bytes.
2. **Decode** the bytes with the profile's [encoding](#encodings). Decoding is strict: a byte
   sequence that is invalid in that encoding stops the import. The message suggests trying
   another encoding.
3. **Tokenise** the text into records of cells. The delimiter is detected automatically from `,`,
   `;`, tab and `|` ([R-09](../research.md#r-09)). Quoted cells may contain delimiters, line
   breaks and doubled quotes. A record whose cells are all empty after trimming is skipped. It
   becomes no pending row, but keeps its place in the row numbering
   ([data-model.md](../data-model.md#pending-row)), so a row number always matches what a
   spreadsheet shows.
4. **Check the layout**. This step depends on the profile's header mode:
   - With a header row, record 1 is the header. Every mapped column is looked up by header text,
     compared by name key (trimmed, case-insensitive). If a mapped header is missing, no batch is
     created and the message names every missing column ([FR-021](../spec.md#fr-021)). If a
     mapped header appears more than once, no batch is created and the message names it.
   - With "no header row", every record is data. Columns are taken by position and the layout is
     not checked ([FR-021](../spec.md#fr-021)).
5. **Require data**. If no data records remain, no batch is created and the user is told that the
   file contained no transactions ([edge cases](../spec.md#edge-cases)).
6. **Parse** each data record into a parsed or an unparsable row, as described below. A record
   with too few cells has its missing cells treated as empty.
7. **Flag duplicates** once, using [the matching rule](#duplicate-matching)
   ([FR-024](../spec.md#fr-024)).
8. **Store** the batch. The storage transaction refuses again if a batch already exists, in
   addition to the check before the import starts ([FR-022](../spec.md#fr-022)).

## Cells

Every cell is trimmed of surrounding whitespace before any rule below applies.

| Role | Rule |
|---|---|
| Date | Must match the profile's [date format](#date-formats) exactly |
| Amount | [Amount grammar](#amount-grammar), then the [direction rules](#direction) |
| Description | Any text; an empty cell gives an empty description ([FR-010](../spec.md#fr-010)) |
| Counterparty | Any text; an empty cell gives `null`, which means the row has no vendor ([R-11](../research.md#r-11)) |

## Amount grammar

Let **D** be the profile's decimal separator and **T** the other one ([FR-028](../spec.md#fr-028)).
An amount cell must consist of:

1. an optional sign, `-` or `+`;
2. an integer part of at most 12 digits, written either without separators or as 1–3 digits
   followed by groups of exactly 3 digits, each group preceded by **T**;
3. an optional fraction: **D** followed by 1 or 2 digits.

Nothing else may appear in the cell: no currency symbol, no inner spaces, no trailing sign. The
value is converted to integer cents without passing through floating point.

| Cell | D = `,` | D = `.` |
|---|---|---|
| `1.250,00` | 125000 | unparsable |
| `1,250.00` | unparsable | 125000 |
| `-40,5` | −4050 | unparsable |
| `40,00` | 4000 | unparsable: `00` is not a group of 3 |
| `40` | 4000 | 4000 |
| `40,123` | unparsable: 3 decimals | 4012300 |
| `-40,00 €` | unparsable | unparsable |

The strict grouping turns the most dangerous mistake into an unparsable row instead of a silently
wrong amount. That mistake is a `,` decimal file read with a `.` profile, which would turn `40,00`
into 4,000.00.

## Direction

**Signed column** (`amount.mode = "signed"`): the parsed value is the row's `amountCents`, negated
when `invertSign` is on ([FR-023](../spec.md#fr-023)). Negative means money out, positive means money
in. Zero is proposed as an expense ([R-12](../research.md#r-12)).

**Debit and credit columns** (`amount.mode = "debit-credit"`): a cell *holds a value* when it is
non-empty after trimming, so `0,00` is a value. Exactly one of the two cells must hold a value
([FR-028](../spec.md#fr-028)). That value must parse and must not be negative. A debit value `v`
gives `amountCents = −v` and a credit value gives `+v`.

## Date formats

| Format | Example |
|---|---|
| `DD.MM.YYYY` | `03.09.2026` |
| `DD.MM.YY` | `03.09.26` |
| `DD/MM/YYYY` | `03/09/2026` |
| `MM/DD/YYYY` | `09/03/2026` |
| `YYYY-MM-DD` | `2026-09-03` |
| `DD-MM-YYYY` | `03-09-2026` |

`DD` and `MM` accept one or two digits, so `3.9.2026` matches `DD.MM.YYYY`. `YY` means 20YY. The
result must be a real calendar date, so `31.02.2026` is unparsable. A time or any other extra text
in the cell makes it unparsable.

## Encodings

| Encoding | Notes |
|---|---|
| UTF-8 | Default for a new profile. A leading byte-order mark is ignored |
| Windows-1252 | Also covers files labelled ISO-8859-1 or Latin-1 |
| ISO-8859-15 | Latin-9, which includes the € sign |
| UTF-16LE | A leading byte-order mark is ignored |

## Unparsable rows

Each unparsable row carries one failure code. The message catalogue in
[ui.md](ui.md#message-catalogue) turns codes into plain language ([FR-067](../spec.md#fr-067)). When a
row has several problems, the first in this table is reported.

| Code | Meaning | Details shown |
|---|---|---|
| `date-missing` | The date cell is empty | — |
| `date-unreadable` | The date does not match the format, or is not a real date | Cell text, expected format |
| `amount-missing` | Signed mode: the amount cell is empty | — |
| `amount-unreadable` | The amount does not follow the grammar | Cell text, decimal separator |
| `debit-and-credit` | Both the debit and the credit cell hold a value | Both cell texts |
| `no-debit-or-credit` | Neither the debit nor the credit cell holds a value | — |
| `negative-debit-credit` | A debit or credit value is negative | Cell text |

## Duplicate matching

The rule is [FR-024](../spec.md#fr-024). This section fixes how it is computed.

- **Signed effect**: an entry's amount and direction combine into its *signed effect* on an
  account, negative for money out and positive for money in.
  - For a ledger transaction, the effect on each account it touches is defined in
    [data-model.md](../data-model.md#derived-values). A transfer therefore has one effect on its
    source account and another on its destination.
  - For a parsed row, the effect is its `amountCents` on the batch account.
- **Match**: two entries match when their account, date and signed effect on that account are
  equal.
- **Earlier row**: an earlier row of the same batch is a parsed row with a lower row number.
  Unparsable rows are ignored.
- **Text**: counterparties play no part, just as descriptions do.
- **Speed**: matching uses a hash of (account, date, signed effect), so 5,000 rows take linear
  time ([SC-010](../spec.md#sc-010)).

## Vendor groups

These rules apply to the rows under review ([data-model.md](../data-model.md#derived-values)).

- Rows with the same vendor key **and** the same side form a group ([R-11](../research.md#r-11)).
- A group shows the first row's counterparty text, the side, the row count and the total.
- A group of one row is shown as a plain row ([FR-026](../spec.md#fr-026)).
- Rows without a vendor are always shown as plain rows.
- Setting a group's assignment sets it on every row currently in the group
  ([FR-026](../spec.md#fr-026)). The assignment is either a category of the group's side or a
  transfer to or from another account.
- A row that is included later ([FR-025](../spec.md#fr-025)) joins its group with its own
  assignment unchanged.

## Outcomes

| Situation | Result |
|---|---|
| A batch is already pending | Refused before reading the file ([FR-022](../spec.md#fr-022)) |
| The bytes are invalid in the chosen encoding | No batch; suggests another encoding |
| A mapped header is missing | No batch; names every missing column ([FR-021](../spec.md#fr-021)) |
| A mapped header is duplicated | No batch; names it |
| There are no data records | No batch; says the file contained no transactions |
| Otherwise | A batch with counts of rows under review, duplicates and unparsable rows ([FR-025](../spec.md#fr-025), [FR-028](../spec.md#fr-028)) |

## Preview

While a profile is being defined or edited, the first 10 data records of the chosen file are shown
as they would be parsed ([FR-021](../spec.md#fr-021)). Each record shows its date, signed amount,
description and, when mapped, its counterparty, or else its failure reason. The preview refreshes on
every change to a setting. When an existing profile is edited, the user picks a sample file for the
preview.
