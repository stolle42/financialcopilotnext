# Feature Specification: Financial Copilot v1 — Personal Finance Tracker

**Feature Branch**: `001-finance-tracker-v1`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: "We are building a personal finance tracker", plus a v1 features
document defining five capabilities (accounts, transactions, categories, budgets, insights) and an
explicit out-of-scope list. That document is folded into this spec in full; this spec is the single
source for what v1 contains. Nothing here is optional; nothing not here is in v1.

## Clarifications

### Session 2026-10-01

- Q: When an imported row is checked for duplicates against existing transactions, must the
  direction of the money (out of or into the account) also match? → A: Yes. A row matches only
  on the same account, date, amount and direction, so a same-day refund of a purchase is not a
  duplicate ([FR-024](#fr-024)).
- Q: In bank files with separate debit and credit columns, should a cell containing only zero
  (such as `0,00`) count as empty? → A: Yes. A zero cell counts as empty, so exactly one of the two
  columns must hold a non-zero amount ([FR-028](#fr-028)).
- Q: May the copy of the app hosted on Vercel be used for real financial data, or only for checks
  and demonstrations? → A: Only for checks and demonstrations; real data stays in the app as run
  locally ([FR-061](#fr-061)). Using a hosted copy for real data is out of scope for v1
  ([Out of Scope](#out-of-scope)).
- Q: If the user changes a category's monthly limit, should Insights measure earlier months against
  the new limit, or against the limit that applied in those months? → A: Against the new limit. A
  category has one limit at a time, and it applies to every month, past and present
  ([FR-041](#fr-041)).
- Q: Which imported rows should the review screen put into the same vendor group? → A: Rows with the
  same counterparty and the same direction (money out or in); rows without a counterparty stay
  ungrouped ([FR-026](#fr-026)).

### Session 2026-10-02

From the review of the [data-safety checklist](checklists/data-safety.md):

- Q: Must stored data and backup files be protected from other people using the same computer,
  for example by encryption or a passcode? → A: No, not in v1. The data is as safe as the
  computer's user account ([Out of Scope](#out-of-scope)).
- Q: Before a restore replaces current data, must the app offer to save a backup first? → A: No.
  The warning [FR-071](#fr-071) requires is the protection ([Out of Scope](#out-of-scope)).
- Q: Must a hosted copy show in the app that it serves only checks and demonstrations? → A: No.
  The project's documentation says so, and the app shows no notice
  ([Out of Scope](#out-of-scope)).
- The design's decisions on atomic changes, failed saves, a second tab, browser storage that may be
  cleared, outgoing requests, backup validity and versions, review progress, and confirmations
  are now requirements: [FR-022](#fr-022), [FR-061](#fr-061), [FR-069](#fr-069),
  [FR-072](#fr-072) – [FR-075](#fr-075) and [SC-014](#sc-014).
- Q: Do two names count as the same when they differ only in case or surrounding spaces, such as
  "Groceries" and " groceries"? → A: Yes. Account, category and mapping profile names are compared
  ignoring case and surrounding spaces ([FR-001](#fr-001), [FR-021](#fr-021), [FR-032](#fr-032)).
- Q: What kind should the app propose for an imported row whose amount is zero? → A: An expense,
  the same default as manual entry ([FR-023](#fr-023)).

<a id="user-scenarios"></a>
## User Scenarios & Testing *(mandatory)*

<a id="user-story-1"></a>
### User Story 1 - Keep a trustworthy ledger by hand (Priority: P1)

The user creates the accounts they want to track, each with its opening balance
([FR-001](#fr-001)), and records expenses, income, and transfers between their own accounts. Every account shows
a balance computed from its opening balance and its transactions. Manual entry is fast enough to use
for every cash purchase.

**Why this priority**: Every other capability reads from this ledger. Without accounts and
transactions there is nothing to import into, categorise, budget, or chart. A user with only this
story has a usable cash book.

**Independent Test**: Create two accounts, record an expense, an income, and a transfer, and confirm
both balances equal opening balance plus the net of their transactions. Delivers a working ledger.

**Acceptance Scenarios**:

1. **Given** a fresh install, **When** the user opens the account list, **Then** it contains exactly
   one account, the predefined "Cash", with balance 0.00.
2. **Given** only the predefined "Cash" account, **When** the user creates account "Checking" of
   type checking with opening balance 1,250.00, **Then** the account list shows "Checking" with
   balance 1,250.00.
3. **Given** "Checking" with balance 1,250.00, **When** the user records an expense of 40.00 dated
   2026-09-03, description "Weekly shop", category "Groceries", **Then** "Checking" shows 1,210.00.
4. **Given** "Checking" (1,210.00) and "Cash" (0.00), **When** the user records a transfer of 100.00
   from "Checking" to "Cash", **Then** "Checking" shows 1,110.00, "Cash" shows 100.00, and total
   spending and total income are unchanged.
5. **Given** the user is recording an expense, **When** the category picker opens, **Then** it offers
   expense categories only, including exactly one entry named "Uncategorised" and no entry named
   "Unaccounted" ([FR-030](#fr-030)).
6. **Given** the user is recording an expense or an income, **When** they look for a way to leave
   the category empty, **Then** none exists: the category holds the side's "Uncategorised" until
   they pick another.
7. **Given** the user sets the kind to transfer, **Then** the form offers a destination account in
   place of the category, and the destination picker does not offer the source account.
8. **Given** the predefined "Cash" account still exists, **When** the user opens manual entry,
   **Then** the kind is expense, the date is today, the amount is 0.00, the account is "Cash", the
   category is expense "Uncategorised", and the description is empty; **When** the user saves
   without changing anything, **Then** an expense of 0.00 with no description is booked to "Cash"
   in "Uncategorised".
9. **Given** the user's last manual entry was recorded to "Checking", **When** they open manual
   entry again, **Then** the account is "Checking".
10. **Given** "Checking" has an opening balance of 1,250.00, **When** the user changes the opening
    balance to 1,300.00, **Then** the app shows a severe warning that every
    balance this account has ever shown will change and asks for confirmation; **When** the user
    confirms, **Then** the computed balance rises by 50.00 and no transaction is created.
11. **Given** any account, **When** the user looks for a way to type in a balance directly, **Then**
    none exists; the only ways to change a balance are transactions, the opening balance, and
    reconciliation ([User Story 5](#user-story-5)).
12. **Given** the transactions from scenarios 3 and 4, **When** the user opens the app, **Then** the
    transaction list shows the transfer above the expense; **When** they filter by account "Cash",
    **Then** only the transfer is shown ([FR-016](#fr-016)).

---

<a id="user-story-2"></a>
### User Story 2 - Import a bank CSV and review it by vendor (Priority: P2)

The user downloads a CSV export from their bank, tells the app once how that bank's file is laid
out, and imports it. Parsed rows wait in a pending batch outside the ledger. The user reviews the
batch grouped by vendor, assigns categories a group at a time, marks own-account payments as
transfers, and confirms. Re-importing an overlapping date range adds nothing twice.

**Why this priority**: CSV import is the primary path for everything the bank sees and the
highest-risk feature in the product. It is P2 only because the ledger it feeds must exist first.

**Independent Test**: Import a real bank export with a new mapping profile, review and confirm it,
then import the following month's file with the same profile and a deliberately overlapping range.
Delivers bank data in the ledger with no duplicates and a saved profile.

**Acceptance Scenarios**:

1. **Given** a CSV whose columns are in an order the app has never seen, **When** the user assigns
   the date, amount, and description columns, chooses the date format, decimal separator, and file
   encoding, and saves this as profile "MyBank", **Then** the file parses into a pending batch and
   no balance or figure in the app changes.
2. **Given** profile "MyBank" exists, **When** the user imports next month's file from the same
   bank, **Then** the profile is applied without any re-mapping.
3. **Given** a bank whose export uses separate debit and credit columns, **When** the user maps both
   in the profile, **Then** debit rows become expenses and credit rows become incomes, a cell
   holding `0,00` counts as empty, and a row with a non-zero amount in both columns or in neither
   is unparsable ([FR-028](#fr-028)).
4. **Given** a pending batch of 300 rows from 40 vendors, from a file whose profile maps a
   counterparty column, **When** the user opens review, **Then** the rows of each vendor are
   grouped by direction, a group of a single row is shown as a plain row, and assigning a category
   to a group assigns it to every row in the group.
5. **Given** a vendor group whose rows belong in different categories, **When** the user unfolds the
   group, **Then** each row can be given its own category without affecting the others.
6. **Given** a file whose profile maps no counterparty column, **When** the user opens review,
   **Then** the rows are presented ungrouped, each with its own category dropdown.
7. **Given** a row that is a payment to the user's own credit card account, **When** the user marks
   it as a transfer to that account, **Then** on confirmation it enters the ledger as a transfer
   with no category and is excluded from spending.
8. **Given** a batch contains rows matching transactions already in the ledger on account, date,
   amount, and direction but with different descriptions, **When** the user opens review, **Then**
   those rows are not among the rows under review, a count of duplicates is shown, selecting the
   count presents them, and the user can include any single one.
9. **Given** a reviewed batch, **When** the user confirms it, **Then** the included rows enter the
   ledger with the categories shown in review, rows the user left untouched in "Uncategorised",
   and balances update.
10. **Given** a pending batch, **When** the user discards it, **Then** nothing enters the ledger.
11. **Given** a file in which some rows cannot be parsed (unreadable date, missing amount), **When**
    the batch is reviewed, **Then** those rows are not among the rows under review, a count of
    unparsable rows is shown, selecting the count presents them with the reason each failed, they
    cannot be confirmed, and the rest of the batch remains reviewable.
12. **Given** the user closes the app with a batch pending, **When** they return, **Then** the batch
    is still pending and reviewable.
13. **Given** profile "MyBank" maps a header that the new file lacks, **When** the user imports it,
    **Then** no batch is created and the message names the missing columns ([FR-021](#fr-021)).
14. **Given** a bank whose export lists purchases as positive amounts, **When** the profile has
    sign inversion on, **Then** those rows are proposed as expenses ([FR-023](#fr-023)).
15. **Given** a batch is pending, **When** the user tries to import another file, **Then** the app
    refuses, explains that the pending batch must be confirmed or discarded first, and offers to
    open it ([FR-022](#fr-022)).
16. **Given** a batch in which vendor "Shop" has three purchases and one refund, and two rows have
    an empty counterparty, **When** the user opens review, **Then** the three purchases form one
    group, and the refund and both rows without a counterparty are shown as plain rows
    ([FR-026](#fr-026)).

---

<a id="user-story-3"></a>
### User Story 3 - See where the money went over a chosen period (Priority: P3)

The user opens Insights, picks a time period, and sees spending over time, the proportion of
spending by expense category, and the proportion of income by income category. Unaccounted money is
visible as a known unknown, never hidden.

**Why this priority**: The charts are the product's purpose; the ledger and import exist to make
them trustworthy. Ranked after import because charts over a hand-entered trickle are of little use.

**Independent Test**: With a few months of transactions in the ledger, select several periods and
verify that every chart reflects exactly the transactions in the period, excluding transfers.

**Acceptance Scenarios**:

1. **Given** transactions across several months, **When** the user selects a period, **Then** the
   spending-over-time line, expense breakdown, and income breakdown include only transactions dated
   within the period.
2. **Given** transfers exist in the period, **Then** no chart or total includes them.
3. **Given** a reconciliation shortfall in the period, **Then** expense "Unaccounted" appears in the
   expense breakdown, visually distinguished from ordinary categories, with its true share.
4. **Given** a reconciliation surplus in the period, **Then** income "Unaccounted" appears in the
   income breakdown; this is the only place a surplus is surfaced.
5. **Given** transactions in "Uncategorised", **Then** they appear in their side's breakdown as their
   own slice, so the user can see how much sorting remains.
6. **Given** a period with no transactions, **Then** the view shows an empty state, not an error.
7. **Given** the user opens Insights, **Then** the period defaults to the current calendar month.

---

<a id="user-story-4"></a>
### User Story 4 - Plan spending with monthly budgets (Priority: P4)

The user sets a monthly spending limit on an expense category. Insights shows, per budgeted
category, how much of the limit has been spent in the period, with a clear over-limit state. Each
calendar month starts fresh.

**Why this priority**: This is what turns a ledger into an assistant: it tells the user whether they
spent more than they intended. It needs the ledger, categories, and the Insights view to exist.

**Independent Test**: Set a limit on one category, record expenses in it across two months, and
verify progress for each month against the limit, including the over-limit state and the reset at
month start.

**Acceptance Scenarios**:

1. **Given** expense category "Groceries", **When** the user sets a monthly limit of 400.00, **Then**
   Insights for the current month shows Groceries spent against 400.00.
2. **Given** Groceries spending of 430.00 in the month, **Then** the Groceries bar is in a clearly
   distinguishable over-limit state.
3. **Given** 250.00 unspent in September, **When** October begins, **Then** October's Groceries
   progress starts at 0.00 against 400.00; nothing rolls over.
4. **Given** an income category, or "Uncategorised", or "Unaccounted", **When** the user looks for a
   way to set a budget on it, **Then** none is offered.
5. **Given** a budgeted category, **When** the user changes or removes the limit, **Then** progress
   reflects the change immediately.
6. **Given** the Insights period is July to September, **Then** budget progress shows September
   only, labelled with that month.

---

<a id="user-story-5"></a>
### User Story 5 - Reconcile an account to reality (Priority: P5)

The user states what an account actually holds right now. The app books the difference between the
computed balance and the stated balance to "Unaccounted", so the computed balance is honest again.

**Why this priority**: Computed balances drift from reality, especially for cash. Reconciliation is
what keeps them trustworthy without letting the user edit a balance directly. It depends on the
ledger and on the protected categories.

**Independent Test**: With a known computed balance, reconcile to a lower and then a higher amount
and verify the transactions created and the resulting balance.

**Acceptance Scenarios**:

1. **Given** "Cash" has a computed balance of 100.00, **When** the user reconciles it to 85.00,
   **Then** an expense of 15.00 in expense "Unaccounted" is booked to "Cash" dated today, and "Cash"
   shows 85.00.
2. **Given** "Cash" has a computed balance of 100.00, **When** the user reconciles it to 120.00,
   **Then** an income of 20.00 in income "Unaccounted" is booked to "Cash" dated today, and "Cash"
   shows 120.00.
3. **Given** computed and stated balances are equal, **When** the user reconciles, **Then** no
   transaction is created and the user is told the account already matches.
4. **Given** any account of any type, **Then** reconciliation is available; it is not a cash-only
   operation.

---

<a id="user-story-6"></a>
### User Story 6 - Organise categories (Priority: P6)

The user adjusts the predefined expense and income categories: creates, renames, recolours, and
deletes them. The two protected categories on each side can be renamed and recoloured but never
deleted.

**Why this priority**: The predefined sets make the app useful on first launch, so category
management is needed later than the ledger, import, and charts it feeds.

**Independent Test**: Rename, recolour, create, and delete categories on both sides, including an
attempt to delete a protected one, and verify transactions and budgets respond as specified.

**Acceptance Scenarios**:

1. **Given** first launch, **Then** both the expense set and the income set contain a predefined
   list of categories, each including "Uncategorised" and "Unaccounted".
2. **Given** an expense category "Eating out", **When** the user renames it to "Restaurants" and
   changes its colour, **Then** all its transactions and its budget show the new name and colour.
3. **Given** "Restaurants" has 12 transactions and a budget, **When** the user deletes it, **Then**
   the 12 transactions move to expense "Uncategorised" and the budget is removed.
4. **Given** "Uncategorised" or "Unaccounted" on either side, **When** the user tries to delete it,
   **Then** the app refuses and explains why; renaming and recolouring succeed.
5. **Given** an expense category named "Refunds" exists, **When** the user creates an income
   category named "Refunds", **Then** it succeeds; **When** they create a second expense category
   named "Refunds", **Then** the app refuses and explains why.

---

<a id="user-story-7"></a>
### User Story 7 - Back up and restore all data (Priority: P7)

The user saves everything the app holds to one file and can later load that file to get exactly
that state back, on the same or another machine.

**Why this priority**: All data lives locally, so losing the machine or the browser data loses
everything. It is ranked last only because it needs every other entity to exist.

**Independent Test**: Fill the app with data from every other story, save a backup, restore it
into a fresh install, and verify everything matches ([SC-014](#sc-014)).

**Acceptance Scenarios**:

1. **Given** any data in the app, **When** the user saves a backup, **Then** they receive one file
   and nothing in the app changes ([FR-070](#fr-070)).
2. **Given** a backup file and existing data, **When** the user loads the file, **Then** the app
   warns that all current data will be replaced and asks for confirmation; **When** they confirm,
   **Then** the app shows exactly the data in the backup ([FR-071](#fr-071)).
3. **Given** a file that is not a valid backup, **When** the user loads it, **Then** the app refuses,
   explains why, and the current data is unchanged ([FR-072](#fr-072)).

---

<a id="user-story-8"></a>
### User Story 8 - Ask about my own finances (Priority: P8)

The user opens the finance chat from any screen and asks about their own money, such as how to
reduce spending or which subscriptions have become more expensive, about money and finance in
general, or about how the app works. An answer about their money appears as it is written, rests
only on the user's data, says plainly what that data cannot tell, and ends with links to the
transactions it rests on, so the user can check it. After each answer, the chat suggests what to
ask next. Added in v1.3.

**Why this priority**: It reads the data of every other story and sends it to OpenAI, so it comes
last, and only for a user who turned AI features on ([FR-095](#fr-095)).

**Independent Test**: With AI features on, a few months of transactions and a stand-in in OpenAI's
place, ask an example question, follow one of its sources and open the chat again there, stop a
second answer midway, then close and reopen the app, and verify that the conversation is as it
was.

**Acceptance Scenarios**:

1. **Given** any screen, **Then** it shows the chat's button with its name; **Given** AI features
   are off, **When** the user opens the chat, **Then** it says that it needs AI features, which
   Settings turns on, and offers nothing to send ([FR-100](#fr-100)).
2. **Given** AI features are on and an empty conversation, **When** the user opens the chat,
   **Then** it offers example questions; **When** they select one, **Then** it is sent at once
   ([FR-101](#fr-101)).
3. **Given** a question was sent, **Then** the chat says "Thinking…" until the answer's first words
   arrive, and then shows the answer as it is written ([FR-107](#fr-107)).
4. **Given** an answer is being written, **Then** the user can scroll, close and open the chat, and
   type their next question; **When** they select Stop, **Then** the answer ends at once, and its
   text so far stays, marked as stopped ([FR-108](#fr-108)).
5. **Given** a question about neither finance nor the app, such as general knowledge, **Then**
   the chat gives its fixed answer, which says what it can help with, and offers the example
   questions again ([FR-101](#fr-101), [FR-103](#fr-103)).
6. **Given** a question the data answers only in part, **Then** the answer says explicitly what is
   missing and states no figure that the data does not hold ([FR-109](#fr-109)).
7. **Given** an answer about the user's data, **Then** it ends with its sources; **When** the user
   selects one, **Then** the chat closes and the transaction list shows, filtered as the source
   says; **When** they open the chat again, **Then** the conversation is as they left it
   ([FR-110](#fr-110)).
8. **Given** a conversation, **When** the user closes and reopens the app, **Then** the
   conversation is still there; **When** they clear it and confirm, **Then** the chat offers the
   example questions again ([FR-104](#fr-104)).
9. **Given** a question that fails, **Then** the chat says why and what the user can do, keeps the
   conversation as it was, and puts the question back in the field ([FR-104](#fr-104)).
10. **Given** a complete answer, **Then** the chat offers one to three follow-up questions under
    it, as it offers the example questions; **When** the user selects one, **Then** it is sent at
    once ([FR-111](#fr-111)).
11. **Given** a question about how the app works, a general question about finance, or a request
    to change something, such as a budget, **Then** the chat answers it; to a request to change
    something, it says that it cannot change anything and explains how the user can do it in the
    app ([FR-103](#fr-103), [FR-109](#fr-109)).

---

<a id="edge-cases"></a>
### Edge Cases

- The user imports history older than the account's earliest transaction: the opening balance no
  longer fits its definition ([FR-001](#fr-001)), and the balance double-counts those rows until the
  user adjusts the opening balance to match. The app
  cannot detect this, which is why changing the opening balance is warned about, not blocked.
- A transfer's other leg appears when the counter-account's export is imported later: it is flagged
  as a duplicate ([FR-024](#fr-024)).
- The same file is imported twice: every row is flagged as a duplicate and confirming with defaults
  adds nothing ([FR-024](#fr-024), [FR-025](#fr-025)).
- A batch contains two rows with the same date, amount, and direction: the second is flagged
  ([FR-024](#fr-024)) but can be included, because banks do emit genuine identical rows on the same
  day.
- A purchase and its refund of the same amount fall on the same day: neither is flagged against
  the other, because the money moves in opposite directions ([FR-024](#fr-024)).
- The user adds, edits, or deletes a ledger transaction while a batch is pending: duplicate flags are
  not recomputed ([FR-024](#fr-024)), so a manual entry matching a pending row goes unflagged and
  confirming adds a duplicate, which the user deletes.
- A row is marked as a transfer after the counter-account already holds the other leg as a plain
  expense or income: both stay in the ledger and the counter-account's balance is off until the user
  deletes the stray row.
- An import file has a header only, or no rows: the user is told the file contained no transactions
  and no batch is created.
- The Insights period spans more than one calendar month: budget progress covers only the most
  recent month ([FR-051](#fr-051), [User Story 4](#user-story-4) scenario 6).
- A transaction's kind is changed after it was saved: the category or destination account follows
  the same rule as during entry ([FR-015](#fr-015)); nothing is left empty.
- A transaction is moved to a different account: both accounts' balances update.
- The amount field does not accept a negative value; the kind carries the direction. A zero amount
  is allowed ([FR-010](#fr-010)).
- Two accounts, two mapping profiles, or two categories on the same side with the same name are
  refused ([FR-001](#fr-001), [FR-021](#fr-021), [FR-032](#fr-032)).
- A very large expense "Unaccounted" share appears in Insights: it is shown at its true size
  ([FR-052](#fr-052)).
- The user asks the finance chat about a time before the months a question sends: the answer says
  that the data does not reach back that far, and gives no figure for it ([FR-109](#fr-109)).
- An answer names as a source a category or account the user does not have: that source is left
  out ([FR-110](#fr-110)).
- A category or account that a stored answer's source names is deleted: the source shows its name
  without a link ([FR-110](#fr-110)).
- The user selects Stop before an answer's first words arrive: the answer stays empty, marked as
  stopped ([FR-108](#fr-108)).
- The user turns AI features off while an answer is being written: the answer stops, as with Stop
  ([FR-108](#fr-108)).
- The app is closed while an answer is being written: neither the question nor the text so far is
  kept ([FR-104](#fr-104)).
- The user asks the chat to change something, such as to delete a transaction: nothing changes,
  and the answer says that the chat cannot and how to do it in the app ([FR-103](#fr-103)).
- The AI suggests no follow-up questions, or more than three: the chat shows none, or the first
  three ([FR-111](#fr-111)).

## Requirements *(mandatory)*

### Functional Requirements

**Accounts**

- <a id="fr-001"></a>**FR-001**: Users MUST be able to create and edit an account with a name, a type, and an opening
  balance: what the account held before its earliest recorded transaction. Changing the opening
  balance MUST require the user to confirm a severe warning that every computed balance of the
  account will change. Account names MUST be unique, comparing names ignoring case and surrounding
  spaces; a duplicate name MUST be refused with an explanation.
- <a id="fr-002"></a>**FR-002**: System MUST compute each account's balance as its opening balance plus the net effect
  of its transactions. A balance MUST NOT be stored or edited as a number of its own; stating an
  account's actual balance is done through reconciliation ([FR-005](#fr-005)), which books the
  difference as a transaction.
- <a id="fr-004"></a>**FR-004**: System MUST give no account type special behaviour; the type is descriptive only, and
  a cash account is an ordinary account.
- <a id="fr-005"></a>**FR-005**: Users MUST be able to reconcile any account by stating its actual balance. System MUST
  book the difference as a single transaction dated the day of reconciliation: an expense of the category "Unaccounted" when the stated balance is lower than the computed one, an income of the category
  "Unaccounted" when it is higher, and no transaction when they are equal.
- <a id="fr-006"></a>**FR-006**: On first launch, system MUST create one account named "Cash", of
  type cash, with an opening balance of 0.00. It is an ordinary account ([FR-004](#fr-004)),
  editable like any other. The manual-entry form MUST default to the account most recently used for
  a manual entry. Before the user has made any manual
  entry, that account MUST be "Cash". Import confirmation and reconciliation MUST NOT change this
  default. Accounts cannot be deleted in v1 ([Out of Scope](#out-of-scope)).

**Transactions**

- <a id="fr-010"></a>**FR-010**: Every transaction MUST have a date, an amount of zero or more, an account, and a
  kind: expense, income, or transfer. A description is optional.
- <a id="fr-011"></a>**FR-011**: An expense MUST carry exactly one expense category and an income exactly one income
  category; the form MUST never offer a state without one, holding the side's "Uncategorised"
  until the user picks another. A transfer MUST carry no category and MUST name a second,
  different account of the user's as its destination; the form MUST offer a destination account in
  place of the category and MUST NOT offer the source account as destination.
- <a id="fr-012"></a>**FR-012**: System MUST exclude transfers from every spending figure, income figure, and budget.
- <a id="fr-013"></a>**FR-013**: Users MUST be able to create, edit, and delete transactions manually.
- <a id="fr-014"></a>**FR-014**: The manual-entry form MUST open with kind expense, date today, amount 0.00, account
  the default account ([FR-006](#fr-006)), category expense "Uncategorised", and an empty
  description, and MUST be saveable without any change; recording a typical cash expense means
  editing only the amount and the category.
- <a id="fr-015"></a>**FR-015**: A transaction MUST never hold a category from the other side. When the kind changes
  between expense and income, the category MUST become the new side's "Uncategorised"; when it
  changes to transfer, the category MUST be removed and a destination account required; when it
  changes from transfer, the destination MUST be removed and the category MUST become the new
  side's "Uncategorised".
- <a id="fr-016"></a>**FR-016**: The transaction list MUST show every transaction newest first, each
  with its date, description, account, amount, and either its category in the category's colour or,
  for a transfer, its destination account. Expenses, incomes, and transfers MUST be visually
  distinguishable. Users MUST be able to filter the list by account, by category, including
  "Uncategorised", and by a range of dates; filtering by an account MUST include transfers into it.
  Users MUST be able to change each value a row shows in place, without opening a form, and to open
  a transaction for editing, including its kind, or deletion ([FR-013](#fr-013)). Changed in v1.1:
  [FR-081](#fr-081), [FR-083](#fr-083).

**CSV import**

- <a id="fr-020"></a>**FR-020**: Users MUST be able to import transactions from a CSV file into a chosen account.
- <a id="fr-021"></a>**FR-021**: Users MUST be able to define, name, save, and reuse a mapping profile that records:
  which columns hold the date, the amount (one signed column, or separate debit and credit
  columns), the description, and optionally the counterparty; whether the amount's sign is
  inverted (for exports that list purchases as positive numbers); the date format; the decimal
  separator; and the file encoding. Profile names MUST be unique, compared as account names are
  ([FR-001](#fr-001)); a duplicate name MUST be refused with an explanation.
  - Columns MUST be identified by their header text. A file missing a mapped header MUST create no
    batch, and the message MUST name the missing columns. A profile MAY instead be flagged "no header
    row", in which case columns are identified by position and no layout check is made.
  - While defining a profile, the app MUST preview how the first rows of the file parse (date,
    signed amount, description), so a wrong date format or decimal separator is visible before any
    batch exists.
  - Users MUST be able to edit, rename, and delete a profile. Doing so MUST NOT change a pending
    batch, which keeps its parsed rows.
- <a id="fr-022"></a>**FR-022**: System MUST place parsed rows in a pending batch that has no effect on balances,
  figures, or budgets until confirmed. The pending batch MUST survive closing and reopening the app,
  together with every choice made in review: categories, rows marked as transfers, flagged rows
  included, and the categories the AI suggested, with their marks ([FR-093](#fr-093)).
  At most one pending batch MAY exist at any time, across all accounts; starting an import while one
  is pending MUST be refused with a message that leads the user to review or discard it. Changed in
  v1.2: [FR-093](#fr-093). Changed in v1.3: [FR-105](#fr-105).
- <a id="fr-023"></a>**FR-023**: System MUST propose the kind of each row from the direction of its amount, after
  applying the profile's sign inversion (money out is an expense, money in is an income, and a zero
  amount is an expense), and MUST let the user change any row to a transfer with a
  counter-account during review.
- <a id="fr-024"></a>**FR-024**: System MUST flag a pending row as a duplicate when it matches an existing ledger
  transaction or an earlier row in the same batch. Two entries match only when they agree on all
  four of: account, date, amount, and direction, meaning whether the money leaves or enters that
  account. Dates MUST match exactly, and descriptions play no part. A transfer moves money out of
  its source account and into its destination account, so a pending row can match a transfer on
  either account. Flags MUST be computed once, when the batch is created, and MUST NOT change
  while it is pending.
- <a id="fr-025"></a>**FR-025**: Flagged rows MUST be excluded from confirmation by default and MUST NOT appear among
  the rows under review. Review MUST show how many rows are flagged; selecting that number MUST
  present them, and the user MUST be able to include any individual one.
- <a id="fr-026"></a>**FR-026**: Review MUST group pending rows by vendor where possible.
  - A row's vendor is its counterparty, read from the counterparty column when the profile maps
    one. A row has no vendor when the profile maps no counterparty column or the row's counterparty
    cell is empty; such rows are shown as plain rows.
  - Two rows have the same vendor when their counterparty text is equal after trimming whitespace
    and ignoring case; nothing fuzzier.
  - A group holds the rows that share a vendor and a direction, money out or money in, because a
    category fits only one side ([FR-015](#fr-015)). Purchases and refunds from one vendor
    therefore form separate groups.
  - A group of only one row is shown as a plain row.
  - Assigning a category to a group MUST assign it to every row in the group. The user MUST be able
    to unfold a group and assign categories per row.
- <a id="fr-027"></a>**FR-027**: Confirming a batch MUST move its included rows into the ledger with the categories
  shown in review, and MUST first state how many rows will enter the ledger. While the AI answers a
  request for suggestions, confirming MUST wait for the answer, so no suggestion enters the ledger
  unseen ([FR-090](#fr-090)). Discarding a batch MUST leave the ledger unchanged. A confirmed batch
  cannot be undone as a whole ([Out of Scope](#out-of-scope)). Changed in v1.2:
  [FR-090](#fr-090). Changed in v1.3: [FR-105](#fr-105).
- <a id="fr-028"></a>**FR-028**: Rows the profile cannot parse MUST NOT appear among the rows under review and MUST
  NOT be confirmable. Review MUST show how many there are; selecting that number MUST present them
  with the reason each failed. The remaining rows MUST stay reviewable.
  - With separate debit and credit columns, exactly one of the two MUST hold a non-zero amount. A
    blank cell and a cell holding zero (such as `0,00`) both count as empty, because some banks
    fill the unused column with zero. A row is unparsable when both columns hold a non-zero amount,
    when neither does, or when either holds a negative one.
  - The profile's decimal separator also decides the thousands separator (the other one), so
    `1.250,00` and `1,250.00` each parse as 1250.00 under their matching profile.
- <a id="fr-029"></a>**FR-029**: Every row under review MUST hold a category, initially its side's
  "Uncategorised"; the category dropdown MUST offer no empty state, so no row can be confirmed
  without a category.

**Categories**

- <a id="fr-030"></a>**FR-030**: System MUST keep expense categories and income categories as two separate sets. A
  category picker MUST show only the set matching the transaction's kind. A list that offers both
  sets, such as a filter, MUST show them as two groups, each named by its side and clearly divided
  from the other. Category pickers in manual entry and import review MUST NOT offer
  "Unaccounted"; only reconciliation assigns it ([FR-035](#fr-035)). Changed in v1.1:
  [FR-082](#fr-082).
- <a id="fr-031"></a>**FR-031**: On first launch, both sets MUST contain a predefined list of categories, each set
  including the protected categories "Uncategorised" and "Unaccounted".
- <a id="fr-032"></a>**FR-032**: Users MUST be able to create, rename, recolour, and delete categories. Names MUST be
  unique within a set, compared as account names are ([FR-001](#fr-001)); the same name MAY exist
  on both sides.
- <a id="fr-033"></a>**FR-033**: System MUST refuse deletion of "Uncategorised" and "Unaccounted" on either side, while
  allowing them to be renamed and recoloured.
- <a id="fr-034"></a>**FR-034**: Deleting a category MUST move its transactions to "Uncategorised" on the same side and
  MUST remove any budget attached to it.
- <a id="fr-035"></a>**FR-035**: System MUST itself assign "Uncategorised" to imported rows that
  hold no category the user chose or the AI suggested ([FR-029](#fr-029), [FR-092](#fr-092)) and to
  transactions whose category is deleted, and "Unaccounted" to reconciliation differences. Changed
  in v1.2: [FR-092](#fr-092). Changed in v1.3: [FR-105](#fr-105).

**Budgets**

- <a id="fr-040"></a>**FR-040**: Users MUST be able to set, change, and remove a monthly spending limit on any expense
  category other than "Uncategorised" and "Unaccounted". Income categories MUST NOT carry budgets.
- <a id="fr-041"></a>**FR-041**: Budget progress MUST compare a category's expenses within one calendar month against
  the category's limit. A category has one limit at a time, and that limit applies to every month,
  past and present: changing it changes the progress shown for every month, and v1 keeps no history
  of earlier limits. Each calendar month MUST start at zero; unspent amounts MUST NOT roll over.
- <a id="fr-042"></a>**FR-042**: A category whose spending exceeds its limit MUST be shown in a state clearly
  distinguishable from one within its limit.

**Insights**

- <a id="fr-050"></a>**FR-050**: Users MUST be able to select a time period by start and end date,
  with presets for common periods, defaulting to the current
  calendar month. Changed in v1.1: [FR-086](#fr-086).
- <a id="fr-051"></a>**FR-051**: Insights MUST show, for the selected period: spending over time as a line, where
  hovering over a point previews that point's spending by expense category; the
  proportion of spending by expense category; the proportion of income by income category; and
  budget progress per budgeted expense category for the most recent calendar month in the period.
  Changed in v1.1: [FR-087](#fr-087).
- <a id="fr-052"></a>**FR-052**: "Unaccounted" MUST appear in its side's breakdown at its true share, visually
  distinguished as a known unknown, and MUST NOT be hidden or merged.
- <a id="fr-053"></a>**FR-053**: Charts MUST be read-only in v1.

**Whole application**

- <a id="fr-060"></a>**FR-060**: All amounts MUST be in euro. The app MUST display every amount with
  the € symbol and two decimal places, using the browser's number format. Amounts in this spec are
  written as 1,250.00 for readability only.
- <a id="fr-061"></a>**FR-061**: The application MUST NOT send any user data or usage information to any external
  party, except in the requests the user starts with an AI feature while AI features are on: by
  selecting Suggest categories in review, and by asking the finance chat
  ([FR-090](#fr-090), [FR-091](#fr-091), [FR-095](#fr-095), [FR-100](#fr-100),
  [FR-102](#fr-102)). They are on only once the user turned them on in Settings and agreed to
  their warning.
  No flow may make a request to any host other than the one serving the app: no analytics, no
  error reports, no update checks, and no fonts, scripts or other files from third parties. An AI
  feature's request goes to the server that serves the app on the user's own computer, which
  passes it on to OpenAI with the owner's API key. The key stays on that computer, outside the
  app's code, storage and backups. No capability may require a network connection, except the AI
  features; everything else works without one. Serving the app from the user's own computer
  (`localhost`) is not a network connection. Real data lives only in the app as run locally. A copy
  hosted on the web, such as the one the project's post-push check deploys, needs a network
  connection to open, so it serves only checks and demonstrations
  ([Out of Scope](#out-of-scope)). It cannot pass requests on to OpenAI, so there AI features
  cannot be turned on ([FR-106](#fr-106)). Changed in v1.2: [FR-090](#fr-090), [FR-095](#fr-095).
  Changed in v1.3: [FR-100](#fr-100), [FR-105](#fr-105), [FR-106](#fr-106).
- <a id="fr-062"></a>**FR-062**: The application MUST NOT initiate, schedule, or instruct any movement of real money.
- <a id="fr-063"></a>**FR-063**: The application MUST open on the transaction list ([FR-016](#fr-016)). Accounts are deliberately
  low-prominence: they exist to make the numbers trustworthy and are not the app's home.

**User experience**

Overarching product intent for look, feel, and clarity is defined in [Principle VIII of the project
constitution](../../.specify/memory/constitution.md). The requirements below make that intent
testable for v1.

- <a id="fr-064"></a>**FR-064**: The interface MUST feel modern and easy to scan: clear visual hierarchy (what
  matters most is obvious at a glance), comfortable spacing, and readable text at default browser
  zoom on a desktop viewport ([Out of Scope](#out-of-scope) for narrow layouts).
- <a id="fr-065"></a>**FR-065**: The UI MUST be consistent across screens: the same patterns for navigation,
  primary and secondary actions, forms, lists, and empty states; category colours and names MUST
  look the same wherever a category appears (entry, review, Insights, budgets).
- <a id="fr-066"></a>**FR-066**: Workflows MUST stay simple:   each primary task in the [user scenarios](#user-scenarios) MUST be reachable without passing through unrelated
  areas of the app, and MUST use the fewest steps that still satisfy the functional requirements in
  this spec (defaults and last-used values count toward simplicity).
- <a id="fr-067"></a>**FR-067**: When the user cannot complete an action because of validation, a business rule,
  or a failed save or load, the app MUST show a descriptive message in plain language: what went
  wrong and, when possible, what to do next. The message MUST NOT rely on raw technical detail alone
  (for example HTTP status codes, exception class names, or internal field keys) as the user's only
  explanation.
- <a id="fr-068"></a>**FR-068**: Form validation MUST point the user to the problem: field-level issues MUST
  appear at or beside the relevant field; form-wide issues MUST appear where the user is about to
  submit, with enough context to correct the input without external documentation.
- <a id="fr-069"></a>**FR-069**: Every action that deletes or replaces data MUST ask the user to confirm,
  and the request MUST state the consequence. These actions are: deleting a transaction, a
  category, or a mapping profile; discarding a pending batch; changing an opening balance;
  clearing the finance chat's conversation ([FR-104](#fr-104)); and loading a backup. Changing an
  opening balance and loading a backup MUST use a severe warning ([FR-001](#fr-001),
  [FR-071](#fr-071)). Confirming a batch first states its row count ([FR-027](#fr-027)). Changed
  in v1.3: [FR-104](#fr-104).

**Backup**

- <a id="fr-070"></a>**FR-070**: Users MUST be able to save a backup: one file holding all data the
  app holds, including accounts, transactions, categories, budgets, mapping profiles, the pending
  batch, the manual-entry default account ([FR-006](#fr-006)), whether AI features are on
  ([FR-095](#fr-095)) and the finance chat's conversation ([FR-104](#fr-104)). Changed in v1.2:
  [FR-095](#fr-095). Changed in v1.3: [FR-104](#fr-104).
- <a id="fr-071"></a>**FR-071**: Users MUST be able to load a backup file. Loading MUST replace all
  current data with the file's contents, not merge them, and MUST require the user to confirm a
  warning that all current data will be replaced.
- <a id="fr-072"></a>**FR-072**: System MUST refuse a file that is not a complete, valid backup and
  MUST leave the current data unchanged; a restore either fully succeeds or changes nothing. A file
  is a complete, valid backup only when it was saved by this app, holds every part
  [FR-070](#fr-070) lists, and its data obeys every rule of this spec (for example, every
  transaction's account is in the file). A backup saved by a newer version of the app MUST be
  refused with a message saying so. A backup saved by an earlier version MUST NOT be refused for its
  age.

**Data safety**

- <a id="fr-073"></a>**FR-073**: Every action that changes stored data MUST either take full effect or
  change nothing. This includes actions that change many records at once, such as confirming a batch
  ([FR-027](#fr-027)), deleting a category ([FR-034](#fr-034)) and restoring a backup
  ([FR-072](#fr-072)). When saving fails, the stored data and what the app shows MUST both stay as
  they were, and the user MUST be told ([FR-067](#fr-067)).
- <a id="fr-074"></a>**FR-074**: The app MUST run in one browser tab or window at a time. A second tab
  or window MUST load no data, and MUST tell the user that the app is already open elsewhere.
- <a id="fr-075"></a>**FR-075**: The browser may clear the app's data when disk space runs low, unless
  the browser has agreed to keep it. The backup screen MUST say when the browser has not agreed,
  and that a saved backup is the safeguard ([User Story 7](#user-story-7)).

**UI improvements (v1.1)**

Changes the owner asked for after v1.0, released together as v1.1. A v1.0 requirement that one of
them changes states the new behaviour and names the change.

- <a id="fr-080"></a>**FR-080**: The transaction list MUST name its columns in a header above the
  rows.
- <a id="fr-081"></a>**FR-081**: Users MUST be able to change each value a row of the transaction
  list shows in place, without opening a form. Selecting a row MUST NOT open the form. Instead, a
  button on each row MUST open the transaction for editing, including its kind, or deletion
  ([FR-013](#fr-013), [FR-016](#fr-016)).
- <a id="fr-082"></a>**FR-082**: The transaction list's category filter MUST offer the expense and
  the income categories in one list, without first asking for a side. The two sets MUST show as
  two groups, each named by its side and clearly divided from the other. This is the one list that
  may hold both sets ([FR-030](#fr-030)).
- <a id="fr-083"></a>**FR-083**: Users MUST be able to filter the transaction list by a range of
  dates, with the start, the end or both set, each end included. It MUST combine with the account
  and category filters ([FR-016](#fr-016)). A start after the end MUST be refused with a message
  at the fields ([FR-068](#fr-068)).
- <a id="fr-084"></a>**FR-084**: The sidebar MUST list the screens in this order: Transactions,
  Categories, Accounts, Budgets, Backup, Insights, Settings. Changed in v1.2: Settings
  ([FR-095](#fr-095)).
- <a id="fr-085"></a>**FR-085**: Import MUST NOT have its own sidebar entry. It MUST open from a
  button on the transaction list, since an import feeds that list. On Import and the screens
  reached from it, the sidebar MUST mark Transactions as the current screen.
- <a id="fr-086"></a>**FR-086**: The "This year" period on Insights MUST run from 1 January of the
  current year to today, not to 31 December ([FR-050](#fr-050)). The rest of the year has no
  transactions yet, and the period's end decides which month's budgets show ([FR-051](#fr-051)).
- <a id="fr-087"></a>**FR-087**: Hovering over a point of the spending line MUST preview that
  point's spending by expense category, largest first, with "Unaccounted" marked as unknown
  ([FR-051](#fr-051), [FR-052](#fr-052)).
- <a id="fr-088"></a>**FR-088**: The header MUST show the app's version as MAJOR.MINOR, such as
  "Version 1.1", so a user restoring a backup or reporting a problem can tell which release they
  run ([constitution IX](../../.specify/memory/constitution.md#ix-versioning)).

**Category suggestions (v1.2)**

A change the owner asked for after v1.1, released as v1.2. A requirement of an earlier version that
it changes states the new behaviour and names the change.

- <a id="fr-090"></a>**FR-090**: Review MUST offer **Suggest categories**, which asks an AI model of
  OpenAI to suggest a category for the rows under review that still hold their side's
  "Uncategorised" ([FR-029](#fr-029)). Only selecting it sends a request; importing, opening
  review, turning AI features on and every other action send nothing ([FR-061](#fr-061)). While AI
  features are off ([FR-095](#fr-095)), Suggest categories MUST be unavailable, and review MUST say
  that it needs AI features, which Settings turns on. Changed in v1.3: [FR-105](#fr-105).
  - A row is sent only when it has a description or a counterparty, and its side has a category
    other than "Uncategorised" and "Unaccounted".
  - One request sends at most 300 rows, the first in review order ([FR-026](#fr-026)); the user
    asks again for the rest.
  - While the AI answers, the rows MUST stay editable, and leaving review MUST cancel the request
    and fill nothing.
- <a id="fr-091"></a>**FR-091**: A request MUST hold only:
  - each row's number, side, description and counterparty;
  - the names of each side's categories other than "Uncategorised" and "Unaccounted";
  - as examples of the user's own decisions, the description and category name of at most 100
    earlier expenses and incomes in such categories, the most recent for each description.

  It MUST NOT hold amounts, dates, account names or the file name. It goes through the server
  that serves the app to OpenAI ([FR-061](#fr-061)). The warning shown when the user turns AI
  features on says so ([FR-095](#fr-095)). Changed in v1.3: [FR-105](#fr-105).
- <a id="fr-092"></a>**FR-092**: A suggestion MUST fill a row only if, when the answer arrives, the
  row is still under review and still holds its side's "Uncategorised", and the suggested name is
  that of a category of the row's side other than "Uncategorised" and "Unaccounted", compared as
  category names are ([FR-032](#fr-032)). Everything else in the answer MUST be ignored. A
  suggestion never makes a row a transfer and never replaces the user's choice. Suggested
  categories enter the ledger only on confirmation, like chosen ones ([FR-027](#fr-027)).
- <a id="fr-093"></a>**FR-093**: Review MUST mark each suggested category as suggested: on its row,
  and on a vendor group whose rows all hold the same suggested category. The mark MUST go when the
  user assigns the row anything, directly or through its group, even the same category, and when
  its category is deleted ([FR-034](#fr-034)). Marks are review progress: they survive closing the
  app ([FR-022](#fr-022)) and are part of a backup ([FR-070](#fr-070)). The ledger keeps no mark.
- <a id="fr-094"></a>**FR-094**: After an answer, review MUST say how many of the rows sent got a
  suggestion. Review MUST say which of these happened and what the user can do, and MUST leave
  every row as it was ([FR-067](#fr-067)), when:
  - the AI cannot be reached: the server that serves the app holds no OpenAI key, or OpenAI cannot
    be reached;
  - no answer arrives within 4 minutes;
  - OpenAI reports a failure, such as a rejected key or no credit left;
  - the answer is not in the expected form.

  Changed in v1.3: [FR-105](#fr-105).
- <a id="fr-095"></a>**FR-095**: A **Settings** screen MUST offer an **AI features** switch, off
  until the user turns it on. The one switch covers every feature that sends data off the
  computer; in v1.3 these are Suggest categories and the finance chat ([FR-090](#fr-090),
  [FR-100](#fr-100)). Outside the user's own computer the switch is unavailable
  ([FR-106](#fr-106)). Changed in v1.3: [FR-100](#fr-100), [FR-102](#fr-102),
  [FR-106](#fr-106).
  - Turning it on MUST first show a warning that data will now be shared: what each AI feature
    sends and to whom ([FR-091](#fr-091), [FR-102](#fr-102)). AI features MUST turn on only when
    the user agrees; cancelling leaves them off and changes nothing. Turning them on sends nothing
    by itself.
  - Turning it off MUST take effect at once, without a warning.
  - Using an AI feature MUST NOT show a further warning, and no other screen shows a notice while
    AI features are on; Settings shows whether they are.
  - The setting MUST survive closing the app and MUST be part of a backup ([FR-070](#fr-070)); a
    backup without it restores AI features off.
  - A setting turned on in v1.2, under v1.2's warning, stays on after the update to v1.3. The
    owner, the app's one user, agrees to v1.3's warning by turning AI features off and on once
    ([quickstart.md](quickstart.md#ai-features)).

**Finance chat, through OpenAI (v1.3)**

A change the owner asked for after v1.2, released as v1.3. With it, both AI features ask OpenAI
through the server that serves the app, in place of v1.2's n8n workflow and Claude
([FR-105](#fr-105)). [User Story 8](#user-story-8) describes the chat. A requirement of an earlier
version that it changes states the new behaviour and names the change.

- <a id="fr-100"></a>**FR-100**: Every screen MUST offer the **finance chat** through a button
  fixed at the bottom right of the window, which shows a chat icon and its name, "Ask about your
  finances", in the colour of the primary action, so it stands out wherever the user is. The
  button MUST NOT keep any of a screen's content hidden: scrolled to its end, a screen's content
  ends above it. The button opens the chat beside the screen. Opening another screen, also by
  following a link in the chat such as a source, closes the chat, so that screen shows. Opening
  and closing the chat send nothing. While AI features are off ([FR-095](#fr-095)), the chat MUST say that it needs AI
  features, which Settings turns on, and MUST offer nothing to send; a stored conversation still
  shows ([FR-104](#fr-104)).
- <a id="fr-101"></a>**FR-101**: While its conversation is empty, and after a question out of
  scope ([FR-103](#fr-103)), the chat MUST offer example questions, among them how to reduce
  spending and which subscriptions have become more expensive. Selecting one MUST send it at once,
  as if the user had typed it. The user MUST also be able to type a question and send it. Only
  sending a question sends a request ([FR-061](#fr-061)).
- <a id="fr-102"></a>**FR-102**: A question MUST send only:
  - the question, and the conversation's earlier questions with their answers, at most the last
    10;
  - today's date;
  - for the current month and the 12 months before it: each expense and income with its date,
    description, amount and category name, and each month's totals of expenses and of income by
    category;
  - each budgeted category's limit and its spending in the current month;
  - each account's name, type and balance.

  It MUST NOT hold transfers, ids, colours, mapping profiles, the pending import or the settings.
  With it go the chat's rules and a guide to the app, which hold no user data
  ([FR-103](#fr-103)). It goes through the server that serves the app to OpenAI
  ([FR-061](#fr-061)). The warning shown when the user turns AI features on says so
  ([FR-095](#fr-095)).
- <a id="fr-103"></a>**FR-103**: The chat MUST answer:
  - questions about the user's own finances, such as where the money goes, how spending changes,
    whether budgets hold, which payments recur and whether their price rose, and where the user
    could save;
  - general questions about money and finance, such as what an index fund is or how to build an
    emergency fund;
  - questions about how the app works, such as how to import a bank file or set a budget, from the
    guide to the app that the question sends ([FR-102](#fr-102)).

  A request to change something, such as a transaction, a category, a budget or the app itself,
  MUST get an answer that says the chat cannot change anything and explains how the user can do it
  in the app. Any other question, such as general knowledge outside finance or a request to write
  or code something, MUST get one fixed answer that says what the chat can help with. Answers MUST
  show as plain text in the conversation, after their question, with their sources
  ([FR-110](#fr-110)). An answer never changes the user's data: it is advice, and acting on it
  stays the user's step.
- <a id="fr-104"></a>**FR-104**: There is one conversation, and it MUST be stored: it stays when
  the chat is closed, when the user opens another screen and when the app is closed, and it is
  part of a backup ([FR-070](#fr-070)). A backup without one restores an empty conversation.
  - A question and its answer are stored once the answer is complete or stopped
    ([FR-108](#fr-108)).
  - The chat MUST offer to clear the conversation, which asks the user to confirm
    ([FR-069](#fr-069)) and then offers the example questions again ([FR-101](#fr-101)).
  - While a question waits for its answer or receives it, the chat MUST NOT send another.
  - When a question fails for one of the reasons of [FR-094](#fr-094), also after part of its
    answer showed, the chat MUST say which and what the user can do, MUST keep the conversation as
    it was before the question, and MUST put the question back in the field. For the chat, the 4
    minutes of FR-094 run until the answer is complete.
- <a id="fr-105"></a>**FR-105**: Both AI features MUST ask OpenAI through the server that serves
  the app on the user's own computer, which holds the owner's OpenAI API key. The key MUST NOT
  reach the app's code, its storage or a backup. A copy hosted on the web has no such server
  ([FR-061](#fr-061), [FR-106](#fr-106)). This replaces v1.2's n8n workflow and Claude.
- <a id="fr-106"></a>**FR-106**: A copy of the app not served from the user's own computer, such as
  the hosted copy, MUST NOT let AI features be turned on. There, Settings MUST show the AI features
  switch off and unavailable, also when a restored backup holds them on, and MUST say beside it
  that AI features need the app run locally. Review and the finance chat MUST then behave as with
  AI features off, and such a copy MUST send nothing for an AI feature, not even to the server
  that serves it ([FR-061](#fr-061), [FR-095](#fr-095)).
- <a id="fr-107"></a>**FR-107**: An answer MUST show as it is written, after its question, so the
  user can read its start while the rest follows. From sending until the answer's first words
  arrive, its place MUST say "Thinking…". A question out of scope MUST show the fixed answer of
  [FR-103](#fr-103) whole, and nothing the AI wrote for it.
- <a id="fr-108"></a>**FR-108**: While an answer is awaited or written, the chat and the rest of the
  app MUST stay usable: the user can scroll the conversation, close and open the chat, type the
  next question, and open another screen, which does not stop the answer.
  - In place of Send, the chat MUST offer **Stop**. Selecting it MUST end the answer at once and
    cancel its request.
  - The text written so far MUST stay after its question, marked as stopped and without sources.
    It counts as that question's answer when later questions send the conversation
    ([FR-102](#fr-102)).
  - Turning AI features off stops an answer in the same way ([FR-095](#fr-095)).
- <a id="fr-109"></a>**FR-109**: What an answer says about the user's finances MUST rest only on
  the data its question sent ([FR-102](#fr-102)). Every amount, date, payment, category and account
  it names MUST come from that data, and it MUST NOT estimate or fill in anything the data does not
  hold. When the data answers a question only in part, such as a comparison with a time before the
  months sent, the answer MUST answer the rest and say explicitly what is missing and why. When the
  data holds nothing that answers it, the answer MUST say only that, and name what is missing.
  General knowledge about finance MUST be marked as general, never given as a fact about the
  user's finances. What an answer says about the app MUST come from the guide to the app, and
  where the guide does not say, the answer MUST say so. The app cannot prove this of every answer;
  the sources let the user check what rests on their data ([FR-110](#fr-110)).
- <a id="fr-110"></a>**FR-110**: An answer that states something from the data MUST end with its
  **sources**: links, each named by what it covers, such as "Groceries, September 2026". Selecting
  a source MUST open the transaction list with its filters set to the source: a range of dates,
  and the expense or income category, the account, or both, when the answer rests on them
  ([FR-016](#fr-016), [FR-083](#fr-083)). The user can change or clear the filters there, and
  opening the chat again shows the conversation as it was ([FR-104](#fr-104)).
  - A source whose category or account the user does not have when the answer arrives MUST be left
    out, like anything else in the answer the app cannot use.
  - A source whose category or account is deleted later MUST show its name without a link. A
    source keeps working when its category or account is renamed.
- <a id="fr-111"></a>**FR-111**: With every answer it completes in scope, the chat MUST suggest one
  to three follow-up questions that the user could ask next and that it can answer, and MUST offer
  them under that answer as it offers the example questions ([FR-101](#fr-101)): selecting one
  sends it at once. Only the latest answer's follow-ups show, and none while a question waits for
  its answer or receives it. A stopped answer has none ([FR-108](#fr-108)). Follow-ups are stored
  with their answer ([FR-104](#fr-104)) and are not sent with later questions
  ([FR-102](#fr-102)). Of what the AI suggests, the chat keeps at most the first three distinct
  questions that are not empty.

<a id="key-entities"></a>
### Key Entities

- **Account**: Something the user holds money in. Has a name, a descriptive type, an opening
  balance, and a computed balance. Cash is an ordinary account; one is predefined on first launch
  ([FR-006](#fr-006)). Manual entry defaults to the last account used for manual entry
  ([FR-006](#fr-006)).
- **Transaction**: One movement of money. Has a date, an amount of zero or more, an optional
  description, a kind (expense, income, transfer), and an account. An expense or income has one
  category from its side. A transfer has a destination account instead of a category.
- **Category**: A label for expenses or incomes. Has a name, a colour, a side (expense or income),
  and whether it is protected. Each side has the protected "Uncategorised" (a to-do) and
  "Unaccounted" (a final answer).
- **Budget**: A monthly spending limit attached to one non-protected expense category. There is one
  limit at a time, and it applies to every month ([FR-041](#fr-041)).
- **Mapping profile**: A named, reusable description of one bank's CSV layout: column roles, date
  format, decimal separator, encoding.
- **Pending batch**: The result of one import, held outside the ledger until confirmed or
  discarded. Belongs to one account and one profile. At most one exists at a time.
- **Pending row**: One parsed line in a pending batch: its parsed fields, its vendor group, its
  proposed kind, its category or counter-account, whether the AI suggested that category
  ([FR-093](#fr-093)), whether it is flagged as a duplicate, whether it failed to parse, and whether
  it is included in confirmation.
- **Conversation**: The finance chat's questions, each with its answer, in the order asked. An
  answer has its text, whether it was stopped, its sources and its follow-up questions. A source
  has a name, a range of
  dates, and a category, an account, both or neither. There is one conversation; it is stored and
  is part of a backup ([FR-104](#fr-104), [FR-110](#fr-110)).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- <a id="sc-001"></a>**SC-001**: A user with a saved mapping profile that maps a counterparty column
  imports and fully reviews one month of bank activity (about 300 rows across about 40 vendors) in
  under 5 minutes, ending with zero rows in "Uncategorised" on that side.
- <a id="sc-002"></a>**SC-002**: A user records a categorised cash expense in under 15 seconds from opening the entry
  form.
- <a id="sc-003"></a>**SC-003**: Re-importing a file that overlaps an already-confirmed range and accepting the review
  defaults adds zero transactions to the ledger.
- <a id="sc-004"></a>**SC-004**: Confirmed when recording a transfer leaves every spending total, income total,
  and budget progress figure unchanged ([FR-012](#fr-012)).
- <a id="sc-005"></a>**SC-005**: Confirmed when every displayed account balance matches [FR-002](#fr-002),
  recomputed independently from the transaction list.
- <a id="sc-006"></a>**SC-006**: A new user records their first categorised expense within 2 minutes of first opening
  the app, without creating any account or category.
- <a id="sc-009"></a>**SC-009**: Insights for a period containing 5,000 transactions renders within 2 seconds of
  choosing the period.
- <a id="sc-010"></a>**SC-010**: A 5,000-row CSV parses into a reviewable pending batch within 10 seconds.
- <a id="sc-011"></a>**SC-011**: Over-limit budget categories are identifiable in Insights without reading any number.
- <a id="sc-012"></a>**SC-012**: For every refusal or failure called out in this spec (duplicate account,
  profile, or category name; protected category deletion; import file with no transactions;
  reconciliation when balances already match; unparsable import rows; an import while a batch is
  pending; an invalid backup file; an AI feature that gets no usable answer ([FR-094](#fr-094),
  [FR-104](#fr-104)); and validation on manual entry), exercising the scenario once MUST surface a plain-language message that states the reason,
  in line with [FR-067](#fr-067).
- <a id="sc-013"></a>**SC-013**: A new user who follows only on-screen labels and defaults can complete [User Story
  1](#user-story-1) acceptance scenario 3 (record a categorised expense) without opening help or
  settings, in line with [FR-066](#fr-066).
- <a id="sc-014"></a>**SC-014**: Saving a backup and loading it into a fresh install reproduces every
  account balance, transaction, category, budget, mapping profile, the pending batch, the
  manual-entry default account, whether AI features are on, and the finance chat's conversation,
  exactly.
- <a id="sc-015"></a>**SC-015**: With 5,000 transactions in the months a question sends, the finance
  chat shows the question and "Thinking…" within 1 second of sending, and selecting Stop ends the
  answer within 1 second, after which no further text appears ([FR-107](#fr-107),
  [FR-108](#fr-108)).

<a id="out-of-scope"></a>
## Out of Scope

Listed so that "should we add…?" has an answer that does not require a meeting.

**Never** — these would change what the product is:

- Moving money. The app is a read-only ledger; it never initiates a payment.
- Bank APIs, Open Banking, credential storage, or screen scraping. CSV is the boundary, which keeps
  the app free of credentials, licensing regimes, and per-bank integration maintenance.
- Telemetry or analytics of any kind, opt-in or otherwise.

**Not in v1** — defensible later, deliberately excluded now:

- Currencies other than euro, and multi-currency support ([FR-060](#fr-060)).
- Archiving or deleting accounts. An unused account stays in the list; revisit if dead accounts
  actually accumulate.
- Linking an income category to an expense category so a refund offsets the category it came from.
- Investment, asset, or net-worth tracking.
- Tax reporting or accounting-standard exports.
- Native mobile applications.
- Guarding against an accidental 0.00 manual entry. v1 saves the unchanged form as specified
  ([FR-014](#fr-014)); the user deletes an unwanted entry.
- Automatic or scheduled backups, and merging a backup into existing data. v1 backs up and restores
  only on request, as a whole ([FR-070](#fr-070), [FR-071](#fr-071)).
- Offering to save a backup during a restore. The warning that [FR-071](#fr-071) requires is the
  protection; the user can save a backup first, on the same screen.
- Protecting data from other people using the same computer, such as encryption or a passcode for
  stored data or backup files. The data is as safe as the computer's user account, and anyone who
  has a backup file can read it.
- Small-viewport responsive layout: completing every flow in a narrow browser window (for example
  360 pixels wide) without horizontal scrolling. v1 targets a normal desktop browser; phone-sized
  polish is later.
- Date tolerance when matching duplicates and transfer legs. Banks often post the two legs of a
  transfer on different days; v1 matches the exact date only ([FR-024](#fr-024)).
- Undoing a confirmed import batch as a whole. Confirmation states the row count
  ([FR-027](#fr-027)) and a backup ([User Story 7](#user-story-7)) is the safety net.
- Recurring-transaction detection and forecasting. The finance chat may point out recurring
  payments in the data a question sends ([FR-103](#fr-103)), but the app itself detects none and
  forecasts nothing.
- Budget rollover, and budget periods other than monthly. Both are wanted later and will be
  user-selectable when they arrive.
- Rule-based auto-categorisation on import; it collides with KISS as a product rule.
- Vendor grouping for files without a counterparty column, by truncating the description at its
  first digit (punctuation removed, whitespace collapsed, ignoring case). Fine for a later version;
  v1 groups only by a mapped counterparty column ([FR-026](#fr-026)).
- Learned recall: pre-filling a vendor's category from the user's own past decisions, with nothing
  to author and nothing sent anywhere. Category suggestions use earlier decisions only as examples
  in a request the user starts ([FR-091](#fr-091)).
- AI features other than category suggestions in review and the finance chat
  ([FR-090](#fr-090), [FR-100](#fr-100)), deferred by design rather than rejected: receipt
  scanning into a transaction. The ledger must be provably trustworthy before anything
  probabilistic sits on top of it, which is why a suggestion stays a suggestion until the user
  confirms ([FR-092](#fr-092)), and the chat answers but never changes data
  ([FR-103](#fr-103)). The name Financial Copilot anticipates these features.
- AI features that send nothing off the computer and so need no consent to data sharing
  ([FR-095](#fr-095)), such as a local model through Ollama in place of OpenAI. v1.3 uses OpenAI,
  because a local model needs a large download and answers worse ([R-24](research.md#r-24)).
- AI features in a hosted copy. It has no server of its own to hold the key, and a public address
  that passes requests on to OpenAI would let anyone spend the owner's credit
  ([R-24](research.md#r-24)). There, the switch is unavailable ([FR-106](#fr-106)).
- For category suggestions ([FR-090](#fr-090)): choosing in the app which model or AI provider
  answers; suggesting transfers, suggesting for rows that already hold a
  category, or suggesting without being asked, for example during import; stopping a request other
  than by leaving review, and sending more than 300 rows at once; learning from the user's
  corrections; and keeping the counterparty in the ledger to give the AI better examples.
- For the finance chat ([FR-100](#fr-100)): more than one conversation, or a list of earlier
  ones; charts and tables in answers, and links other than sources; sources that show exactly the
  transactions an answer rests on, since a monthly total rests on dozens that the AI would have to
  cite one by one ([FR-110](#fr-110)); acting on an answer, such as changing a category or a
  budget; sending data from before the current month and the 12 months before it, or transfers;
  and the chat on other screens.
- A switch per AI feature, a notice on every screen while AI features are on, and a warning each
  time an AI feature sends. Since v1.2, the app warns once, when the user turns AI features on in
  Settings ([FR-095](#fr-095)), and Settings shows whether they are on.
- Docker images and desktop packaging. v1 is a local web app; these are later delivery options and
  v1 must not foreclose them.
- Using a hosted copy of the app for real data. A hosted copy needs a network connection to open,
  which [FR-061](#fr-061) rules out for v1, so it serves only checks and demonstrations. The
  project's documentation says so; the app itself shows no notice in a hosted copy.
- Drill-down from a chart into its transactions. Desirable, to be considered in UX design, not a v1
  commitment.
- Searching the transaction list, paginating it, and editing several transactions at once. v1 has
  only the filters in [FR-016](#fr-016) and [FR-083](#fr-083).
- Showing the transaction list within 1 second at 10,000 transactions in every browser
  ([R-21](research.md#r-21)). Firefox takes longer, as R-21 records.
  The time goes into building every row, so `content-visibility` does not help. The fix is to show
  the first rows at once and render the rest just after, for example with React's
  `useDeferredValue`. Every row still reaches the page, so find-in-page keeps working, a moment
  later for rows past the first. The check in `e2e/performance.spec.ts` is skipped until then.
