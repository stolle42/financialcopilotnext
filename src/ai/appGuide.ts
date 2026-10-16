// The guide to the app that the finance chat answers questions about the app from, and requests to
// change something with how to do it (contracts/ai.md, finance chat; FR-103, FR-109, R-25). It is
// plain text for users, in the words the screens use, and holds no user data. It is the same for
// every question, so it is part of the cached prefix of the instructions. When a screen or a label
// changes, change it here too; appGuide.test.ts keeps it naming every screen and action.

/** The guide to the app, sent after the line `App guide:` of the instructions. */
export const APP_GUIDE = `Financial Copilot is a personal finance app. It keeps the user's accounts, transactions, categories and budgets in the browser, on the user's own computer, and sends nothing anywhere unless AI features are on. Every screen has a sidebar with the entries Transactions, Categories, Accounts, Budgets, Backup, Insights and Settings, and the button Add transaction at the top of the window. The button Ask about your finances, at the bottom right of every screen, opens this chat.

Transactions
The home screen lists every transaction, newest first, with its date, description, category, account and amount. Expenses show a minus sign, income a plus sign, and a transfer between two accounts shows an arrow to its destination account. Above the list, the filters Account, Category, From and To narrow it, and Clear filters resets them. To change a value of a row, select it in the row and type or pick the new value; Enter or leaving the field saves it, and Escape cancels. The Edit transaction button at the end of a row opens the transaction, where its kind can change and where Delete removes it after a confirmation. The link Import CSV opens Import.

Add transaction
The button Add transaction opens a form from any screen. Choose the kind (Expense, Income or Transfer), type the amount, pick the category (for a transfer, the destination account), the account and the date, optionally write a description, and select Save, or press Enter. The form starts as an expense of today in the account last used, in the category Uncategorised, so a typical cash expense needs only the amount and the category. An expense and an income each have their own categories. To enter a transfer, choose Transfer, which asks for a second account to move the money to.

Import
Import turns a CSV file from a bank into transactions. Open Transactions and select Import CSV (with no transactions yet, Import a CSV). Choose the account the file belongs to, choose the file, and choose a mapping profile, which tells the app which column holds the date, the description and the amount. The first time, choose Create new profile: name it, say whether the first row holds column names, say whether the amount is one signed column or separate debit and credit columns, assign the columns, check the preview and select Save. The same profile serves every file of that bank. Edit and Delete next to a profile on the Import screen change or remove it. Select Import to open review.

Review
Review shows the rows of the file before anything enters the ledger. Rows of the same vendor are grouped, the largest group first. Give a group or a row a category with its category select, or turn on its Transfer switch to move the money to another account. Rows the app takes for duplicates of existing transactions are listed under duplicates, where the switch Include adds one anyway; rows it could not read are listed under unparsable and cannot be included. Every change is saved at once, so closing the app loses nothing, and the pending import stays until it is confirmed or discarded. The button Suggest categories for N rows asks the AI for categories for rows still Uncategorised; it needs AI features. Select Confirm N transactions to add the rows to the ledger, or Discard to drop the import and leave the ledger as it was.

Categories
The screen has two tabs, Expenses and Income. Each category has Rename, Colour and Delete. New category asks for a name and a colour. Uncategorised and Unaccounted cannot be deleted, only renamed and recoloured. Deleting any other category moves its transactions to Uncategorised on the same side and removes its monthly limit, after a confirmation that says how many transactions move.

Accounts
The screen lists each account with its name, type and balance, and New account asks for a name, a type and an opening balance, which may be negative. Edit changes them; changing the opening balance asks for a confirmation, because every balance the account has shown changes. Reconcile asks what the account holds right now and books the difference as one transaction in the category Unaccounted, an expense if the account holds less than the app computes and an income if it holds more.

Budgets
Budgets lists the expense categories that can have a limit. Type a monthly limit in a category's field and press Enter, or leave the field, to save it. Remove deletes the limit.

Insights
Insights shows spending over a period, This month at first; pick another with the presets or two dates. It shows Spending over time as a line, Expenses by category and Income by category as donuts with a legend, and the Budgets section with a bar per budgeted category, which reads Over limit when spending passes the limit. Transfers are left out.

Backup
Save backup downloads one file with all data, including the chat's conversation. Restore from backup asks for such a file, checks it, asks for a confirmation and then replaces all data in the app with the file's. Keep backups, because the browser may clear its storage.

Settings
Settings holds the switch AI features, off at first. AI features are Suggest categories in review and this chat. Turning the switch on shows a warning of what is sent to OpenAI, and Turn on agrees to it. AI features work only when the app runs on the user's own computer; a copy hosted on the web keeps them off.

Ask about your finances
This chat answers questions about the user's own finances from their data of the current month and the 12 months before it, general questions about money and finance, and questions about how the app works. It cannot change anything. Under the answer it offers follow-up questions to select, and under an answer about the user's data it lists its sources, which open Transactions with the matching filters. Stop ends an answer being written. Clear conversation, at the top of the chat and after a confirmation, deletes the questions and answers. The conversation stays when the chat is closed or another screen is opened.`;
