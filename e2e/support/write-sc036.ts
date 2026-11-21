import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { seedState } from "../../src/domain/seed.ts";
import { generateUsualChoicesData } from "./generate.ts";

// Writes the data of SC-036 to tmp/ for the manual check (quickstart.md, manual checks): a backup
// with one confirmed month on Checking and a saved bank CSV format, and the next month's file,
// about 300 rows from about 40 vendors. Restore the backup, import the file into Checking and
// review it. Run it with `npm run fixtures:sc036`.

let counter = 0;
const base = seedState(() => `seed-${(counter += 1)}`);
const { backup, csv } = generateUsualChoicesData({
  accounts: [...base.accounts],
  categories: [...base.categories],
  transactions: [...base.transactions],
  budgets: [...base.budgets],
  profiles: [
    {
      id: "sc036-profile",
      name: "MyBank",
      hasHeaderRow: true,
      dateColumn: "Date",
      descriptionColumn: "Purpose",
      counterpartyColumn: "Payee",
      amount: { mode: "signed", column: "Amount", invertSign: false },
      dateFormat: "DD.MM.YYYY",
      decimalSeparator: ",",
      encoding: "UTF-8",
    },
  ],
  pendingBatch: null,
  settings: base.settings,
});

const folder = fileURLToPath(new URL("../../tmp/", import.meta.url));
mkdirSync(folder, { recursive: true });
const file = {
  app: "financial-copilot",
  formatVersion: 1,
  exportedAt: "2026-10-01T09:00:00.000Z",
  data: backup,
};
writeFileSync(`${folder}sc036-backup.json`, JSON.stringify(file));
writeFileSync(`${folder}sc036-next-month.csv`, csv, "utf-8");
console.log(`Wrote ${folder}sc036-backup.json and ${folder}sc036-next-month.csv`);
