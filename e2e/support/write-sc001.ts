import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateBankCsv } from "./generate.ts";

// Writes the file of SC-001 to tmp/ for the manual check (quickstart.md, manual checks): one
// month of bank activity, about 300 rows from about 40 vendors, in the layout of the MyBank
// profile. Run it with `npm run fixtures:sc001`.

const folder = fileURLToPath(new URL("../../tmp/", import.meta.url));
const file = `${folder}sc001-bank-file.csv`;

mkdirSync(folder, { recursive: true });
writeFileSync(file, generateBankCsv({ rows: 300, vendors: 40 }), "latin1");
console.log(`Wrote ${file}`);
