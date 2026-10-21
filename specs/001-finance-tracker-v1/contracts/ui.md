# Contract: User interface

**Spec**: [User scenarios](../spec.md#user-scenarios), [FR-063 – FR-068](../spec.md#fr-063),
[FR-112 – FR-116](../spec.md#fr-112), [FR-122](../spec.md#fr-122), [FR-124](../spec.md#fr-124),
[FR-126 – FR-130](../spec.md#fr-126) ·
**Constitution**: Principle VIII

This contract covers the interface the app exposes to its user: screens, navigation, where each
action lives, and the message for every refusal. It records only the design decisions the spec
leaves open. Each entry links to the requirement it serves instead of restating it.

## Shell and navigation

The app is a desktop layout with a sidebar for navigation and a header ([FR-064](../spec.md#fr-064)).
The header holds the app name, the app's version and the primary action **Add transaction**,
which opens the [transaction form](#transaction-form) from any screen ([FR-066](../spec.md#fr-066)).
Before Add transaction, while the browser offers to install the app, an outline button
**Install app** with a download icon asks the browser's own question to install it
([FR-122](../spec.md#fr-122), [app-updates.md](app-updates.md#the-pages-side)). Installed, in
Firefox, and on the dev server, it never shows.
The version reads "Version" and the MAJOR.MINOR of the `version` field of `package.json`, such as
"Version 1.1" for `1.1.0` ([FR-088](../spec.md#fr-088)).
The button of the [finance chat](#finance-chat) sits at the bottom right of every screen
([FR-100](../spec.md#fr-100)).

The sidebar is one flat list, without group headings, in the order of the table below
([FR-084](../spec.md#fr-084)). Import opens from the [Transactions](#transactions) screen, and the
other screens it does not list open from Import. On each of them, the sidebar marks Transactions
as the current entry, since an import feeds its list ([FR-085](../spec.md#fr-085)).

| Route | Screen | Sidebar position |
|---|---|---|
| `#/` | [Transactions](#transactions), the home screen ([FR-063](../spec.md#fr-063)), also with filters as a query, `#/?category=…` | 1 |
| `#/import` | [Import](#import) | not listed |
| `#/import/review` | [Review](#review) of the pending batch | not listed |
| `#/import/profiles/new`, `#/import/profiles/:id` | [Profile editor](#profile-editor) | not listed |
| `#/categories` | [Categories](#categories) | 2 |
| `#/accounts` | [Accounts](#accounts), never the home screen ([FR-063](../spec.md#fr-063)) | 3 |
| `#/budgets` | [Budgets](#budgets) | 4 |
| `#/backup` | [Backup](#backup) | 5 |
| `#/insights` | [Insights](#insights) | 6 |
| `#/settings` | [Settings](#settings) | 7 |

Routes use the URL hash so the build works from any static host or local file ([R-04](../research.md#r-04)).

## Screens

### Transactions

- **Import CSV**: a link styled as an outline button, at the right of the heading, opens
  [Import](#import) ([FR-085](../spec.md#fr-085)). It shows whether or not there are transactions.
- **List**: follows [FR-016](../spec.md#fr-016). An expense amount shows a minus sign, an income
  amount shows a plus sign in the positive colour, and a transfer shows a transfer icon in neutral
  colour. For a transfer, the destination appears where the category chip would be (`→ Cash`). An
  empty description shows as muted "No description".
- **Column headers**: a header above the rows names the columns, in order: Date, Description,
  Category, Account, Amount. Each name sits over its column, and Amount is right-aligned like the
  amounts below it ([FR-080](../spec.md#fr-080), [R-21](../research.md#r-21)).
- **Filters** ([FR-016](../spec.md#fr-016)):
  - Account: filtering by an account includes transfers into it.
  - Category: one select with both sides, as two groups: Expenses, then Income. Each group is
    headed by its side's name, and a divider line separates them ([FR-082](../spec.md#fr-082)).
    The closed select shows the chosen category followed by its group's name, because the same
    name may exist on both sides ([FR-032](../spec.md#fr-032)). The filter offers the protected
    categories of both sides, because it is not a picker in manual entry or review.
  - Date: two date fields, **From** and **To**, empty at first ([FR-083](../spec.md#fr-083)).
    Either one alone limits the list to its side of that date, and both together to the days
    between them. Each end is included, as in an Insights period ([R-14](../research.md#r-14)). A
    From after To shows `date-range-invalid` under the fields, and the list keeps the last range
    that held, as the Insights period does.
  - All filters can apply at once, and **Clear filters** resets them, the dates included.
  - **From a link** ([FR-110](../spec.md#fr-110), [R-26](../research.md#r-26)):
    `#/?category=<id>&account=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD`, each part optional, opens the
    list with those filters set, as a source of the finance chat does. An id the app does not know,
    or a date that is not valid, is ignored. Changing a filter afterwards leaves the address as it
    is.
- **Editing in place** ([FR-081](../spec.md#fr-081)): each cell of a row is a button that edits its
  value right there, one cell at a time. Selecting a cell never opens the form.
  - Date, Description and Amount open a field with the current value, the amount without its sign.
    Enter or leaving the field saves, and Escape cancels.
  - Category opens a select with the rules of the form's Category. A transfer's cell holds its
    destination instead, and opens a select of every account except the transaction's own. Account
    opens a select of the accounts, which for a transfer leaves out the destination
    ([FR-011](../spec.md#fr-011)). Picking an option saves, and Escape cancels.
  - After a save or a cancel, focus returns to the cell.
  - A refusal, such as `amount-invalid`, `date-invalid` or `save-failed`, shows under the cell. The
    field stays open with what the user entered ([FR-068](../spec.md#fr-068),
    [FR-073](../spec.md#fr-073)).
- **Edit button**: the last column of each row holds an **Edit transaction** button. It opens the
  [transaction form](#transaction-form) in edit mode, the place to change the kind or to delete.
- **Empty states**: when there are no transactions at all, the screen says so and offers Add
  transaction and Import a CSV. When the filters match nothing, it says so and offers Clear
  filters.

### Transaction form

- Opens as a modal. The fields are, in order: Kind (Expense / Income / Transfer), Amount, Category
  (Destination for a transfer), Account, Date, Description. Defaults follow
  [FR-014](../spec.md#fr-014).
- **Focus** starts in Amount with its content selected, so typing replaces 0.00. **Enter** saves.
  A typical cash expense therefore takes: type the amount, Tab, pick a category, Enter
  ([SC-002](../spec.md#sc-002)).
- **Category**: a select of the kind's side. Each option shows its colour swatch. There is
  no empty option ([FR-011](../spec.md#fr-011)) and no "Unaccounted" option
  ([FR-030](../spec.md#fr-030)). When the transaction being edited holds "Unaccounted", the field
  shows it as the current value, but it still does not appear among the options.
- **Destination**: offers every account except the selected Account ([FR-011](../spec.md#fr-011)).
  When the Account is changed to the chosen destination, the destination is cleared. With only one
  account, choosing Transfer shows `transfer-needs-second-account` with a link to Accounts.
- **Kind changes** follow [FR-015](../spec.md#fr-015).
- **Edit mode** adds Delete, which asks for confirmation.

### Finance chat

[FR-100](../spec.md#fr-100) – [FR-110](../spec.md#fr-110), [FR-117](../spec.md#fr-117),
[ai.md](ai.md#finance-chat), [User Story 8](../spec.md#user-story-8).

- **Button**: on every screen, fixed at the bottom right of the window, above the screen's content:
  a pill in the primary colour, as **Add transaction** is, with a chat icon and its name, "Ask
  about your finances", as text. The main area ends in space taller than the button, so a screen
  scrolled to its end shows its last content above it. The button opens a sheet from the right
  with that title.
- **Width** ([FR-117](../spec.md#fr-117)): the sheet opens 384px wide, as it did before v1.4.
  Its left edge is a separator named "Resize the chat", which shows the left-right resize cursor
  (`ew-resize`, a double arrow pointing left and right) and takes focus.
  - Dragging the separator moves the sheet's left edge with the pointer, between 320px and three
    quarters of the window. With focus on it, Left widens the sheet by 16px and Right narrows it by
    16px, within the same bounds.
  - The separator's value is the width in pixels, with the bounds as its least and greatest.
  - The width lasts while the app stays open, and is not stored.
- Opening another screen closes the sheet, so that screen shows: by following a link in the
  sheet, a source or the link to Settings, or by going back in the browser's history.
- While AI features are off ([FR-095](../spec.md#fr-095)), the sheet says that the chat needs AI
  features, with a link to [Settings](#settings), and shows neither suggested questions nor a
  field. A stored conversation still shows.
- **Suggested questions**: under the log, a group of buttons named "Suggested questions"
  ([FR-101](../spec.md#fr-101), [FR-111](../spec.md#fr-111)). Selecting one sends it at once.
  - While the conversation is empty, and while its latest question is out of scope, the group
    holds the example questions: "How can I reduce my spending?", "Which of my subscriptions have
    become more expensive?", "Am I on track with my budgets this month?" and "Where did I spend
    more this month than last month?".
  - After a complete answer, it holds that answer's follow-up questions, if it has any.
  - There is none while an answer is awaited or written, and after a stopped answer.
- The conversation is a log: each question, then its answer as plain text, line breaks kept. A
  question out of scope gets the chat's fixed answer, which names what the chat can help with
  ([FR-103](../spec.md#fr-103)).
- While an answer is awaited, its place says "Thinking…" until its first words arrive, and then
  shows the text as it grows ([FR-107](../spec.md#fr-107)).
- **Sources**: under a complete answer, a list headed "Sources" holds a link per source, named
  as the source is. Each opens [Transactions](#transactions) with the source's filters. A source
  whose category is gone shows its name as plain text ([FR-110](../spec.md#fr-110)).
- A stopped answer ends in the mark "Stopped" and has no sources ([FR-108](../spec.md#fr-108)).
- Under the log, a field labelled "Your question" and **Send**, which Enter selects too. Send is
  unavailable while the field is empty. While an answer is awaited or written, **Stop** takes
  Send's place, the field stays editable, Enter sends nothing, and no suggested questions show
  ([FR-108](../spec.md#fr-108)).
- While AI features are on, a small line in the muted colour above the field says which model
  answers, such as "Answers by gpt-5.4-mini": the model in use ([FR-129](../spec.md#fr-129),
  [data-model.md](../data-model.md#derived-values)).
- A failure shows in an alert above the field, with the codes of [ai.md](ai.md#failures). The
  conversation stays as it was before the question, also when part of the answer had shown, and
  the question is back in the field to send again ([FR-104](../spec.md#fr-104)). A failure to
  store a finished answer shows `save-failed`, and the conversation stays as it was.
- **Clear conversation**, a button in the sheet's header, shows while the conversation holds a
  turn and is unavailable while an answer is awaited or written. It asks for confirmation, with
  **Cancel** and **Clear conversation**, saying that the questions and answers will be deleted
  ([FR-069](../spec.md#fr-069)). Then the sheet shows the example questions again.
- The conversation is stored: it stays when the sheet closes, when another screen opens and when
  the app closes. An answer being written goes on while the sheet is closed or another screen is
  open ([FR-104](../spec.md#fr-104), [FR-108](../spec.md#fr-108)).

### Insights

- **Period**: a start and end date picker with these presets ([FR-050](../spec.md#fr-050)):

| Preset | Range |
|---|---|
| This month (default) | First to last day of the current month |
| Last month | The previous calendar month |
| Last 3 months | First day of the month two months back, to the last day of the current month |
| This year | 1 January of the current year to today ([FR-086](../spec.md#fr-086)) |
| Last year | The previous calendar year |

- **Sections**, in this order ([FR-051](../spec.md#fr-051)):
  1. **Spending over time**: a line of expense totals per day, or per month for periods longer than
     92 days ([R-14](../research.md#r-14)). Empty buckets show as zero. Tooltips format euro amounts.
     - A point's tooltip shows its date or month and its total, then a preview of its spending by
       expense category ([FR-087](../spec.md#fr-087)): at most five lines, largest first and by name
       on a tie, each with the category chip and amount. "Unaccounted" is marked "unknown", as in
       the legend ([FR-052](../spec.md#fr-052)).
     - With more than five categories, the four largest show, and a last line such as "3 more
       categories" gives the rest's combined amount.
     - A point without spending shows no categories.
  2. **Expenses by category** and **Income by category**, side by side. Each is a donut with a legend
     of chip, amount and share, sorted by amount and titled with the side's total. "Uncategorised"
     is its own entry ([User Story 3](../spec.md#user-story-3) scenario 5). "Unaccounted" is drawn
     with a hatched fill and marked "unknown" in the legend, at its true share
     ([FR-052](../spec.md#fr-052)).
  3. **Budgets**: one bar per budgeted category for the month that contains the period's end date,
     labelled with that month ([FR-051](../spec.md#fr-051), [R-14](../research.md#r-14)). Each bar
     shows spent against limit. An over-limit bar uses the danger colour, an alert icon and the
     label "Over limit", so it reads without any number ([SC-011](../spec.md#sc-011)). With no
     budgets, the section links to Budgets.
- Each section has its own empty state ([User Story 3](../spec.md#user-story-3) scenario 6). Charts
  show tooltips but offer no click-through ([FR-053](../spec.md#fr-053)).

### Import

- **With a batch pending**: a card names its account, file and counts, with **Review** and
  **Discard**. Choosing a file is still possible. Doing so is refused with `import-batch-pending`,
  which includes an **Open pending batch** action ([FR-022](../spec.md#fr-022)).
- **Otherwise**:
  - Account: required, with no default, because a wrong default would put a whole file into the
    wrong account.
  - File: a drop zone or file picker.
  - Profile: a select that includes **Create new profile**. It is preselected when exactly one
    profile exists.
  - **Import** creates the batch and opens [Review](#review). Refusals are listed in
    [csv-import.md](csv-import.md#outcomes).
- **Mapping profiles**: a list with Edit and Delete. The delete confirmation says that a pending
  batch is not affected ([FR-021](../spec.md#fr-021)).

### Profile editor

- Holds the profile fields of [data-model.md](../data-model.md#mapping-profile).
  - A header-row switch, "First row contains column names", on by default.
  - An amount mode, either *one signed column* or *separate debit and credit columns*.
  - Column selects that list header texts, or "Column 1…n" with a sample value each when there is no
    header row.
- The preview follows [csv-import.md](csv-import.md#preview). A new profile previews the file being
  imported. An edited profile previews a sample file the user picks.
- **Save** checks the name ([FR-021](../spec.md#fr-021)) and that the date, amount and description
  columns are assigned. When the editor was opened from an import, saving continues that import.

### Review

- **Header**: the account, the file, and three counts: rows to review, **duplicates** and
  **unparsable**. The duplicates and unparsable counts are buttons
  ([FR-025](../spec.md#fr-025), [FR-028](../spec.md#fr-028)).
  - The **duplicates** drawer lists the flagged rows, each with an **Include** switch. An included
    row joins the review list.
  - The **unparsable** drawer lists the row number, the raw cells and the reason. These rows cannot
    be included.
- **Suggestions**, between the header and the body ([FR-090](../spec.md#fr-090) –
  [FR-094](../spec.md#fr-094), [ai.md](ai.md#category-suggestions)):
  - An outline button **Suggest categories for N rows**, where N is the number of rows a request
    would send. It is unavailable when N is 0.
  - While AI features are off ([FR-095](../spec.md#fr-095)), the button is unavailable, and a line
    beside it says that suggestions need AI features, with a link to [Settings](#settings). While
    they are on, selecting the button sends the request at once, without a dialog.
  - While the AI answers, the button reads **Asking the AI…** and is unavailable. The rows stay
    editable, Confirm is unavailable, and leaving review cancels the request.
  - The outcome shows in a status line beside the button, such as "The AI suggested categories
    for 14 of 20 rows". A failure shows in the review's alert, with the codes of
    [ai.md](ai.md#failures).
  - Review names no AI provider; only [Settings](#settings) does.
- **Suggested mark** ([FR-093](../spec.md#fr-093)): a sparkle icon and "Suggested" after the
  category select of a row whose category the AI suggested. A group header shows the mark only when
  all its rows hold the same suggested category. Otherwise the group shows what it would without
  suggestions, a shared category or "Mixed", and the marks show on the unfolded rows.
- **Body**: vendor groups first, largest first, collapsed. Plain rows follow by date
  ([csv-import.md](csv-import.md#vendor-groups)). Large groups first gets the most rows out of
  "Uncategorised" with the fewest actions ([SC-001](../spec.md#sc-001)).
  - A group header shows the vendor, side, count, total and the group's assignment control.
    Unfolding the group shows a control for each row ([FR-026](../spec.md#fr-026)).
- **Assignment control**: a category select of the row's side, with no "Unaccounted"
  ([FR-030](../spec.md#fr-030)) and "Uncategorised" as the start value
  ([FR-029](../spec.md#fr-029)).
  - A separate **Transfer** switch replaces the select with a counter-account select, listing every
    account except the batch account ([FR-023](../spec.md#fr-023)).
  - Switching back restores the side's "Uncategorised".
- **Saving**: every change is saved at once, so review progress survives closing the app
  ([FR-022](../spec.md#fr-022), [R-05](../research.md#r-05)).
- **Footer**:
  - **Discard** asks for confirmation.
  - **Confirm N transactions** opens a modal stating the count ([FR-027](../spec.md#fr-027)). After
    confirmation, a notification reports what was added and the app opens Transactions. It is
    unavailable while the AI answers a request for suggestions.

### Budgets

- Lists every expense category that can carry a budget ([FR-040](../spec.md#fr-040)). Each has a limit
  field and, when a limit is set, **Remove**.
- A limit saves on Enter or when the field loses focus. Changes show immediately
  ([User Story 4](../spec.md#user-story-4) scenario 5).
- Income and protected categories are not listed ([User Story 4](../spec.md#user-story-4)
  scenario 4).

### Categories

- Two tabs, Expenses and Income ([FR-030](../spec.md#fr-030)). Each row shows the category chip with
  the actions Rename (inline), Colour (palette) and Delete.
- **Delete**:
  - On a protected category, Delete shows `category-protected` instead of a confirmation
    ([FR-033](../spec.md#fr-033)).
  - Otherwise, the confirmation states the consequences with counts, for example "12 transactions
    move to Uncategorised; its monthly limit is removed" ([FR-034](../spec.md#fr-034)).
- **New category** asks for a name ([FR-032](../spec.md#fr-032)) and a colour. The colour defaults to
  the first palette colour not yet used on that side.

### Accounts

- **List**: name, type and computed balance ([FR-002](../spec.md#fr-002)).
- **New account**: name, type and opening balance, which may be negative.
- **Edit**: name, type and opening balance. A changed opening balance needs a confirmation in the
  danger style, warning that every balance the account has ever shown will change
  ([FR-001](../spec.md#fr-001)).
- **Reconcile**, available on every account ([FR-005](../spec.md#fr-005)):
  - A dialog asks what the account holds right now. Negative amounts are allowed.
  - If a difference is booked, a notification describes it, for example "Booked an expense of
    €15.00 to Unaccounted".
  - If the balance already matches, the dialog shows `reconcile-already-matches`.

### Backup

- **Save backup** downloads the file ([FR-070](../spec.md#fr-070),
  [backup-file.md](backup-file.md#saving-fr-070)).
- **Restore from backup** asks for a file, then follows [backup-file.md](backup-file.md#loading-fr-071-fr-072):
  validate, then confirm in the danger style, then replace. Afterwards, a notification reports the
  restore and the app opens Transactions.
- When the browser has not granted persistent storage, the screen says so. It explains that the
  browser may then clear the data under storage pressure, and that a backup is the safeguard
  ([R-07](../research.md#r-07)). While the header offers Install app, the note adds that
  installing the app helps the browser keep the data, and holds **Install app** too
  ([FR-075](../spec.md#fr-075)).

### Settings

- **AI features** ([FR-095](../spec.md#fr-095), [FR-126](../spec.md#fr-126) –
  [FR-130](../spec.md#fr-130)): a section with one switch, **AI features**. It shows on only while
  AI features are on: the stored switch and a stored key
  ([data-model.md](../data-model.md#derived-values)). Under it, a line lists what the AI features
  do, "Suggest categories in review" and "the finance chat", and says that they send data to
  OpenAI, which charges the user's own OpenAI account.
  - Turning the switch on opens a dialog titled "Turn on AI features?" ([FR-127](../spec.md#fr-127)):
    - The **data-sharing warning**: data will now be shared with OpenAI.
      - Suggest categories sends the payee and purpose of the rows under review, the category
        names and up to 100 earlier descriptions, and no amounts, dates or account names
        ([FR-091](../spec.md#fr-091)).
      - The finance chat sends each question with the conversation, the expenses and incomes of
        the current month and the 12 months before it with their dates, descriptions, amounts and
        categories, their monthly totals, this month's budgets, and each account's name, type and
        balance ([FR-102](../spec.md#fr-102)).
    - **About the key**: "An OpenAI API key lets the app ask OpenAI for you. OpenAI charges your
      own OpenAI account for every question and every request for suggestions, so setting a monthly
      limit there is wise."
    - A link, "Create an API key at OpenAI", to `https://platform.openai.com/api-keys`, opening in
      a new tab (`target="_blank"`, `rel="noopener noreferrer"`). Following it is no request of the
      app's ([FR-061](../spec.md#fr-061)).
    - With no key stored, a field labelled "OpenAI API key": a password field, with autocomplete
      and spellcheck off. With a key stored, the line "Your key: sk-…a1b2" in its place
      ([FR-126](../spec.md#fr-126)).
    - **Cancel** and **Turn on**. Turn on is unavailable while the field is empty after trimming.
  - **Turn on** checks the key ([ai.md](ai.md#key-check)). While it does, Turn on reads
    **Checking key…** and is unavailable, and the field is read-only.
    - Accepted: the dialog closes, the key is stored and the switch is on. A failed write shows
      `save-failed` in the dialog, and nothing is stored.
    - Not accepted: the dialog shows `ai-key-not-accepted` as a form error, and keeps what the
      user entered. With a stored key, the message is the same; Remove key clears it.
    - Not reachable: the dialog shows `ai-key-check-unreachable` as a form error.
  - **Cancel** (or Escape), also during the check, stops the check and closes the dialog; the
    switch stays off and nothing is saved.
  - Turning the switch off saves at once, without a dialog, and keeps the key. An answer being
    written stops ([FR-108](../spec.md#fr-108)).
  - With a key stored, the section shows "Your key: sk-…a1b2" and **Remove key**, whether the
    switch is on or off. Remove key asks for confirmation, titled "Remove key?", saying that AI
    features turn off and the key must be entered again to use them, with **Cancel** and
    **Remove key** ([FR-069](../spec.md#fr-069)). Confirming deletes the key and turns AI features
    off at once, as turning the switch off does.
  - No screen shows the whole key, and no notice shows while AI features are on.
- **Model** ([FR-129](../spec.md#fr-129), [FR-130](../spec.md#fr-130)): beside the switch, a group
  of radio buttons labelled "Model", in the order of `AI_MODELS`, each its model's id with its hint
  in the muted colour: "gpt-5.4-mini" with "fastest", "gpt-5.6-luna" with "balanced",
  "gpt-6.1-sol" with "most thorough, slowest". It is available whether AI features are on or off.
  - The checked one is the model in use ([data-model.md](../data-model.md#derived-values)).
  - Selecting one, also the one already checked, saves it at once and sends nothing. A failed
    write shows `save-failed`, and the choice stays as it was.
  - While the stored model is no longer offered, a line under the group says "The model you chose
    is no longer offered; now using gpt-5.4-mini.", naming the default, until the user selects one.
- **Update** ([FR-124](../spec.md#fr-124), [app-updates.md](app-updates.md#the-pages-side)): once
  a newer version is downloaded, a section at the top of the screen, in the info style, says
  "Version 1.6 is available (you have 1.5). Make a backup first.", with the versions as the header
  shows them, and holds **Backup** and **Update**.
  - **Backup** saves a backup, as Save backup on the [Backup](#backup) screen does.
  - **Update** opens the app again on the newer version. If the worker does not answer, the
    section shows `update-failed`, and the app runs on as it was.
  - The section shows nothing else, such as a list of changes. No other screen shows the notice.
- Later settings join this screen as sections of their own.

## Shared patterns

These patterns apply on every screen ([FR-065](../spec.md#fr-065)).

| Pattern | Rule |
|---|---|
| Category chip | Colour swatch plus name. The one component used wherever a category appears |
| Amount display | One formatter: `Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" })` ([FR-060](../spec.md#fr-060)) |
| Amount input | Uses the browser locale's decimal separator and the [amount grammar](csv-import.md#amount-grammar) shared with CSV import, so at most 2 decimals. Transaction amounts cannot be negative ([FR-010](../spec.md#fr-010)); balances can |
| Date display | One formatter: `Intl.DateTimeFormat(undefined, { dateStyle: "medium" })` |
| List order | Accounts and mapping profiles by name. Categories by name within their side, with "Uncategorised" and "Unaccounted" last, in that order. Names sort ignoring case, in the browser's language. The transaction list has its own order ([FR-016](../spec.md#fr-016)) |
| Colour palette | 18 swatches: the 14 distinct seed colours of [data-model.md](../data-model.md#seed-data) plus `#82c91e`, `#e8590c`, `#1098ad` and `#9c36b5` |
| Confirmation | A modal that states the consequence. The confirm button names the action, such as "Delete category" or "Replace all data". Severe confirmations ([FR-001](../spec.md#fr-001), [FR-071](../spec.md#fr-071)) use the danger style |
| Notification | A brief success message after a write that leaves the screen |
| Field error | Shown under its field ([FR-068](../spec.md#fr-068)) |
| Form error | Shown above the submit button ([FR-068](../spec.md#fr-068)) |
| Other refusal | An alert at the top of the region where the action was taken, with a next-step action when there is one ([FR-067](../spec.md#fr-067)) |
| Empty state | One sentence and one primary action |

<a id="look"></a>
## Look

Since v1.4, every screen wears the look of the owner's reference design
([FR-112](../spec.md#fr-112) – [FR-116](../spec.md#fr-116), [R-27](../research.md#r-27)). The
tokens live in `src/ui/index.css`. Layout, controls and labels are those of the sections above.

**Palette**

| Colour | Value | Where |
|---|---|---|
| Canvas | `#eef1f7` | Behind the cards; the current sidebar entry and tab; hover and focus tints |
| Card | `#f9fafc` | Cards, the sidebar, dialogs, panels, menus, notifications, tooltips and fields; text on the primary colour |
| Ink | `#2b3346` | Text |
| Secondary ink | `#646c82` | Secondary text, such as dates, hints and the version |
| Primary | `#5a70ad` | The primary action, the chat's button, pressed toggles, switches that are on, budget bars within their limit, the spending line and the focus ring |
| Danger | `#a65360` | Danger text, danger buttons and budget bars over their limit |
| Positive | `#45765d` | Positive amounts |
| Outline | Ink at 8% | Card outlines, dividers and field borders |
| Off | Ink at 20% | A switch that is off |

**Type**

| Text | Face | Weight | Size |
|---|---|---|---|
| A screen's heading (`h1`) | Fraunces | 600 | 30px |
| A section's heading (`h2`), a dialog's or panel's title, the app's name | Fraunces | 600 | 20px |
| Everything else | Figtree | 400 to 700 | As before v1.4 |

**Surfaces**

| Surface | Look |
|---|---|
| Card | Card colour, 22px corners, the outline, and a soft shadow, `0 18px 36px -24px` ink at 50%. A section's card has 24px padding; a list's rows keep their own |
| Sidebar | A card with 8px padding. Each entry is a pill with 14px corners, in secondary ink and in ink on hover; the current entry is in ink on the canvas |
| Header | On the canvas, with no line below it |
| Dialog and confirmation | A card with a deeper shadow, `0 24px 48px -16px` ink at 40%. The actions sit at its foot without a band |
| Panel | Card colour, with the outline along its open edge and the deeper shadow |
| Menu, notification, chart tooltip | Card colour, the outline and a shadow, with 14px corners, or 18px for a notification |

**Controls**

| Control | Look |
|---|---|
| Button | 14px corners. Primary: filled in the primary colour, semibold, raised by `0 10px 20px -8px` primary at 70%. Outline: filled in the card colour, with the outline. Ghost: the canvas on hover |
| Field and select | 14px corners, filled in the card colour, with the outline and the primary focus ring |
| Toggle | 14px corners. Pressed: filled in the primary colour, with text in the card colour |
| Tabs | A segmented control: a card-coloured track with the outline and 14px corners, whose current tab shows on the canvas |
| Switch | The primary colour when on, the off colour when off |
| Budget bar | 12px tall and fully rounded, on a canvas track |
| The chat's button | The primary button's look, as a pill, where it was before ([finance chat](#finance-chat)) |
| The chat's edge | A grip at the middle of the sheet's left edge, 4px wide, 40px tall and fully rounded, in the off colour, and in the primary colour on hover, while dragged and with focus ([finance chat](#finance-chat)) |

## Message catalogue

Every refusal and failure has a code. Domain and store functions return codes, never text. The UI
turns a code into plain language in one module, `src/ui/messages.ts`, which holds the exact wording
([R-15](../research.md#r-15), [FR-067](../spec.md#fr-067)). The table below records what each message
must convey. [SC-012](../spec.md#sc-012) is covered by the rows that cite it.

| Code | Raised when | The message tells the user |
|---|---|---|
| `account-name-empty` | Saving an account without a name | The account needs a name |
| `account-name-taken` | [FR-001](../spec.md#fr-001), SC-012 | An account with this name exists; choose another name |
| `amount-invalid` | [FR-010](../spec.md#fr-010), SC-012 | The amount must be a number of zero or more with at most two decimals |
| `balance-invalid` | An opening or stated balance is not a number | The balance must be a number with at most two decimals |
| `date-invalid` | [FR-010](../spec.md#fr-010), SC-012 | The date is missing or not a real date |
| `date-range-invalid` | [FR-083](../spec.md#fr-083): filtering the transaction list with From after To | The From date must be on or before the To date |
| `transfer-destination-missing` | [FR-011](../spec.md#fr-011), SC-012 | Choose the account the money goes to |
| `transfer-needs-second-account` | [FR-011](../spec.md#fr-011), SC-012 | A transfer needs a second account; create one under Accounts |
| `category-name-empty` | Saving a category without a name | The category needs a name |
| `category-name-taken` | [FR-032](../spec.md#fr-032), SC-012 | There is already an expense (or income) category with this name |
| `category-protected` | [FR-033](../spec.md#fr-033), SC-012 | Why this category cannot be deleted (what the app files there); renaming and recolouring still work |
| `budget-limit-invalid` | [FR-040](../spec.md#fr-040) | The limit must be an amount above 0.00 |
| `profile-name-empty` | Saving a profile without a name | The profile needs a name |
| `profile-name-taken` | [FR-021](../spec.md#fr-021), SC-012 | A profile with this name exists; choose another name |
| `profile-columns-incomplete` | [FR-021](../spec.md#fr-021) | Which of date, amount and description still need a column |
| `import-account-missing` | [FR-020](../spec.md#fr-020) | Choose the account to import into |
| `import-batch-pending` | [FR-022](../spec.md#fr-022), SC-012 | An import is waiting for review and must be confirmed or discarded first; offers to open it |
| `import-file-unreadable` | The browser cannot read the file | The file could not be read; choose it again |
| `import-decoding-failed` | [csv-import.md](csv-import.md#pipeline) step 2 | The file is not valid in the profile's encoding; try another encoding in the profile |
| `import-missing-columns` | [FR-021](../spec.md#fr-021) | Which columns the profile expects that the file lacks |
| `import-duplicate-header` | [csv-import.md](csv-import.md#pipeline) step 4 | Which column name appears twice in the file |
| `import-no-transactions` | [Edge cases](../spec.md#edge-cases), SC-012 | The file contained no transactions |
| Row failure codes | [FR-028](../spec.md#fr-028), SC-012 | One reason per row, as in [csv-import.md](csv-import.md#unparsable-rows) |
| `ai-features-off` | [FR-061](../spec.md#fr-061): an AI feature asked for while AI features are off | This needs AI features, which Settings turns on; nothing was sent |
| `ai-unreachable` | [FR-094](../spec.md#fr-094), [FR-104](../spec.md#fr-104), SC-012: OpenAI cannot be reached ([ai.md](ai.md#failures)) | OpenAI could not be reached; check the internet connection, then try again. Nothing changed |
| `ai-timeout` | [FR-094](../spec.md#fr-094), [FR-104](../spec.md#fr-104): no answer within 4 minutes | The AI took too long; try again, with fewer rows or a shorter question. Nothing changed |
| `ai-key-rejected` | [FR-094](../spec.md#fr-094), [FR-126](../spec.md#fr-126): OpenAI no longer accepts the stored key | OpenAI no longer accepts your key; remove it in Settings and turn AI features on with a new one. Links to [Settings](#settings). Nothing changed |
| `ai-no-credit` | [FR-094](../spec.md#fr-094): no credit left, or the monthly limit reached | Your OpenAI account has no credit left or reached its monthly limit; add credit or raise the limit on OpenAI's platform, then try again. Nothing changed |
| `ai-model-unavailable` | [FR-094](../spec.md#fr-094), [FR-129](../spec.md#fr-129): the key may not use the model in use | Your key cannot use the model, which it names; choose another model in Settings, then try again. Links to [Settings](#settings). Nothing changed |
| `ai-failed` | [FR-094](../spec.md#fr-094), [FR-104](../spec.md#fr-104): OpenAI reports another failure, such as too many requests | OpenAI refused the request; try again in a moment. Nothing changed |
| `ai-key-not-accepted` | [FR-127](../spec.md#fr-127): the key check got a 401 | Exactly: "OpenAI didn't accept this key. Check that you copied all of it." |
| `ai-key-check-unreachable` | [FR-127](../spec.md#fr-127): the key check got no answer, or another status | OpenAI could not be reached, so the key was not checked; try again once connected. Nothing was stored |
| `ai-answer-invalid` | [FR-094](../spec.md#fr-094), [FR-104](../spec.md#fr-104): the answer has the wrong form | The AI's answer could not be read; try again. Nothing changed |
| `suggestions-outdated` | [FR-092](../spec.md#fr-092): the batch was confirmed, discarded or replaced while the AI answered | The import changed meanwhile, so no suggestion was used |
| `reconcile-already-matches` | [FR-005](../spec.md#fr-005), SC-012 | The account already holds this amount; nothing was booked |
| `backup-not-a-backup` | [FR-072](../spec.md#fr-072), SC-012 | The file is not a Financial Copilot backup; current data is unchanged |
| `backup-newer-version` | [FR-072](../spec.md#fr-072), SC-012 | The backup comes from a newer version of the app; current data is unchanged |
| `backup-damaged` | [FR-072](../spec.md#fr-072), SC-012 | What is incomplete or inconsistent; current data is unchanged |
| `save-failed` | A storage write fails ([R-15](../research.md#r-15)) | The change was not saved and nothing changed; free disk space and try again |
| `storage-unavailable` | Storage cannot be opened at start ([R-15](../research.md#r-15)) | The browser does not let the app store data (private window or blocked site data), and what to change |
| `update-failed` | [FR-124](../spec.md#fr-124): the worker did not confirm Update ([app-updates.md](app-updates.md#messages)) | The update could not start; close the app, open it again and try again. Your data is unchanged |
| `open-in-another-tab` | A second tab starts ([R-07](../research.md#r-07)) | The app is already open in another tab or window; use that one |
| `unexpected-error` | Anything unforeseen ([R-15](../research.md#r-15)) | Something went wrong, saved data is safe, reload the page |
