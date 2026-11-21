import { OPENAI_API_KEYS_URL } from "./openai";

// FAQ's questions and answers (FR-139 – FR-141, R-37, contracts/ui.md FAQ). The FAQ screen shows
// them, and the guide to the app holds them as plain text, so the chat answers as FAQ does.
//
// An answer is paragraphs, separated by a blank line; a paragraph whose lines start "1. ", "2. "
// and so on is a numbered list. A link is written `[label](#/route)` inside the app, and
// `[label](OPENAI_API_KEYS_URL)` for the one page outside it. When a screen or a label changes,
// change the answers too: they use the words of the screens.

export interface FaqEntry {
  question: string;
  answer: string;
}

export interface FaqTopic {
  topic: string;
  questions: readonly FaqEntry[];
}

const keysPage = `[OpenAI's page for API keys](${OPENAI_API_KEYS_URL})`;

export const FAQ: readonly FaqTopic[] = [
  {
    topic: "Getting started",
    questions: [
      {
        question: "Where do I start?",
        answer: `There is nothing to sign up for: the app is ready as soon as it opens. The account Cash and a set of categories are already there.

To record a payment by hand, select Add transaction at the top of the window. To bring in what your bank has recorded, select Import CSV on [Transactions](#/), which reads the CSV file your online banking exports. A bank account is created on [Accounts](#/accounts), or right on [Import](#/import) with New account… in the Account select.`,
      },
      {
        question:
          "Entering every bank transaction by hand is a lot of work. How can I make it easier?",
        answer: `Import your bank's CSV file instead. It takes a few minutes:

1. In your online banking, open the account's transactions, choose the period and export them as CSV. Each bank words this a little differently, such as Export, Download or CSV.
2. On [Transactions](#/), select Import CSV (Import a CSV while the list is empty), which opens [Import](#/import).
3. Choose the account the file belongs to, or New account… to create it.
4. Choose the file.
5. The first time, choose Create new bank CSV format. The app proposes the settings from the file: check in the preview that dates and amounts read right, give the format a name, such as your bank's, and select Save.
6. In review, give each vendor group a category at once, and turn on Transfer for payments to your own accounts, such as your credit card or savings account. Typing in a category field finds a category, and Tab moves to the next row.
7. Select Confirm.

Review helps with the rest. It lists Suggested transfers, payments that match a deposit in another account; confirming makes the two one transfer, and turning Transfer off keeps them apart. A category marked From earlier is the one most earlier transactions of that vendor have. Under Skip rows under, you can enter an amount or choose Under 1, Under 5 or Under 10, and smaller rows are not reviewed; they are still imported, as Uncategorised. Skip none shows every row again. If a category is missing, choose New category… at the end of the list.

The next file of the same bank uses the saved bank CSV format, with nothing to set. Rows you imported before are recognised as duplicates and skipped, so the months of two files may overlap.`,
      },
      {
        question: "Can the app connect to my bank directly?",
        answer: `No, on purpose. The app never holds your bank logins, so it cannot leak them. Your bank's CSV file is the way in, which takes a few minutes a month: see the question above.`,
      },
      {
        question: "Where is my data, and who can see it?",
        answer: `Only in this browser, on this computer. The app sends nothing anywhere unless you use AI features.

The app has no passcode, so anyone who can use this computer's user account can open it and see your data.`,
      },
    ],
  },
  {
    topic: "Importing bank files",
    questions: [
      {
        question: "My bank's file doesn't import, or the preview looks wrong. What do I do?",
        answer: `On [Import](#/import), edit the bank CSV format and watch the preview while you change it:

- Wrong dates: change the date format.
- Wrong amounts: change the decimal separator.
- Strange letters, such as Ã¼ in place of ü: change the encoding.
- Every row shows as an income: turn on Invert the sign.

When a message names missing columns, your bank has changed its file: edit the bank CSV format, or create a new one.

Unparsable rows are rows the format cannot read, such as a closing balance under the transactions. Review says why each one failed. Fix the format, or add such a row by hand with Add transaction.`,
      },
      {
        question: "Why are some rows marked as duplicates?",
        answer: `A row is a duplicate when it matches a transaction already in the account, or an earlier row of the same file, on date, amount and direction. So importing the same months twice adds nothing twice.

Duplicates are left out unless you include them. When two rows really are different, such as two coffees of the same price on the same day, open the duplicates in review and turn on Include.`,
      },
      {
        question: "Can I undo an import?",
        answer: `Before you select Confirm, yes: Discard drops the import and leaves everything as it was.

After Confirm, an import cannot be undone as a whole. Delete its transactions one by one on [Transactions](#/), with Edit transaction and then Delete, or restore a backup saved before the import on [Backup](#/backup). Saving a backup before a large import is wise.`,
      },
    ],
  },
  {
    topic: "Accounts and budgets",
    questions: [
      {
        question:
          "A payment to my credit card or savings account counts as spending. How do I fix it?",
        answer: `Make it a transfer: in review, turn on its Transfer switch and choose the account; after the import, open it on [Transactions](#/) with Edit transaction and choose Transfer. Taking out cash works the same way, as a transfer to Cash.

A transfer counts as neither spending nor income, so no figure on [Insights](#/insights) and no budget shows it. When you later import the other account's file, its side of the transfer shows as a duplicate and is left out.`,
      },
      {
        question: "Why does an account's balance differ from my bank's?",
        answer: `First check the account's opening balance on [Accounts](#/accounts): it is what the account held before its first transaction in the app. Then look for transactions that are missing or there twice.

When the difference stays, select Reconcile on [Accounts](#/accounts) and enter what the account really holds. The app books the difference to the category Unaccounted, so the balances agree again.`,
      },
      {
        question: "How do budgets work? Does money I don't spend carry over?",
        answer: `A budget is a monthly limit for one expense category, set on [Budgets](#/budgets). Each month starts at zero, and nothing carries over: money you don't spend in one month does not raise the next month's limit.

[Insights](#/insights) shows how much of each limit is spent, and which categories are over their limit.`,
      },
    ],
  },
  {
    topic: "Your data and AI features",
    questions: [
      {
        question: "Can I lose my data?",
        answer: `Yes, if the browser clears it. The browser may do so when disk space runs low, and clearing the browser's data for the app deletes it.

So save a backup now and then on [Backup](#/backup). A backup also moves your data to another computer or browser, with Restore from backup there. In Chrome and Edge, installing the app helps the browser keep the data.`,
      },
      {
        question: "What do the AI features do, and what do they cost?",
        answer: `AI features are Suggest categories in review, and the chat Ask about your finances.

They need your own OpenAI API key. Create one on ${keysPage}, then turn on the switch AI features in [Settings](#/settings), or select Turn on AI features in the chat, and enter the key. OpenAI charges your OpenAI account for each request, so setting a monthly limit there is wise.

AI features send data to OpenAI only when you use them. Suggest categories sends the rows' descriptions and payees, your category names, and as examples up to 100 earlier descriptions with their categories, but no amounts, dates or account names. A question to the chat sends your expenses and incomes of the current month and the 12 months before it.`,
      },
    ],
  },
];

/** An answer as plain text: each link as its label. */
const plain = (answer: string) => answer.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

/** FAQ as plain text, for the guide to the app (FR-141): each topic, then its questions and answers. */
export function faqAsText(): string {
  return FAQ.map((topic) =>
    [
      topic.topic,
      ...topic.questions.map((entry) => `${entry.question}\n${plain(entry.answer)}`),
    ].join("\n\n"),
  ).join("\n\n");
}
