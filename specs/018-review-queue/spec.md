# Feature Specification: Review queue — suggested transfers, usual categories, keyboard review

**Feature Branch**: `018-review-queue`

**Created**: 2026-11-14

**Status**: Draft

**Input**: User description: "review queue features and improvements: when importing 2 bank
statement csvs, I would like transfers to get detected automatically. still reviewable, but
suggested. Think of a workflow for that. Also, it should be possible to add a new category, the
same way it is also possible to add a new category when adding a normal transaction. also, add a
threshold feature: transaction below a certain amount (e.g. 1 euro) are hidden and put into
uncategorized, so a lazy user can focus on important transactions. when a certain vendor was
categorized already in the past, default again to that categorization (only if more than 50% of
all past transactions of that vendor were categorized a certain way, otherwise leave it
uncategorized) also, users might want to quickly categorize by the keyboard, so it would be useful
to have a typeahead search for the categories and tab to go to the next transaction. The current
transaction must be highlighted visually, so the user knows which transaction is currently
categorized. It should also somehow be recognizable which transactions had already been
highlighted."

This spec states only what v1.8 adds to or changes in
[001-finance-tracker-v1](../001-finance-tracker-v1/spec.md), which holds v1.0–v1.7. Import, review,
vendor groups, duplicates and categories work as 001 says, except where a requirement below
replaces one of 001's.

## Clarifications

### Session 2026-11-14

