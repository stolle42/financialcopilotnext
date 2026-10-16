import {
  DATE_FORMATS,
  ENCODINGS,
  ROW_FAILURE_CODES,
  type Refusal,
  type State,
} from "@/domain/types";
import { z } from "./zod";

// The backup file, format version 1 (contracts/backup-file.md, R-13). The schemas check the shape
// of every part; the rules between records are the domain's invariants (loading step 4).

const APP = "financial-copilot";
const FORMAT_VERSION = 1;

export type BackupRefusalCode = "backup-not-a-backup" | "backup-newer-version" | "backup-damaged";

/** The file name for a backup saved on the local date `today` (`YYYY-MM-DD`). */
export function backupFileName(today: string): string {
  return `financial-copilot-backup-${today}.json`;
}

function inKeyOrder<Item>(items: readonly Item[], keyOf: (item: Item) => string): Item[] {
  return [...items].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
}

/**
 * The file's text for `state`. Memory keeps records in creation order and storage in key order, so
 * every list is written in key order: saving a restored state then gives the data that was loaded
 * (SC-014). The pending rows keep their file order.
 */
export function serializeBackup(state: State, exportedAt: string): string {
  return JSON.stringify({
    app: APP,
    formatVersion: FORMAT_VERSION,
    exportedAt,
    data: {
      accounts: inKeyOrder(state.accounts, (a) => a.id),
      categories: inKeyOrder(state.categories, (c) => c.id),
      transactions: inKeyOrder(state.transactions, (t) => t.id),
      budgets: inKeyOrder(state.budgets, (b) => b.categoryId),
      profiles: inKeyOrder(state.profiles, (p) => p.id),
      pendingBatch: state.pendingBatch,
      settings: state.settings,
      // Only while it holds a turn, so a file of an earlier version gives the same file back (R-26).
      ...(state.conversation.length > 0 ? { conversation: state.conversation } : {}),
    },
  });
}

const accountSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["checking", "savings", "credit-card", "cash", "other"]),
  openingBalanceCents: z.number(),
});

const categorySchema = z.object({
  id: z.string(),
  side: z.enum(["expense", "income"]),
  name: z.string(),
  color: z.string(),
  role: z.enum(["uncategorised", "unaccounted"]).nullable(),
});

const transactionFields = {
  id: z.string(),
  seq: z.number(),
  date: z.string(),
  amountCents: z.number(),
  accountId: z.string(),
  description: z.string(),
};

const transactionSchema = z.discriminatedUnion("kind", [
  z.object({ ...transactionFields, kind: z.literal("expense"), categoryId: z.string() }),
  z.object({ ...transactionFields, kind: z.literal("income"), categoryId: z.string() }),
  z.object({
    ...transactionFields,
    kind: z.literal("transfer"),
    destinationAccountId: z.string(),
  }),
]);

const budgetSchema = z.object({ categoryId: z.string(), limitCents: z.number() });

/** A mapping profile whose columns are `column`: header texts, or positions without a header. */
function profileSchema<Header extends boolean, Column extends z.ZodType<string | number>>(
  hasHeaderRow: Header,
  column: Column,
) {
  return z.object({
    id: z.string(),
    name: z.string(),
    hasHeaderRow: z.literal(hasHeaderRow),
    dateColumn: column,
    descriptionColumn: column,
    counterpartyColumn: column.nullable(),
    amount: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("signed"), column, invertSign: z.boolean() }),
      z.object({ mode: z.literal("debit-credit"), debitColumn: column, creditColumn: column }),
    ]),
    dateFormat: z.enum(DATE_FORMATS),
    decimalSeparator: z.enum([",", "."]),
    encoding: z.enum(ENCODINGS),
  });
}

const profileSchemas = z.discriminatedUnion("hasHeaderRow", [
  profileSchema(true, z.string()),
  profileSchema(false, z.number()),
]);

const detailsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.array(z.string())]));

