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
