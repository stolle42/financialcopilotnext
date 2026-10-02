# Contract: User interface

**Spec**: [User scenarios](../spec.md#user-scenarios), [FR-063 – FR-068](../spec.md#fr-063) ·
**Constitution**: Principle VIII

This contract covers the interface the app exposes to its user: screens, navigation, where each
action lives, and the message for every refusal. It records only the design decisions the spec
leaves open. Each entry links to the requirement it serves instead of restating it.

## Shell and navigation

The app is a desktop layout with a sidebar for navigation and a header ([FR-064](../spec.md#fr-064)).
The header holds the app name and the primary action **Add transaction**, which opens the
[transaction form](#transaction-form) from any screen ([FR-066](../spec.md#fr-066)).

The sidebar is one flat list, without group headings, in the order of the table below. The
screens it does not list are reached from Import.

| Route | Screen | Sidebar position |
|---|---|---|
| `#/` | [Transactions](#transactions), the home screen ([FR-063](../spec.md#fr-063)) | 1 |
| `#/insights` | [Insights](#insights) | 2 |
| `#/import` | [Import](#import) | 3 |
| `#/import/review` | [Review](#review) of the pending batch | not listed |
| `#/import/profiles/new`, `#/import/profiles/:id` | [Profile editor](#profile-editor) | not listed |
| `#/budgets` | [Budgets](#budgets) | 4 |
| `#/categories` | [Categories](#categories) | 5 |
| `#/accounts` | [Accounts](#accounts), deliberately low in the list ([FR-063](../spec.md#fr-063)) | 6 |
| `#/backup` | [Backup](#backup) | 7 |

Routes use the URL hash so the build works from any static host or local file ([R-04](../research.md#r-04)).

## Screens

### Transactions

- **List**: follows [FR-016](../spec.md#fr-016). An expense amount shows a minus sign, an income
  amount shows a plus sign in the positive colour, and a transfer shows a transfer icon in neutral
  colour. For a transfer, the destination appears where the category chip would be (`→ Cash`). An
  empty description shows as muted "No description".
- **Filters** ([FR-016](../spec.md#fr-016)):
  - Account: filtering by an account includes transfers into it.
  - Category: first a side switch (Expenses / Income), then a category of that side. Expense and
    income categories never share one list ([FR-030](../spec.md#fr-030)). The filter offers both
    protected categories, because it is not a picker in manual entry or review.
  - Both filters can apply at once, and **Clear filters** resets them.
- **Selecting a row** opens the [transaction form](#transaction-form) in edit mode.
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

### Insights

- **Period**: a start and end date picker with these presets ([FR-050](../spec.md#fr-050)):

| Preset | Range |
|---|---|
| This month (default) | First to last day of the current month |
| Last month | The previous calendar month |
| Last 3 months | First day of the month two months back, to the last day of the current month |
| This year | 1 January to 31 December of the current year |
| Last year | The previous calendar year |

- **Sections**, in this order ([FR-051](../spec.md#fr-051)):
  1. **Spending over time**: a line of expense totals per day, or per month for periods longer than
     92 days ([R-14](../research.md#r-14)). Empty buckets show as zero. Tooltips format euro amounts.
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
    confirmation, a notification reports what was added and the app opens Transactions.

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
  ([R-07](../research.md#r-07)).

## Shared patterns

These patterns apply on every screen ([FR-065](../spec.md#fr-065)).

| Pattern | Rule |
|---|---|
| Category chip | Colour swatch plus name. The one component used wherever a category appears |
| Amount display | One formatter: `Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" })` ([FR-060](../spec.md#fr-060)) |
| Amount input | Uses the browser locale's decimal separator and the [amount grammar](csv-import.md#amount-grammar) shared with CSV import, so at most 2 decimals. Transaction amounts cannot be negative ([FR-010](../spec.md#fr-010)); balances can |
| Date display | One formatter: `Intl.DateTimeFormat(undefined, { dateStyle: "medium" })` |
| Colour palette | 18 swatches: the 14 distinct seed colours of [data-model.md](../data-model.md#seed-data) plus `#82c91e`, `#e8590c`, `#1098ad` and `#9c36b5` |
| Confirmation | A modal that states the consequence. The confirm button names the action, such as "Delete category" or "Replace all data". Severe confirmations ([FR-001](../spec.md#fr-001), [FR-071](../spec.md#fr-071)) use the danger style |
| Notification | A brief success message after a write that leaves the screen |
| Field error | Shown under its field ([FR-068](../spec.md#fr-068)) |
| Form error | Shown above the submit button ([FR-068](../spec.md#fr-068)) |
| Other refusal | An alert at the top of the region where the action was taken, with a next-step action when there is one ([FR-067](../spec.md#fr-067)) |
| Empty state | One sentence and one primary action |

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
| `reconcile-already-matches` | [FR-005](../spec.md#fr-005), SC-012 | The account already holds this amount; nothing was booked |
| `backup-not-a-backup` | [FR-072](../spec.md#fr-072), SC-012 | The file is not a Financial Copilot backup; current data is unchanged |
| `backup-newer-version` | [FR-072](../spec.md#fr-072), SC-012 | The backup comes from a newer version of the app; current data is unchanged |
| `backup-damaged` | [FR-072](../spec.md#fr-072), SC-012 | What is incomplete or inconsistent; current data is unchanged |
| `save-failed` | A storage write fails ([R-15](../research.md#r-15)) | The change was not saved and nothing changed; free disk space and try again |
| `storage-unavailable` | Storage cannot be opened at start ([R-15](../research.md#r-15)) | The browser does not let the app store data (private window or blocked site data), and what to change |
| `open-in-another-tab` | A second tab starts ([R-07](../research.md#r-07)) | The app is already open in another tab or window; use that one |
| `unexpected-error` | Anything unforeseen ([R-15](../research.md#r-15)) | Something went wrong, saved data is safe, reload the page |