const pendingRowSchema = z.discriminatedUnion("status", [
  z.object({
    rowNumber: z.number(),
    status: z.literal("parsed"),
    date: z.string(),
    amountCents: z.number(),
    description: z.string(),
    counterparty: z.string().nullable(),
    duplicate: z.boolean(),
    included: z.boolean(),
    assignment: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("category"),
        categoryId: z.string(),
        suggested: z.literal(true).optional(),
      }),
      z.object({ type: z.literal("transfer"), counterAccountId: z.string() }),
    ]),
  }),
  z.object({
    rowNumber: z.number(),
    status: z.literal("unparsable"),
    cells: z.array(z.string()),
    failure: z.object({ code: z.enum(ROW_FAILURE_CODES), details: detailsSchema.optional() }),
  }),
]);

const pendingBatchSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  fileName: z.string(),
  createdAt: z.string(),
  rows: z.array(pendingRowSchema),
});

const sourceSchema = z.object({
  name: z.string(),
  from: z.string(),
  to: z.string(),
  categoryId: z.string().nullable(),
  accountId: z.string().nullable(),
});

const turnSchema = z.object({
  question: z.string(),
  answer: z.string(),
  outOfScope: z.literal(true).optional(),
  stopped: z.literal(true).optional(),
  sources: z.array(sourceSchema),
});

const dataSchema: z.ZodType<State> = z.object({
  accounts: z.array(accountSchema),
  categories: z.array(categorySchema),
  transactions: z.array(transactionSchema),
  budgets: z.array(budgetSchema),
  profiles: z.array(profileSchemas),
  pendingBatch: pendingBatchSchema.nullable(),
  settings: z.object({
    manualEntryAccountId: z.string(),
    aiFeatures: z.literal(true).optional(),
  }),
  // A file of an earlier version has none, and restores an empty conversation (R-26).
  conversation: z.array(turnSchema).default([]),
});

// What the UI calls the records of each part of `data`.
const recordOfPart: Record<string, string> = {
  accounts: "account",
  categories: "category",
  transactions: "transaction",
  budgets: "budget",
  profiles: "profile",
  pendingBatch: "pendingBatch",
  settings: "settings",
};

function damaged(record: string, field?: string): Refusal<"backup-damaged"> {
  return { code: "backup-damaged", details: field === undefined ? { record } : { record, field } };
}

/**
 * Names the record and the field at fault, from the path of the first thing zod objected to: a
 * part of `data` (`transactions`), the index of a record in it (`1`), then the field (`date`).
 */
function damageAt(path: readonly PropertyKey[]): Refusal<"backup-damaged"> {
  const [part, second, third, fourth, fifth] = path.map(String);
  // `data` itself is missing or not an object.
  if (part === undefined) return damaged("backup", "data");
  // A part of `data` that is missing, or not a list.
  if (second === undefined) return damaged("data", part);
  if (part === "settings") return damaged("settings", second);
  if (part === "conversation") {
    // A turn's sources are records of their own: (conversation, 0, sources, 1, from).
    return third === "sources" && fourth !== undefined
      ? damaged("source", fifth)
      : damaged("turn", third);
  }
  if (part === "pendingBatch") {
    // A batch's rows are records of their own: (pendingBatch, rows, 0, status).
    return second === "rows" && third !== undefined
      ? damaged("pendingRow", fourth)
      : damaged("pendingBatch", second);
  }
  return damaged(recordOfPart[part] ?? "data", third);
}

/**
 * Loading steps 1–3 (backup-file.md): the text is a Financial Copilot file of format version 1,
 * and every part has the right shape. Gives the state it holds, or the first refusal. The rules
 * between its records are checked next, by the caller (step 4).
 */
export function parseBackup(text: string): State | Refusal<BackupRefusalCode> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { code: "backup-not-a-backup" };
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { code: "backup-not-a-backup" };
  }
  const file = json as Record<string, unknown>;
  if (file.app !== APP) return { code: "backup-not-a-backup" };

  const version = file.formatVersion;
  if (typeof version === "number" && Number.isInteger(version) && version > FORMAT_VERSION) {
    return { code: "backup-newer-version" };
  }
  if (version !== FORMAT_VERSION) return damaged("backup", "formatVersion");

  const parsed = dataSchema.safeParse(file.data);
  if (!parsed.success) return damageAt(parsed.error.issues[0]!.path);
  return parsed.data;
}
