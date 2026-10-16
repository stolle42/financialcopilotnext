import { accountBalance, sortAccounts } from "./accounts";
import { budgetProgress } from "./budgets";
import type { Changes } from "./changes";
import { isCalendarDate, monthOf, monthPeriod, monthsInPeriod, startOfMonthsBefore } from "./dates";
import { insights, type Breakdown } from "./insights";
import { nameKey } from "./names";
import type { AccountType, ChatSource, ChatTurn, Side, State } from "./types";

// The finance chat's data: what one question sends (FR-102, R-25; contracts/ai.md, finance chat),
// and the conversation's turns and their sources (FR-104, FR-110, R-26).

/** A month's total of one side, and the amount of each category that has one, in euros. */
export interface ChatTotals {
  total: number;
  byCategory: Record<string, number>;
}

/** The data a question sends, with amounts in euros and money out negative. */
export interface ChatContext {
  today: string;
  period: { from: string; to: string };
  accounts: { name: string; type: AccountType; balance: number }[];
  budgets: { category: string; limit: number; spent: number }[];
  months: { month: string; expenses: ChatTotals; income: ChatTotals }[];
  transactions: {
    columns: ["date", "description", "amount", "category"];
    rows: [date: string, description: string, amount: number, category: string][];
  };
}

/** How many months before today's month a question reaches back: 13 months in all (FR-102). */
const MONTHS_BACK = 12;

const euros = (cents: number) => cents / 100;

function totalsOf(breakdown: Breakdown): ChatTotals {
  return {
    total: euros(breakdown.totalCents),
    byCategory: Object.fromEntries(
      breakdown.entries.map((entry) => [entry.category.name, euros(entry.amountCents)]),
    ),
  };
}

/**
 * The data a question asked on `today` sends: the current month and the 12 before it, with each
 * month's totals as Insights computes them, every expense and income of the period, this month's
 * budgets and each account's balance. It holds no id, colour, profile, pending import or setting.
 */
export function chatContext(state: State, today: string): ChatContext {
  const from = startOfMonthsBefore(today, MONTHS_BACK);
  const currentMonth = monthOf(today);

  const months = monthsInPeriod({ start: from, end: today }).map((month) => {
    const whole = monthPeriod(month);
    const period = month === currentMonth ? { start: whole.start, end: today } : whole;
    const { expenses, income } = insights(state, period);
    return { month, expenses: totalsOf(expenses), income: totalsOf(income) };
  });

  const categoryNames = new Map(state.categories.map((c) => [c.id, c.name]));
  const rows: ChatContext["transactions"]["rows"] = [];
  for (const transaction of [...state.transactions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.seq - b.seq,
  )) {
    if (transaction.kind === "transfer" || transaction.date < from || transaction.date > today) {
      continue;
    }
    const amount = euros(
      transaction.kind === "expense" ? -transaction.amountCents : transaction.amountCents,
    );
    rows.push([
      transaction.date,
      transaction.description,
      amount,
      categoryNames.get(transaction.categoryId) ?? "",
    ]);
  }

  return {
    today,
    period: { from, to: today },
    accounts: sortAccounts(state.accounts).map((account) => ({
      name: account.name,
      type: account.type,
      balance: euros(accountBalance(state, account.id)),
    })),
    budgets: budgetProgress(state, currentMonth).map((progress) => ({
      category: progress.category.name,
      limit: euros(progress.limitCents),
      spent: euros(progress.spentCents),
    })),
    months,
    transactions: { columns: ["date", "description", "amount", "category"], rows },
  };
}

/** A source as an answer names it, by the names the data sent holds (contracts/ai.md). */
export interface NamedSource {
  name: string;
  from: string;
  to: string;
  category: { side: Side; name: string } | null;
  account: string | null;
}

/**
 * The sources an answer names, with the ids of their category and account, found by name key.
 * A source whose category or account the user does not have, or without a name or valid dates,
 * is left out, like anything else in an answer the app cannot use (FR-110).
 */
export function chatSources(state: State, named: readonly NamedSource[]): ChatSource[] {
  const sources: ChatSource[] = [];
  for (const source of named) {
    if (source.name.trim() === "") continue;
    if (!isCalendarDate(source.from) || !isCalendarDate(source.to) || source.from > source.to) {
      continue;
    }
    const { category, account } = source;
    const categoryId = category
      ? state.categories.find(
          (c) => c.side === category.side && nameKey(c.name) === nameKey(category.name),
        )?.id
      : null;
    const accountId = account
      ? state.accounts.find((a) => nameKey(a.name) === nameKey(account))?.id
      : null;
    if (categoryId === undefined || accountId === undefined) continue;
    sources.push({ name: source.name, from: source.from, to: source.to, categoryId, accountId });
  }
  return sources;
}

/** Adds `turn` at the end of the conversation (FR-104). */
export function addTurn(state: State, turn: ChatTurn): Changes {
  return { conversation: { put: [...state.conversation, turn] } };
}

/** Empties the conversation, which changes nothing when it is empty already (FR-104). */
export function clearConversation(state: State): Changes {
  return state.conversation.length > 0 ? { conversation: { put: [] } } : {};
}
