import type { Transaction } from "../../src/domain/types";
import type { BackupData } from "./backup";

// Data for the manual and performance checks (quickstart.md). It has no runtime import, so
// `write-sc001.ts` can run it with Node's built-in type stripping.

interface GeneratedPeriod {
  start: string;
  end: string;
}

/** Every `YYYY-MM-DD` date from `start` to `end`, both included. UTC, so no clock change shifts it. */
function daysBetween({ start, end }: GeneratedPeriod): string[] {
  const days: string[] = [];
  const last = Date.parse(`${end}T00:00:00Z`);
  for (let time = Date.parse(`${start}T00:00:00Z`); time <= last; time += 86_400_000) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * `base` with `count` more transactions dated across `period`, which a backup restores (FR-071).
 * Every 25th is an income in Salary, the rest are expenses spread over the ordinary expense
 * categories, so every breakdown has entries. `base` supplies the account, the categories and the
 * settings, so the result satisfies the data model's invariants. Amounts and days follow a fixed
 * pattern, so two runs give the same data.
 */
export function generateBackup(
  base: BackupData,
  { count, start, end }: { count: number } & GeneratedPeriod,
): BackupData {
  const days = daysBetween({ start, end });
  const account = base.accounts[0];
  const salary = base.categories.find((c) => c.side === "income" && c.name === "Salary");
  const spending = base.categories.filter((c) => c.side === "expense" && c.role === null);
  if (!account || !salary || spending.length === 0 || days.length === 0) {
    throw new Error("The base backup lacks an account or categories, or the period is empty");
  }

  const firstSeq = base.transactions.reduce((max, t) => Math.max(max, t.seq), 0) + 1;
  const generated: BackupData["transactions"] = Array.from({ length: count }, (_, index) => {
    const income = index % 25 === 24;
    return {
      id: `generated-${index + 1}`,
      seq: firstSeq + index,
      date: days[index % days.length]!,
      amountCents: 100 + ((index * 7919) % 25_000),
      accountId: account.id,
      description: `Generated transaction ${index + 1}`,
      kind: income ? "income" : "expense",
      categoryId: income ? salary.id : spending[index % spending.length]!.id,
    };
  });
  return { ...base, transactions: [...base.transactions, ...generated] };
}

/** Cents as the MyBank layout writes them: no thousands separator, a comma, two decimals. */
function commaAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)},${String(absolute % 100).padStart(2, "0")}`;
}

/**
 * A bank file in the layout of `mybank-2026-08.csv`: `;` between columns, `,` as the decimal
 * separator and `DD.MM.YYYY` dates, with a counterparty column. It holds `rows` purchases, spread
 * over `vendors` vendors and over the days of `month` (`YYYY-MM`). No two rows alike, so none is
 * flagged as a duplicate of another. The text is plain ASCII, so it reads the same in UTF-8 and in
 * Windows-1252.
 */
export function generateBankCsv({
  rows,
  vendors,
  month = "2026-08",
}: {
  rows: number;
  vendors: number;
  month?: string;
}): string {
  const [year, monthNumber] = month.split("-");
  const lines = ["Date;Payee;Purpose;Amount"];
  for (let index = 0; index < rows; index++) {
    const day = String((index % 28) + 1).padStart(2, "0");
    const vendor = `Vendor ${String((index % vendors) + 1).padStart(3, "0")}`;
    const cents = -(150 + ((index * 7919) % 9_000));
    lines.push(
      `${day}.${monthNumber}.${year};${vendor};Purchase ${index + 1};${commaAmount(cents)}`,
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

// Data of v1.8 (specs/018-review-queue, R-46): ledgers whose transactions carry the vendor they
// were confirmed from, and the next month's file with the choice each row must start with.

/** The fields v1.8 adds to a transaction (data-model.md, Transaction). */
interface VendorFields {
  vendor?: string;
  destinationVendor?: string;
}

const vendorName = (number: number) => `Vendor ${String(number).padStart(3, "0")}`;

/** `base` with one more account, which a backup restores; the id is fixed, so two runs agree. */
function withAccount(base: BackupData, account: BackupData["accounts"][number]): BackupData {
  return { ...base, accounts: [...base.accounts, account] };
}

export const CHECKING_ACCOUNT = {
  id: "generated-checking",
  name: "Checking",
  type: "checking",
  openingBalanceCents: 0,
} as const;

/** What a row of the generated file must start as in review (FR-146, FR-148). */
export type StartingChoice =
  | { kind: "category"; categoryName: string }
  | { kind: "transfer"; accountName: string }
  | { kind: "uncategorised" };

export interface ExpectedRow {
  /** The record number in the file, counting the header row as 1. */
  rowNumber: number;
  /** The Payee cell, empty for a row without vendor. */
  vendor: string;
  choice: StartingChoice;
}

export interface UsualChoicesData {
  /** `base` plus Checking and one confirmed month of vendors with their usual choices. */
  backup: BackupData;
  /** The next month, to import into Checking: 300 rows from about 40 vendors. */
  csv: string;
  /** The starting choice of each row of `csv`, in file order. */
  expected: ExpectedRow[];
  /** The account the file is imported into, and the account its usual transfers go to. */
  account: string;
  counterAccount: string;
}

/**
 * One confirmed month (2026-09) on Checking across 40 vendors, and the file of the next month
 * (2026-10), for SC-031. By vendor number:
 * - 1–20: all 4 transactions in one category, so that category is the usual choice;
 * - 21–26: all 3 transactions transfers to Cash, so that transfer is the usual choice;
 * - 27–33: half in one category and half in another, so there is no usual choice;
 * - 34–36: 3 of 4 in "Uncategorised", so there is no usual choice;
 * - 37–40: not in the ledger, so no usual choice.
 * Every 50th row is the employer's pay (usual category Salary), every 31st has no vendor, and
 * every 25th of the others is money in from a vendor that only ever took money (no usual choice).
 * `base` must hold the account Cash and the seed categories.
 */
export function generateUsualChoicesData(base: BackupData): UsualChoicesData {
  const cash = base.accounts.find((a) => a.name === "Cash");
  const spending = base.categories.filter((c) => c.side === "expense" && c.role === null);
  const salary = base.categories.find((c) => c.side === "income" && c.name === "Salary");
  const uncategorisedExpense = base.categories.find(
    (c) => c.side === "expense" && c.role === "uncategorised",
  );
  if (!cash || spending.length < 3 || !salary || !uncategorisedExpense) {
    throw new Error("The base backup lacks the account Cash or the seed categories");
  }
  const categoryOf = (vendorNumber: number) => spending[vendorNumber % spending.length]!;
  const otherCategoryOf = (vendorNumber: number) => spending[(vendorNumber + 1) % spending.length]!;

  const ledger: (Transaction & VendorFields)[] = [];
  let seq = base.transactions.reduce((max, t) => Math.max(max, t.seq), 0);
  const add = (
    day: number,
    cents: number,
    vendor: string,
    outcome:
      | { kind: "expense"; categoryId: string }
      | { kind: "income"; categoryId: string }
      | { kind: "transfer" },
  ) => {
    seq += 1;
    const common = {
      id: `usual-${seq}`,
      seq,
      date: `2026-09-${String(day).padStart(2, "0")}`,
      amountCents: cents,
      accountId: CHECKING_ACCOUNT.id,
      description: `Confirmed in September (${vendor})`,
      vendor,
    };
    ledger.push(
      outcome.kind === "transfer"
        ? { ...common, kind: "transfer", destinationAccountId: cash.id }
        : { ...common, kind: outcome.kind, categoryId: outcome.categoryId },
    );
  };

  for (let number = 1; number <= 36; number++) {
    const vendor = vendorName(number);
    // A day from 1 to 20, so no September row is within 4 days of the next month's rows.
    const day = (n: number) => ((number + n * 5) % 20) + 1;
    if (number <= 20) {
      for (let n = 0; n < 4; n++) {
        const categoryId = categoryOf(number).id;
        add(day(n), 1_000 + number * 13 + n, vendor, { kind: "expense", categoryId });
      }
    } else if (number <= 26) {
      for (let n = 0; n < 3; n++)
        add(day(n), 5_000 + number * 17 + n, vendor, { kind: "transfer" });
    } else if (number <= 33) {
      for (let n = 0; n < 4; n++) {
        const category = n < 2 ? categoryOf(number) : otherCategoryOf(number);
        add(day(n), 2_000 + number * 11 + n, vendor, { kind: "expense", categoryId: category.id });
      }
    } else {
      for (let n = 0; n < 4; n++) {
        const categoryId = n < 3 ? uncategorisedExpense.id : categoryOf(number).id;
        add(day(n), 3_000 + number * 7 + n, vendor, { kind: "expense", categoryId });
      }
    }
  }
  add(1, 245_000, "Employer GmbH", { kind: "income", categoryId: salary.id });

  const backup: BackupData = {
    ...withAccount(base, CHECKING_ACCOUNT),
    transactions: [...base.transactions, ...ledger],
  };

  const lines = ["Date;Payee;Purpose;Amount"];
  const expected: ExpectedRow[] = [];
  for (let index = 0; index < 300; index++) {
    const day = String((index % 28) + 1).padStart(2, "0");
    let vendor: string;
    let cents: number;
    let choice: StartingChoice = { kind: "uncategorised" };
    if (index % 50 === 49) {
      vendor = "Employer GmbH";
      cents = 245_000 + index;
      choice = { kind: "category", categoryName: salary.name };
    } else if (index % 31 === 30) {
      vendor = "";
      cents = -(150 + ((index * 7919) % 9_000));
    } else {
      const number = (index % 40) + 1;
      vendor = vendorName(number);
      cents = -(150 + ((index * 7919) % 9_000));
      if (index % 25 === 24) cents = -cents;
      else if (number <= 20) choice = { kind: "category", categoryName: categoryOf(number).name };
      else if (number <= 26) choice = { kind: "transfer", accountName: cash.name };
    }
    lines.push(`${day}.10.2026;${vendor};Purchase ${index + 1};${commaAmount(cents)}`);
    expected.push({ rowNumber: index + 2, vendor, choice });
  }
  return {
    backup,
    csv: `${lines.join("\r\n")}\r\n`,
    expected,
    account: CHECKING_ACCOUNT.name,
    counterAccount: cash.name,
  };
}

/**
 * `base` with `count` transactions that carry vendors, on Cash and Checking, dated across
 * `period`, for the performance check of SC-010: the import of a 5,000-row file then pairs
 * transfers and finds usual choices against a big ledger. The vendors are those of
 * `generateBankCsv({ vendors: 100 })`; each has one usual category. Every 20th is a transfer
 * from Checking to Cash with a vendor on each side, and every 25th an income.
 */
export function generateVendorBackup(
  base: BackupData,
  { count, start, end }: { count: number } & GeneratedPeriod,
): BackupData {
  const days = daysBetween({ start, end });
  const cash = base.accounts.find((a) => a.name === "Cash");
  const salary = base.categories.find((c) => c.side === "income" && c.name === "Salary");
  const spending = base.categories.filter((c) => c.side === "expense" && c.role === null);
  if (!cash || !salary || spending.length === 0 || days.length === 0) {
    throw new Error("The base backup lacks the account Cash or categories, or the period is empty");
  }
  const firstSeq = base.transactions.reduce((max, t) => Math.max(max, t.seq), 0) + 1;
  const generated: (Transaction & VendorFields)[] = Array.from({ length: count }, (_, index) => {
    const number = (index % 100) + 1;
    const common = {
      id: `generated-${index + 1}`,
      seq: firstSeq + index,
      date: days[index % days.length]!,
      amountCents: 100 + ((index * 7919) % 25_000),
      accountId: index % 2 === 0 ? cash.id : CHECKING_ACCOUNT.id,
      description: `Generated transaction ${index + 1}`,
      vendor: vendorName(number),
    };
    if (index % 20 === 19) {
      return {
        ...common,
        accountId: CHECKING_ACCOUNT.id,
        kind: "transfer",
        destinationAccountId: cash.id,
        destinationVendor: vendorName(((index + 1) % 100) + 1),
      };
    }
    return index % 25 === 24
      ? { ...common, kind: "income", categoryId: salary.id }
      : { ...common, kind: "expense", categoryId: spending[number % spending.length]!.id };
  });
  return {
    ...withAccount(base, CHECKING_ACCOUNT),
    transactions: [...base.transactions, ...generated],
  };
}
