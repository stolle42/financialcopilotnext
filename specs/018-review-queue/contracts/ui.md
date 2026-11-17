# Contract: User interface (v1.8 changes)

**Spec**: [FR-143](../spec.md#fr-143), [FR-147](../spec.md#fr-147) –
[FR-154](../spec.md#fr-154), [FR-157](../spec.md#fr-157) · **Everything else**:
[001 contracts/ui.md](../../001-finance-tracker-v1/contracts/ui.md)

This file restates only what v1.8 changes on screen. Each section replaces the part of 001's
contract named in it, and that part links here. Every other screen, the shared patterns and the
look stay as 001 defines them.

<a id="transactions"></a>
## Transactions: Category, edited in place

Replaces the bullet **Category opens a select…** under **Editing in place** of 001's
[Transactions](../../001-finance-tracker-v1/contracts/ui.md#transactions); the other bullets stay.

- Category opens the [category picker](#category-picker) of the transaction's side, open and with
  its search in focus. Picking a category saves, New category… creates one and saves it
  ([FR-149](../spec.md#fr-149)), and Escape cancels. A transfer's cell holds its destination
  instead, and opens a select of every account except the transaction's own. Account opens a
  select of the accounts, which for a transfer leaves out the destination
  ([FR-011](../../001-finance-tracker-v1/spec.md#fr-011)). Picking an option saves, and Escape
  cancels.

<a id="transaction-form"></a>
## Transaction form: Category

Replaces the bullet **Category** of 001's
[Transaction form](../../001-finance-tracker-v1/contracts/ui.md#transaction-form); the other
bullets stay.

- **Category**: the [category picker](#category-picker) of the kind's side. There is no empty
  option ([FR-011](../../001-finance-tracker-v1/spec.md#fr-011)) and no "Unaccounted" option
  ([FR-030](../../001-finance-tracker-v1/spec.md#fr-030)). When the transaction being edited holds
  "Unaccounted", the field shows it as the current value, but it still does not appear among the
  options. A category created from it belongs to the kind's side and is held by the form
  ([FR-149](../spec.md#fr-149)). Changing the kind afterwards follows
  [FR-015](../../001-finance-tracker-v1/spec.md#fr-015). The typical cash expense of
  [SC-002](../../001-finance-tracker-v1/spec.md#sc-002) still takes: type the amount, Tab, type a
  few letters of the category, Enter, Enter.

<a id="review"></a>
## Review

Replaces 001's [Review](../../001-finance-tracker-v1/contracts/ui.md#review) in full.

- **Header**: the account, the file, and these counts: rows to review, **suggested transfers**
  ([FR-143](../spec.md#fr-143)), **N not seen yet** ([FR-151](../spec.md#fr-151)), **set aside**,
  **duplicates** and **unparsable** ([FR-025](../../001-finance-tracker-v1/spec.md#fr-025),
  [FR-028](../../001-finance-tracker-v1/spec.md#fr-028)). Suggested transfers and set aside show
  only when not zero. The set-aside, duplicates and unparsable counts are buttons.
  - The **set aside** drawer lists the rows set aside by date, each with its date, description,
    vendor and amount, and a **Bring back** button ([FR-153](../spec.md#fr-153)). A row brought
    back leaves the drawer and joins the rows under review with what it held.
  - The **duplicates** drawer lists the flagged rows, each with an **Include** switch. An included
    row joins the review list.
  - The **unparsable** drawer lists the row number, the raw cells and the reason. These rows cannot
    be included.
- **Set aside rows under** ([FR-152](../spec.md#fr-152)), between the header and the suggestions:
  an amount field, empty until the user enters an amount, with the shared
  [amount input](../../001-finance-tracker-v1/contracts/ui.md#shared-patterns). Beside it, the
  sentence of [FR-154](../spec.md#fr-154): rows under this amount are left out of review and saved
  in Uncategorised. While it holds an amount, a line under it says how many rows under that amount
  are set aside, such as "3 rows under €1.00 set aside", as the button that opens the drawer.
  - Every valid change applies at once and is saved in the settings, for every later review
    ([R-45](../research.md#r-45)).
  - Zero, a negative amount, more than two decimals or text show `set-aside-amount-invalid` under
    the field, and nothing is set aside. Clearing the field sets nothing aside.
- **Suggestions**, between the set-aside field and the body
  ([FR-090](../../001-finance-tracker-v1/spec.md#fr-090) –
  [FR-094](../../001-finance-tracker-v1/spec.md#fr-094),
  [001 ai.md](../../001-finance-tracker-v1/contracts/ai.md#category-suggestions)):
  - An outline button **Suggest categories for N rows**, where N is the number of rows a request
    would send. Rows set aside, and rows holding a usual category, are not among them, since they
    are not under review or not in "Uncategorised". It is unavailable when N is 0.
  - While AI features are off ([FR-095](../../001-finance-tracker-v1/spec.md#fr-095)), the button
    is unavailable, and a line beside it says that suggestions need AI features, with a link to
    Settings. While they are on, selecting the button sends the request at once, without a dialog.
  - While the AI answers, the button reads **Asking the AI…** and is unavailable. The rows stay
    editable, Confirm is unavailable, and leaving review cancels the request.
  - The outcome shows in a status line beside the button, such as "The AI suggested categories
    for 14 of 20 rows". A failure shows in the review's alert, with the codes of
    [001 ai.md](../../001-finance-tracker-v1/contracts/ai.md#failures).
  - Review names no AI provider; only Settings does.
- **Keyboard line**, above the items: the sentence of [FR-154](../spec.md#fr-154), that typing
  finds a category and Tab moves to the next row, with Shift+Tab back.
- **Body**, in this order; this is also the order of Tab ([FR-150](../spec.md#fr-150)):
  1. **Suggested transfers** ([FR-143](../spec.md#fr-143)), only when the batch has any, under
     the heading "Suggested transfers" and the sentence of [FR-154](../spec.md#fr-154): the app
     found the other side of each in another account; confirming makes the two one transfer;
     turning Transfer off keeps them apart. Each is a row, by date, with its date, description,
     vendor, amount and assignment control, and under it **Pairs with:** the paired transaction's
     account · date · description · amount. When the pair no longer fits
     ([data-model.md](../data-model.md#derived-values)), that line instead says the transaction it
     paired with has changed, so the row will be saved as an ordinary transfer
     ([FR-144](../spec.md#fr-144)).
  2. **Vendor groups**, largest first, collapsed
     ([csv-import.md](csv-import.md#vendor-groups)). A group header shows the vendor, side, count,
     total and the group's assignment control. Unfolding the group shows a control for each row
     ([FR-026](../../001-finance-tracker-v1/spec.md#fr-026)), and its rows follow it in the order
     of Tab. Large groups first gets the most rows out of "Uncategorised" with the fewest actions
     ([SC-001](../../001-finance-tracker-v1/spec.md#sc-001)).
  3. **Plain rows**, by date.

  Above the groups, one line says that the Transfer switch is for money moved between two of the
  user's own accounts, which counts as neither spending nor income
  ([FR-138](../../001-finance-tracker-v1/spec.md#fr-138)).
- **Assignment control**: the [category picker](#category-picker) of the row's side, with no
  "Unaccounted" ([FR-030](../../001-finance-tracker-v1/spec.md#fr-030)), holding what the row
  starts with ([FR-158](../spec.md#fr-158)).
  - A separate **Transfer** switch replaces the picker with a counter-account select, listing every
    account except the batch account ([FR-023](../../001-finance-tracker-v1/spec.md#fr-023)).
  - Switching back gives the row its usual category, when it held a suggested transfer and has
    one, and otherwise the side's "Uncategorised" ([FR-143](../spec.md#fr-143)).
  - Picking a category, also an equal one, creating one, turning the switch or choosing a
    counter-account removes the row's marks ([FR-147](../spec.md#fr-147)).
- **Marks**, after the assignment control; each differs from the others in icon and word, not
  only in colour:
  - **Suggested** ([FR-093](../../001-finance-tracker-v1/spec.md#fr-093)): a sparkle icon and
    "Suggested", on a category the AI suggested, and on a suggested transfer.
  - **From earlier** ([FR-147](../spec.md#fr-147)): a history icon and "From earlier", on a usual
    category or usual transfer. Its sentence ([FR-154](../spec.md#fr-154)), that most earlier
    transactions of this vendor are in this category or are transfers with this account, shows
    once, above the first item that holds the mark, and as the mark's accessible description on
    every one.
  - A group header shows a mark only when all its rows hold the same assignment with the same
    mark. Otherwise the group shows a shared assignment without a mark, or "Mixed", and the marks
    show on the unfolded rows.
- **Current item** ([FR-150](../spec.md#fr-150), [R-44](../research.md#r-44)):
  - It has a 2px outline in the primary colour, a 4px bar at its left edge, and an arrow icon
    before it, so it stands out by shape as well as colour. It scrolls into view, as far as
    needed, when it changes.
  - When review opens, the first item not seen is current, and its picker is in focus, so typing
    searches at once. When every item is seen, the first item is current.
  - In an item's picker, or in the Transfer switch of a row holding a transfer, Tab picks the
    highlighted category when a search is open, then makes the next item current and focuses its
    field. Shift+Tab does the same backwards. With nothing typed or nothing matching, the item
    keeps what it holds. Tab from the last item moves the focus on to Confirm, as browsers do, and
    the item counts as seen.
  - Selecting an item's row or header with the mouse or by touch, or focusing its field, makes it
    current.
  - Unfolding a group makes it current; its rows become items after it.
- **Seen items** ([FR-151](../spec.md#fr-151)): an item becomes seen when the focus moves away
  from it, as the FR states. An item that is not current and is seen shows a check icon before
  it, and its text in the secondary ink. An item not seen has neither. The icons are images named "Seen" and "Current item". While the focus is outside the items, such as on Confirm after Tab from the last item, no item is current, so that item shows the check icon. Rows of a group seen while
  folded show as not seen when it is unfolded. The header's **N not seen yet** counts the
  suggested transfers, groups and plain rows not seen, and reads **All seen** at zero.
- **Saving**: every change is saved at once, so review progress survives closing the app,
  including marks, rows brought back and seen items ([FR-155](../spec.md#fr-155),
  [R-05](../../001-finance-tracker-v1/research.md#r-05)). Which item is current is not saved.
- **Footer**:
  - **Discard** asks for confirmation. Categories created during review stay
    ([FR-149](../spec.md#fr-149)).
  - **Confirm N transactions** opens a modal stating how many rows will enter the ledger, how many
    of them in "Uncategorised" because they were set aside, and how many transactions will become
    transfers ([FR-157](../spec.md#fr-157)). After confirmation, a notification reports what was
    added and changed, and the app opens Transactions. It is unavailable while the AI answers a
    request for suggestions.

<a id="category-picker"></a>
## Shared pattern: Category picker

Adds a row to 001's
[Shared patterns](../../001-finance-tracker-v1/contracts/ui.md#shared-patterns), used by the
transaction form, editing in place and review ([FR-148](../spec.md#fr-148),
[FR-149](../spec.md#fr-149), [R-43](../research.md#r-43)).

| Pattern | Rule |
|---|---|
| Category picker | A field showing the current category's chip. Typing, or opening it, shows the categories of one side in the shared list order, without "Unaccounted", each with its colour swatch; the list keeps those whose name contains the typed text, trimmed and ignoring case, with the first highlighted. The arrow keys move the highlight, Enter picks, and Escape closes the list and leaves the field as it was. The last item is always **New category…**; with nothing matching, the list says "No category matches" above it, and Enter opens the dialog with the typed text as the name. The dialog is the one Categories uses: a name ([FR-032](../../001-finance-tracker-v1/spec.md#fr-032)) and a colour, which defaults to the first palette colour not yet used on that side. Creating picks the new category for the field; Cancel leaves the field as it was |

<a id="message-catalogue"></a>
## Message catalogue

Adds one row to 001's
[Message catalogue](../../001-finance-tracker-v1/contracts/ui.md#message-catalogue).

| Code | Raised when | The message tells the user |
|---|---|---|
| `set-aside-amount-invalid` | [FR-152](../spec.md#fr-152): the set-aside amount is zero, negative, has more than two decimals or is not a number | The amount must be more than 0.00 with at most two decimals; nothing is set aside |

A name refused in the new-category dialog uses the codes `category-name-empty` and
`category-name-taken`, as on Categories.