- Q: Only one import can wait for review at a time ([FR-155](#fr-155)). How should importing two
  bank files find transfers? → A: One file after the other. The first file is confirmed as
  usual; when the second is reviewed, a row whose other side is already in the ledger is proposed
  as a transfer, and confirming makes the two sides one transfer ([FR-142](#fr-142) –
  [FR-144](#fr-144)).
- Q: What should the amount under which review sets rows aside start at? → A: Nothing is set aside
  until the user enters an amount, which is then remembered ([FR-152](#fr-152)).
- Q: The manual-entry form has no way to add a category today; only Categories has New category.
  Where should adding a category from a picker be possible? → A: In every category picker of one
  side: manual entry, editing in place on Transactions, and review, each with the same search
  while typing ([FR-148](#fr-148), [FR-149](#fr-149)).

### Session 2026-11-14 (clarify)

- Q: If most of a vendor's past transactions were transfers to the same account, such as cash
  withdrawals into Cash, should its new rows start as a transfer to that account? → A: Yes, by the
  same more-than-half rule as categories; such a row starts as a transfer to that account, marked as
  from earlier transactions ([FR-146](#fr-146), [FR-147](#fr-147)).
- Q: Should Set aside rows under also set aside small incomes, such as interest of 0.12, or only
  small expenses? → A: Both: a row is set aside by its amount, whichever way the money moves
  ([FR-152](#fr-152)).

## User Scenarios & Testing *(mandatory)*

<a id="user-story-12"></a>
### User Story 12 - Transfers between my own accounts are found for me (Priority: P12)

The user imports their checking account's file and confirms it; a payment to their credit card is
an expense for now, because the credit card's side is not in the app yet. Then they import the
credit card's file. Review finds the payment received from checking, proposes it as a transfer
from Checking, and shows which checking transaction it pairs with. The user keeps the suggestion or
turns it off. On confirmation, the checking expense becomes one transfer from Checking to the
credit card, and the credit card's row adds nothing twice.

**Why this priority**: A missed transfer counts the same money as spending and puts a second copy
in the ledger, so every figure on Insights and every budget is wrong until the user finds it by
hand. Finding it for them protects the numbers the whole app rests on.

**Independent Test**: Import a checking file holding a payment of 500.00 to the credit card and
confirm it. Import a credit card file holding the payment received two days later. Review proposes
it as a transfer from Checking; confirming leaves one transfer of 500.00, and no spending figure
holds it.

**Acceptance Scenarios**:

1. **Given** the ledger holds expense "VISA payment" of 500.00 on Checking dated 2 March, **When**
   the user imports a credit card file holding a payment received of 500.00 dated 4 March, **Then**
   review shows that row as a transfer from Checking, marked as suggested, naming the Checking
   transaction's date, description and amount ([FR-142](#fr-142), [FR-143](#fr-143)).
2. **Given** that suggested transfer, **When** the user confirms the batch, **Then** the message
   before confirming says one transaction will become a transfer, the "VISA payment" expense
   becomes a transfer of 500.00 from Checking to the credit card dated 2 March, no transaction is
   added for the row, and both balances are right ([FR-144](#fr-144), [FR-157](#fr-157)).
3. **Given** a suggested transfer that is in fact a refund from a shop, **When** the user turns its
   Transfer switch off, **Then** the row holds a category again, the Checking transaction stays as
   it was, and confirming adds the row as an income ([FR-143](#fr-143)).
4. **Given** the Checking expense is dated 2 March and the credit card row 9 March, **When** the
   user opens review, **Then** no transfer is suggested, because the two are more than 4 days apart
   ([FR-142](#fr-142)).
5. **Given** a transfer from Checking to Savings dated 30 April is in the ledger, **When** the user
   imports the savings file, whose row for it is dated 2 May, **Then** that row is flagged as a
   duplicate, not added again ([FR-156](#fr-156)).
6. **Given** two credit card rows of 500.00 dated 3 and 5 March and one Checking expense of 500.00
   dated 4 March, **When** the user opens review, **Then** only the 3 March row is suggested,
   because each transaction pairs with one row at most ([FR-142](#fr-142)).

---

<a id="user-story-13"></a>
### User Story 13 - Vendors I sorted before start in their usual category (Priority: P13)

The user has confirmed earlier months in which the supermarket's purchases were mostly put in
Groceries. When they review the next month, the supermarket's rows already hold Groceries, marked
so the user can tell the app chose it from earlier transactions. A vendor the user sorted in
different ways stays in Uncategorised.

**Why this priority**: Most vendors come back month after month. Starting them in their usual
category leaves only new or unusual rows to sort, which is most of the work of a monthly import.

**Independent Test**: Confirm a batch in which vendor "REWE" has 3 of 5 purchases in Groceries and
vendor "Amazon" has 2 of 4 in Household. Import the next month: REWE's rows start in Groceries,
marked as from earlier; Amazon's rows start in Uncategorised.

**Acceptance Scenarios**:

1. **Given** 3 of the 5 expenses with vendor "REWE" in the ledger are in Groceries, **When** the
   user imports a file with REWE purchases, **Then** those rows start in Groceries, marked as from
   earlier transactions, on each row and on the group ([FR-146](#fr-146), [FR-147](#fr-147)).
2. **Given** 2 of the 4 expenses with vendor "Amazon" are in Household and 2 in Hobbies, **When** the
   user imports Amazon purchases, **Then** they start in "Uncategorised", because no category holds
   more than half ([FR-146](#fr-146)).
3. **Given** REWE's expenses are mostly in Groceries and its one income, a refund, is in
   Refunds, **When** a REWE refund is imported, **Then** it starts in Refunds, because only
   incomes count for money in ([FR-146](#fr-146)).
4. **Given** a row that starts in Groceries from earlier transactions, **When** the user assigns it
   any category, even Groceries, **Then** the mark goes ([FR-147](#fr-147)).
5. **Given** rows that start in a category from earlier transactions, **When** the user selects
   Suggest categories, **Then** those rows are not sent, because they no longer hold
   "Uncategorised" ([FR-090](../001-finance-tracker-v1/spec.md#fr-090)).
6. **Given** the user confirms a batch, **When** they later edit one of its transactions on
   Transactions to another category, **Then** the next import counts the new category for that
   vendor ([FR-145](#fr-145), [FR-146](#fr-146)).
7. **Given** 4 of the 5 earlier rows of vendor "Geldautomat" on Checking were confirmed as
   transfers from Checking to Cash, **When** the user imports Checking's next file, **Then** its
   Geldautomat rows start as transfers to Cash, marked as from earlier transactions; turning
   Transfer off leaves them in "Uncategorised" ([FR-146](#fr-146), [FR-147](#fr-147)).

---

<a id="user-story-14"></a>
### User Story 14 - Sort a whole batch with the keyboard (Priority: P14)

The user works through review without the mouse. The first row or group not yet seen is the
current one and stands out from all others. The user types a few letters of a category, the list
narrows to the categories that contain them, and Tab picks the highlighted one and moves on to the
next item. Items the user has already been on look different from those not reached yet, and review
says how many are left.

**Why this priority**: A month of activity is dozens of decisions. Typing three letters and pressing
Tab is far faster than opening a list and scrolling for each one, and knowing where one is and what
is left keeps a long review from going wrong.

**Independent Test**: Open review on a batch of 40 items and categorise every one using only the
keyboard. At every step the current item is clear, items already passed look seen, and the count
of items left falls to zero.

**Acceptance Scenarios**:

1. **Given** the user opens review, **Then** the first item not yet seen is current, stands out
   from every other item, and its category field takes the keys typed ([FR-150](#fr-150)).
2. **Given** the current item's category field, **When** the user types "gro", **Then** the list
   shows only categories whose name contains "gro", ignoring case, with the first highlighted
   ([FR-148](#fr-148)).
3. **Given** "Groceries" is highlighted, **When** the user presses Tab, **Then** the item gets
   Groceries, the next item becomes current, and the previous one looks seen
   ([FR-150](#fr-150), [FR-151](#fr-151)).
4. **Given** the user typed nothing, **When** they press Tab, **Then** the item keeps its category,
   which may come from earlier transactions or the AI, and the next item becomes current
   ([FR-150](#fr-150)).
5. **Given** the current item is the third, **When** the user presses Shift+Tab, **Then** the second
   item becomes current again ([FR-150](#fr-150)).
6. **Given** the user has seen 12 of 40 items, **When** they close the app and open review again,
   **Then** the 12 still look seen, review says 28 are left, and the 13th is current
   ([FR-151](#fr-151), [FR-155](#fr-155)).
7. **Given** the user selects a row with the mouse, **Then** it becomes the current item
   ([FR-150](#fr-150)).

---

<a id="user-story-15"></a>
### User Story 15 - Set small amounts aside (Priority: P15)

A user who does not want to sort every coffee enters 1.00 under "Set aside rows under". Rows below
that amount leave the rows under review, review says how many were set aside, and on confirmation
they enter the ledger in "Uncategorised". The amount is remembered for the next import.

**Why this priority**: Small amounts are many rows and little money. Setting them aside lets a user
who wants a quick monthly review spend their time on the rows that change the picture.

**Independent Test**: Enter 1.00 in review of a batch with 30 rows under 1.00. The 30 rows leave
review, the count says 30, confirming puts them in "Uncategorised", and the next import sets rows
under 1.00 aside without asking.

**Acceptance Scenarios**:

1. **Given** a batch with expenses of 0.50, 0.99, 1.00 and 25.00 and an income of 0.12 interest,
   **When** the user enters 1.00, **Then** the expenses of 0.50 and 0.99 and the income of 0.12 are
   set aside, review says 3 rows under 1.00 are set aside, and the expenses of 1.00 and 25.00 stay
   under review ([FR-152](#fr-152)).
2. **Given** rows set aside, **When** the user confirms, **Then** they enter the ledger in their
   side's "Uncategorised", and every balance holds them ([FR-157](#fr-157), [FR-159](#fr-159)).
3. **Given** the count of rows set aside, **When** the user selects it, **Then** the rows set aside
   show, and the user can bring any one back under review ([FR-153](#fr-153)).
4. **Given** the user entered 1.00 for one import, **When** they review the next import, **Then**
   rows under 1.00 are set aside from the start ([FR-152](#fr-152)).
5. **Given** the user gave a row of 0.80 a category, **When** they then enter 1.00, **Then** that row
   stays under review with its category ([FR-152](#fr-152)).
6. **Given** a suggested transfer of 0.50, **When** the user enters 1.00, **Then** it stays under
   review ([FR-152](#fr-152)).
7. **Given** the user enters "abc" or 0, **Then** nothing is set aside and the field says what it
   needs ([FR-152](#fr-152)).

---

<a id="user-story-16"></a>
### User Story 16 - Add a category from where I pick one (Priority: P16)

While reviewing or entering a transaction, the user finds that no category fits. They choose New
category… at the end of the category list, give a name and a colour, and the new category is
picked for that row, group or transaction at once, without leaving the screen.

**Why this priority**: Today the user must leave review for Categories and come back. It is
needed less often than the stories above, but it removes a detour that breaks a review in the
middle.

**Independent Test**: In review, choose New category… on a group, create "Pets", and see every row
of the group in Pets. In the manual-entry form, do the same for "Gifts".

**Acceptance Scenarios**:

1. **Given** a review group's category list, **When** the user chooses New category…, enters "Pets"
   and a colour and creates it, **Then** every row of the group holds Pets, and Pets is on
   Categories ([FR-149](#fr-149)).
2. **Given** the user typed "pets" and no category matches, **When** they press Enter, **Then** New
   category opens with "pets" as the name ([FR-148](#fr-148), [FR-149](#fr-149)).
3. **Given** the manual-entry form with kind income, **When** the user creates "Gifts" from the
   category list, **Then** Gifts is an income category and the form holds it ([FR-149](#fr-149)).
4. **Given** an expense category "Pets" exists, **When** the user creates "pets" from an expense
   list, **Then** the dialog refuses it and says why, as on Categories
   ([FR-032](../001-finance-tracker-v1/spec.md#fr-032)).
5. **Given** New category is open, **When** the user cancels, **Then** the field keeps what it
   held ([FR-149](#fr-149)).

---

<a id="edge-cases"></a>
### Edge Cases

- A row matches the other side of a transfer already in the ledger, but more than 4 days apart, or
  for a different amount, as with a fee or a currency conversion: no transfer is suggested
  ([FR-142](#fr-142)). The user marks the row as a transfer, and the counter-account's balance is
  off until they delete the stray expense or income there.
- A payment to someone else happens to match: a refund of 50.00 on the credit card two days after
  50.00 left Checking is suggested as a transfer. That is why it is a suggestion; the user turns it
  off ([FR-143](#fr-143)).
- The Checking transaction a suggestion pairs with is deleted or changed on Transactions while the
  batch is pending: suggestions, like duplicate flags, are not recomputed. On confirmation, a row
  whose paired transaction no longer fits enters the ledger as a transfer with that account, as a
  row the user marked would ([FR-144](#fr-144)). If the user had already made that transaction a
  transfer by hand, the transfer is then in the ledger twice, and the user deletes one.
- A row is flagged as a duplicate and the user includes it: it gets no suggested transfer, because
  suggestions are made only when the batch is created, for rows under review
  ([FR-142](#fr-142)).
- A file of the account the paired transaction is on is imported again: its row is flagged as a
  duplicate of the transfer the pair became, even when the two banks booked it on different days
  ([FR-156](#fr-156)).
- A vendor has exactly half its transactions on one side in one category: no usual choice
  ([FR-146](#fr-146)). The same holds for transfers split between two accounts, such as 2 to Cash
  and 2 to Savings.
- A row has both a suggested transfer and a usual choice: it starts with the suggested transfer,
  which names the transaction it pairs with ([FR-158](#fr-158)).
- The category most of a vendor's transactions held is deleted: those transactions move to
  "Uncategorised" ([FR-034](../001-finance-tracker-v1/spec.md#fr-034)), so the next import counts
  them there.
- Transactions confirmed before v1.8, and those entered by hand, have no vendor and count for no
  vendor ([FR-145](#fr-145)). The first import after the update starts every row in
  "Uncategorised", as before.
- A row set aside would have had a usual category: it still enters the ledger in "Uncategorised"
  ([FR-159](#fr-159)). Brought back under review, it holds its usual category again.
- Setting rows aside empties a vendor group but one: the remaining row shows as a plain row
  ([FR-026](../001-finance-tracker-v1/spec.md#fr-026)).
- The user clears the amount or lowers it: rows no longer under it come back under review with
  what they held before ([FR-152](#fr-152)).
- The user types text that matches no category and presses Tab: the item keeps its category and
  the next item becomes current ([FR-150](#fr-150)).
- The user creates a category from review and then discards the batch: the category stays, as one
  created on Categories would ([FR-149](#fr-149)).
- The current item is the last one and the user presses Tab: the focus moves on to Confirm
  ([FR-150](#fr-150)).

## Requirements *(mandatory)*

### Functional Requirements

**Suggested transfers**

- <a id="fr-142"></a>**FR-142**: When a batch is created, System MUST propose a row under review as
  a transfer when a ledger transaction is its other side (a **suggested transfer**). A ledger
  transaction is a row's other side when all of these hold:
  - it is an expense or an income on an account other than the batch's, and its category is not
    "Unaccounted";
  - its amount equals the row's, and is not zero;
  - the money moves the other way: the row's money enters the batch's account and the
    transaction's leaves its account, or the reverse;
  - their dates are at most 4 days apart.

  Each ledger transaction pairs with at most one row, and each row with at most one transaction.
  Where several pairs are possible, the pair with the fewest days between its dates is made first;
  on a tie, the earlier row in file order and the earlier transaction. Suggestions MUST be made
  once, when the batch is created, and MUST NOT change while it is pending, as duplicate flags do
  ([FR-156](#fr-156)). Rows flagged as duplicates get none.
- <a id="fr-143"></a>**FR-143**: Review MUST show a suggested transfer as a transfer with the paired
  transaction's account as counter-account ([FR-023](../001-finance-tracker-v1/spec.md#fr-023)),
  marked as suggested, and MUST name the paired transaction's account, date, description and
  amount. Review MUST say how many transfers it suggests. A row holding a suggested transfer MUST
  show as a plain row, outside its vendor group, so assigning a category to the group leaves it
  alone.
  - Turning its Transfer switch off MUST end the suggestion: the row holds a category again, its
    usual category if its usual choice is one ([FR-146](#fr-146)), or else its side's
    "Uncategorised", and the paired transaction stays as it is.
  - Choosing another counter-account MUST end the suggestion and leave an ordinary transfer, as if
    the user had marked it.
  - A suggestion never replaces a choice of the user's, and nothing else in review ends it.
- <a id="fr-144"></a>**FR-144**: Confirming a row that still holds its suggested transfer MUST NOT
  add a transaction. Instead the paired transaction MUST become a transfer from the account the
  money leaves to the account it enters, keeping its date, amount and description; its category
  goes ([FR-011](../001-finance-tracker-v1/spec.md#fr-011)). If, when the user confirms, the paired
  transaction is gone or no longer an expense or income of that amount on that account, the row
  MUST enter the ledger as a transfer with that counter-account, as a row the user marked would.

**Usual choices**

- <a id="fr-145"></a>**FR-145**: Confirming a batch MUST keep each row's vendor
  ([FR-026](../001-finance-tracker-v1/spec.md#fr-026)) with the transaction it becomes. A
  transaction entered by hand, or confirmed before v1.8, has no vendor. The screens do not show it.
- <a id="fr-146"></a>**FR-146**: A row's **usual choice** is the choice held by more than half of
  the ledger's transactions of the same vendor that move money the same way as the row. Vendors
  compare as in [FR-026](../001-finance-tracker-v1/spec.md#fr-026).
  - For money out, these are the expenses with that vendor and the transfers with that vendor
    whose source is the batch's account; for money in, the incomes with that vendor and the
    transfers with that vendor whose destination is the batch's account.
  - Each category is one choice, and the transfers with each counter-account are one choice.
    "Uncategorised" is a choice too, so when it holds the majority there is no usual choice.
  - A usual choice is either a **usual category** or a **usual transfer** with that
    counter-account. A row whose vendor has no choice held by more than half, or which has no
    vendor, has no usual choice.

  Usual choices MUST be found once, when the batch is created. A row holding a usual transfer is a
  transfer as if the user had marked it ([FR-023](../001-finance-tracker-v1/spec.md#fr-023)).
- <a id="fr-147"></a>**FR-147**: Review MUST mark a category or transfer that is a row's usual
  choice as **from earlier transactions**, on its row and on a vendor group whose rows all hold it,
  and the
  mark MUST look different from the mark of an AI suggestion
  ([FR-093](../001-finance-tracker-v1/spec.md#fr-093)). The mark MUST go when the user assigns the
  row anything, directly or through its group, even the same category, when the user turns its
  Transfer switch or changes its counter-account, and when its category is deleted. Marks are
  review progress ([FR-155](#fr-155)); the ledger keeps no mark.

**Picking a category**

- <a id="fr-148"></a>**FR-148**: Every category picker of one side, in manual entry, in editing a
  row in place on Transactions ([FR-081](../001-finance-tracker-v1/spec.md#fr-081)), and on review
  rows and groups, MUST let the user type to search:
  - The list MUST show only the categories whose name contains the typed text, ignoring case and
    surrounding spaces, in the order the list has without a search, with the first highlighted.
    The arrow keys move the highlight; Enter picks the highlighted category.
  - With no category matching, the list MUST say so, and Enter MUST open New category with the
    typed text as its name ([FR-149](#fr-149)).
  - Escape MUST close the list and leave the field as it was.
  - The rules of [FR-030](../001-finance-tracker-v1/spec.md#fr-030) still hold: one side only, no
    "Unaccounted", and no empty choice.
- <a id="fr-149"></a>**FR-149**: Each picker of [FR-148](#fr-148) MUST end its list with **New
  category…**, which MUST open the dialog Categories uses for the picker's side, a name and a
  colour. Creating the category MUST pick it for the field: for a transaction in the form or in
  the list, for a review row, or for every row of a review group. In review, it counts as the
  user's choice and ends the row's marks ([FR-093](../001-finance-tracker-v1/spec.md#fr-093),
  [FR-147](#fr-147)). Names follow [FR-032](../001-finance-tracker-v1/spec.md#fr-032). Cancelling
  MUST leave the field as it was. A category created there is a category like any other and stays
  when the batch is discarded.

**Keyboard review**

- <a id="fr-150"></a>**FR-150**: Review MUST have one **current item**: a plain row, a vendor group,
  or a row of an unfolded group, which follow their group. The current item MUST stand out from
  every other item by more than colour alone, and MUST scroll into view when it changes.
  - When review opens, the current item MUST be the first item, in the order review shows them,
    that has not been seen ([FR-151](#fr-151)), and its category field takes the keys typed.
  - From an item's category field, Tab MUST make the next item current and put its category field
    in focus; Shift+Tab MUST do the same for the item before. When a search is open and a category
    is highlighted, Tab MUST first pick it ([FR-148](#fr-148)); with nothing typed or nothing
    matching, the item keeps what it holds. On a row holding a transfer, its Transfer switch takes
    the place of the category field. Tab from the last item moves on to Confirm.
  - Selecting an item with the mouse or by touch MUST make it current.
- <a id="fr-151"></a>**FR-151**: An item MUST count as **seen** once another item becomes current
  after it was current; the rows of a seen group are seen too. Seen items, other than the current one, MUST look different from
  items not yet seen, by more than colour alone. Review MUST say how many items are not seen yet.
  Seen marks are review progress ([FR-155](#fr-155)).

**Setting small amounts aside**

- <a id="fr-152"></a>**FR-152**: Review MUST offer **Set aside rows under**, an amount, empty until
  the user enters one. While it holds an amount, every row under review whose amount is less than
  it, whichever way the money moves, MUST be set aside, expenses and incomes alike: it leaves the
  rows under review, so it is in no group, no request for suggestions ([FR-090](../001-finance-tracker-v1/spec.md#fr-090)) and no step of Tab. These rows
  MUST NOT be set aside: a row holding a transfer, suggested, usual or marked, a row the user has
  assigned anything,
  and a row the user brought back ([FR-153](#fr-153)).
  - The amount MUST be more than zero, with at most two decimals. Anything else MUST set nothing
    aside, and the field MUST say what it needs
    ([FR-068](../001-finance-tracker-v1/spec.md#fr-068)). Clearing it sets nothing aside.
  - Changing the amount MUST apply at once: rows that are now under it are set aside, and rows that
    no longer are come back under review holding what they held before.
  - The amount MUST be remembered for every later review, of every account, until the user
    changes it.
- <a id="fr-153"></a>**FR-153**: Review MUST show how many rows are set aside, and the amount.
  Selecting the number MUST present them, and the user MUST be able to bring any one back under
  review. Rows set aside MUST be included in confirmation ([FR-157](#fr-157)).

**Explanations**

- <a id="fr-154"></a>**FR-154**: Each of the following MUST be explained in one plain sentence where
  it appears, with nothing to open and nothing to dismiss, as the terms of
  [FR-138](../001-finance-tracker-v1/spec.md#fr-138) are:
  - on review, once, above the suggested transfers: that the app found the other side of each in
    another account, that confirming makes the two one transfer, and that turning Transfer off
    keeps them apart;
  - the mark from earlier transactions: that most earlier transactions of this vendor are in this
    category, or are transfers with this account;
  - beside Set aside rows under: that rows under the amount are left out of review and saved in
    Uncategorised;
  - on review, above the rows: that typing finds a category, and Tab moves to the next row.

**Requirements that replace 001's**

- <a id="fr-155"></a>**FR-155**: System MUST place parsed rows in a pending batch that has no effect
  on balances, figures, or budgets until confirmed. The pending batch MUST survive closing and
  reopening the app, together with every choice made in review and its progress: categories, rows
  marked as transfers, suggested transfers and whether each still holds
  ([FR-143](#fr-143)), flagged rows included, rows set aside that were brought back
  ([FR-153](#fr-153)), the categories the AI suggested and the usual choices, with their marks
  ([FR-093](../001-finance-tracker-v1/spec.md#fr-093), [FR-147](#fr-147)), and which items were
  seen ([FR-151](#fr-151)). At most one pending batch MAY exist at any time, across all accounts;
  starting an import while one is pending MUST be refused with a message that leads the user to
  review or discard it. Replaces [FR-022](../001-finance-tracker-v1/spec.md#fr-022).
- <a id="fr-156"></a>**FR-156**: System MUST flag a pending row as a duplicate when it matches an
  existing ledger transaction or an earlier row in the same batch. Two entries match only when
  they agree on all four of: account, date, amount, and direction, meaning whether the money leaves
  or enters that account. Descriptions play no part. Dates MUST match exactly, with one exception:
  a transfer in the ledger moves money out of its source account and into its destination account,
  so a pending row matches it on either account when the dates are at most 4 days apart, because
  two banks may book the same transfer on different days ([FR-144](#fr-144)). Flags MUST be
  computed once, when the batch is created, and MUST NOT change while it is pending. Replaces
  [FR-024](../001-finance-tracker-v1/spec.md#fr-024).
- <a id="fr-157"></a>**FR-157**: Confirming a batch MUST move its included rows into the ledger: the
  rows under review with the categories shown in review, and the rows set aside in their side's
  "Uncategorised" ([FR-152](#fr-152)). A row holding a suggested transfer changes the paired
  transaction instead ([FR-144](#fr-144)). Confirming MUST first state how many rows will enter the
  ledger and how many transactions will become transfers. While the AI answers a request for
  suggestions, confirming MUST wait for the answer, so no suggestion enters the ledger unseen
  ([FR-090](../001-finance-tracker-v1/spec.md#fr-090)). Discarding a batch MUST leave the ledger
  unchanged. A confirmed batch cannot be undone as a whole
  ([Out of Scope](../001-finance-tracker-v1/spec.md#out-of-scope)). Replaces
  [FR-027](../001-finance-tracker-v1/spec.md#fr-027).
- <a id="fr-158"></a>**FR-158**: Every row under review MUST start with its suggested transfer
  ([FR-142](#fr-142)) if it has one, or else with its usual choice ([FR-146](#fr-146)), or else
  with its side's "Uncategorised". Every row under review that is not a transfer MUST hold a
  category; the category picker MUST offer no empty state, so no row can be confirmed without a
  category. Replaces [FR-029](../001-finance-tracker-v1/spec.md#fr-029).
- <a id="fr-159"></a>**FR-159**: System MUST itself assign "Uncategorised" to imported rows that hold
  no category the user chose, the AI suggested ([FR-092](../001-finance-tracker-v1/spec.md#fr-092))
  or that is their usual category ([FR-146](#fr-146)), to rows set aside ([FR-152](#fr-152)), and
  to transactions whose category is deleted, and "Unaccounted" to reconciliation differences.
  Replaces [FR-035](../001-finance-tracker-v1/spec.md#fr-035).
- <a id="fr-160"></a>**FR-160**: Users MUST be able to save a backup: one file holding all data the
  app holds, including accounts, transactions with their vendors ([FR-145](#fr-145)), categories,
  budgets, mapping profiles, the pending batch with its review progress ([FR-155](#fr-155)), the
  manual-entry default account ([FR-006](../001-finance-tracker-v1/spec.md#fr-006)), whether AI
  features are on ([FR-095](../001-finance-tracker-v1/spec.md#fr-095)), the chosen model
  ([FR-130](../001-finance-tracker-v1/spec.md#fr-130)), the amount under which review sets rows
  aside ([FR-152](#fr-152)) and the finance chat's conversation
  ([FR-104](../001-finance-tracker-v1/spec.md#fr-104)). The OpenAI API key MUST NOT be part of a
  backup ([FR-126](../001-finance-tracker-v1/spec.md#fr-126)). A backup saved before v1.8 restores
  its transactions without vendors, its pending batch without suggested transfers, usual choices
  or seen items, and no amount for setting rows aside. Replaces
  [FR-070](../001-finance-tracker-v1/spec.md#fr-070).

<a id="key-entities"></a>
### Key Entities

- **Transaction** (changed): one movement of money. Has a date, an amount of zero or more, an
  optional description, a kind (expense, income, transfer), and an account. An expense or income
  has one category from its side. A transfer has a destination account instead of a category. One
  confirmed from an import from v1.8 on also keeps the vendor of the row it came from
  ([FR-145](#fr-145)).
- **Pending row** (changed): one parsed line in a pending batch: its parsed fields, its vendor
  group, its proposed kind, its category or counter-account, whether the AI suggested that category
  or its category or transfer is the row's usual choice ([FR-147](#fr-147)), whether it holds a suggested transfer and
  the transaction it pairs with ([FR-142](#fr-142)), whether it is flagged as a duplicate, whether
  it failed to parse, whether it was brought back from the rows set aside ([FR-153](#fr-153)),
  whether it was seen ([FR-151](#fr-151)), and whether it is included in confirmation.
- **Set-aside amount**: the amount under which review sets rows aside, or none. There is one, for
  every account; it is stored and is part of a backup ([FR-152](#fr-152), [FR-160](#fr-160)).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- <a id="sc-029"></a>**SC-029**: Two accounts' files of one month, which exchange 5 transfers each
  booked up to 4 days apart, are imported one after the other and confirmed with the review
  defaults: all 5 are suggested, the ledger then holds exactly 5 transfers and no expense or income
  for them, and both balances match the files.
- <a id="sc-030"></a>**SC-030**: Importing both files of [SC-029](#sc-029) again and accepting the
  review defaults adds zero transactions to the ledger.
- <a id="sc-031"></a>**SC-031**: In a review after one confirmed month, every row whose vendor has a
  usual choice starts with it, and every other row starts in "Uncategorised", checked on a file of
  about 300 rows across about 40 vendors.
- <a id="sc-032"></a>**SC-032**: A user categorises a review of 40 items using only the keyboard, in
  under 3 minutes and without ever losing track of the current item.
- <a id="sc-033"></a>**SC-033**: Shown a review part way through, 5 of 5 test users point out the
  current item and the items already seen within 5 seconds.
- <a id="sc-034"></a>**SC-034**: With 1.00 set, a file with 30 rows under 1.00 shows none of them
  under review; after confirming, all 30 are in "Uncategorised" and every balance equals the
  balance the same file gives with nothing set aside.
- <a id="sc-035"></a>**SC-035**: A user creates a category from the review list and assigns it to a
  group in under 20 seconds, without leaving review and without losing any choice made in it.
- <a id="sc-036"></a>**SC-036**: A user with a saved mapping profile and one earlier month confirmed
  in v1.8 imports and fully reviews the next month (about 300 rows across about 40 vendors) in
  under 3 minutes, down from the 5 minutes of
  [SC-001](../001-finance-tracker-v1/spec.md#sc-001).

## Assumptions

- Banks in the euro area book a transfer between two of a person's accounts within 4 days on both
  sides, which covers a weekend and a public holiday. A transfer booked further apart is marked by
  hand, as before.
- A transfer arrives with the amount it left with. Fees or currency conversion make the amounts
  differ, and such a transfer is marked by hand.
- The ledger keeps no vendor for transactions confirmed before v1.8, so usual choices start
  with the first batch confirmed in v1.8. Guessing a vendor from old descriptions would be
  unreliable, since descriptions often carry references and dates.
- One amount for setting rows aside suits every account; the app has one currency.
- Setting rows aside changes only review. Rows set aside are ordinary transactions on Transactions,
  Insights and budgets, in "Uncategorised".
- The user reviewing with the keyboard has a physical keyboard. On touch screens, tapping selects
  the current item, and review works as before.
- The guide to the app and FAQ describe this version, as
  [FR-136](../001-finance-tracker-v1/spec.md#fr-136) and
  [FR-139](../001-finance-tracker-v1/spec.md#fr-139) require; no new FAQ question is added.
- Whether keeping vendors and the new review progress in stored data and backups calls for a MAJOR
  version is decided in the plan, by
  [constitution IX](../../.specify/memory/constitution.md#ix-versioning). A v1.7 app refuses a
  v1.8 backup in any case, as saved by a newer version
  ([FR-072](../001-finance-tracker-v1/spec.md#fr-072)).

## Out of Scope

- Importing several files into one pending batch: one batch at a time stays
  ([FR-155](#fr-155)); transfers are found across imports instead.
- Suggesting transfers between rows of the same file, which all belong to one account.
- Vendors that match more loosely than [FR-026](../001-finance-tracker-v1/spec.md#fr-026) says,
  such as "REWE Markt 123" and "REWE Markt 456".
- Usual choices learned from the AI's suggestions before they are confirmed, or from rows of
  the batch under review.
- Setting rows aside on screens other than review.
