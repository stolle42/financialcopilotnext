import { nameKey } from "../names";
import type {
  AmountColumns,
  MappingProfile,
  ParsedRow,
  Refusal,
  RowFailureCode,
  UnparsableRow,
} from "../types";
import { parseBankDate } from "./dates";
import { readAmount } from "./direction";

/** A parsed record, before the batch adds its review fields (data-model.md, pending row). */
export type ParsedRecord = Pick<
  ParsedRow,
  "status" | "rowNumber" | "date" | "amountCents" | "description" | "counterparty"
>;

export type RecordRow = ParsedRecord | UnparsableRow;

/** Why a file gives no batch at all (contracts/csv-import.md, outcomes). */
export type LayoutRefusalCode =
  "import-missing-columns" | "import-duplicate-header" | "import-no-transactions";

/** Where each mapped column sits in a record. */
interface Positions {
  date: number;
  description: number;
  counterparty: number | null;
  amount: AmountColumns<number>;
}

const isBlank = (record: readonly string[]) => record.every((cell) => cell.trim() === "");

/** The mapped header texts, in the order a message names them. */
function mappedHeaders(profile: MappingProfile & { hasHeaderRow: true }): string[] {
  const amount =
    profile.amount.mode === "signed"
      ? [profile.amount.column]
      : [profile.amount.debitColumn, profile.amount.creditColumn];
  const counterparty = profile.counterpartyColumn === null ? [] : [profile.counterpartyColumn];
  return [profile.dateColumn, ...amount, profile.descriptionColumn, ...counterparty];
}

/** Looks every mapped column up in the header row by name key (pipeline step 4). */
function findColumns(
  profile: MappingProfile & { hasHeaderRow: true },
  header: readonly string[],
): Positions | Refusal<LayoutRefusalCode> {
  const keys = header.map(nameKey);
  const indexesOf = (column: string) =>
    keys.flatMap((key, index) => (key === nameKey(column) ? [index] : []));

  const missing = mappedHeaders(profile).filter((column) => indexesOf(column).length === 0);
  if (missing.length > 0) return { code: "import-missing-columns", details: { columns: missing } };
  const repeated = mappedHeaders(profile).find((column) => indexesOf(column).length > 1);
  if (repeated !== undefined) {
    return { code: "import-duplicate-header", details: { column: repeated } };
  }

  const at = (column: string) => indexesOf(column)[0]!;
  const amount = profile.amount;
  return {
    date: at(profile.dateColumn),
    description: at(profile.descriptionColumn),
    counterparty: profile.counterpartyColumn === null ? null : at(profile.counterpartyColumn),
    amount:
      amount.mode === "signed"
        ? { ...amount, column: at(amount.column) }
        : { ...amount, debitColumn: at(amount.debitColumn), creditColumn: at(amount.creditColumn) },
  };
}

function parseRecord(
  cells: string[],
  rowNumber: number,
  positions: Positions,
  profile: MappingProfile,
): RecordRow {
  const cell = (index: number) => (cells[index] ?? "").trim();
  const unparsable = (failure: Refusal<RowFailureCode>): UnparsableRow => ({
    status: "unparsable",
    rowNumber,
    cells,
    failure,
  });

  // The order of these checks is the order of contracts/csv-import.md, unparsable rows.
  const dateText = cell(positions.date);
  if (dateText === "") return unparsable({ code: "date-missing" });
  const date = parseBankDate(dateText, profile.dateFormat);
  if (date === null) {
    return unparsable({
      code: "date-unreadable",
      details: { cell: dateText, format: profile.dateFormat },
    });
  }
  const amountCents = readAmount(cells, positions.amount, profile.decimalSeparator);
  if (typeof amountCents !== "number") return unparsable(amountCents);

  const counterparty = positions.counterparty === null ? "" : cell(positions.counterparty);
  return {
    status: "parsed",
    rowNumber,
    date,
    amountCents,
    description: cell(positions.description),
    counterparty: counterparty === "" ? null : counterparty,
  };
}

/**
 * Turns a file's records into rows, or refuses the file's layout (contracts/csv-import.md,
 * pipeline steps 3–6). The import and the profile preview both use it, so the preview shows what
 * the import will produce (FR-021). A blank record becomes no row but keeps its row number.
 */
export function parseRecords(
  records: readonly string[][],
  profile: MappingProfile,
): RecordRow[] | Refusal<LayoutRefusalCode> {
  // An empty file holds no transactions, which says more than every column missing would.
  if (records.every(isBlank)) return { code: "import-no-transactions" };

  let positions: Positions;
  if (profile.hasHeaderRow) {
    const found = findColumns(profile, records[0] ?? []);
    if ("code" in found) return found;
    positions = found;
  } else {
    positions = {
      date: profile.dateColumn,
      description: profile.descriptionColumn,
      counterparty: profile.counterpartyColumn,
      amount: profile.amount,
    };
  }

  const firstData = profile.hasHeaderRow ? 1 : 0;
  const rows = records.flatMap((cells, index) =>
    index < firstData || isBlank(cells) ? [] : [parseRecord(cells, index + 1, positions, profile)],
  );
  return rows.length === 0 ? { code: "import-no-transactions" } : rows;
}
