import { describe, expect, test } from "vitest";
import { everyEntityState } from "@/domain/testing";
import type { State } from "@/domain/types";
import { backupFileName, parseBackup, serializeBackup } from "./backup";

// contracts/backup-file.md: the file, saving (FR-070) and loading steps 1–3 (FR-072); R-13.

const EXPORTED_AT = "2026-09-03T10:15:00.000Z";

type Json = Record<string, unknown>;

interface BackupJson {
  app?: unknown;
  formatVersion?: unknown;
  exportedAt?: unknown;
  data?: Json | null;
}

/** The file of the full fixture state, parsed, for a test to break in one place. */
function fileJson(): BackupJson & { data: Json } {
  return JSON.parse(serializeBackup(everyEntityState(), EXPORTED_AT)) as BackupJson & {
    data: Json;
  };
}

/** The records a file holds under `key` of its data. */
const records = (json: { data: Json }, key: string) => json.data[key] as Json[];

const parsed = (json: unknown) => parseBackup(JSON.stringify(json));

const keyOf = (record: object) =>
  String("id" in record ? record.id : (record as { categoryId: string }).categoryId);

function sortedByKey<Item extends object>(items: readonly Item[]): Item[] {
  return [...items].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
}

/** `state` with each list in key order. Memory keeps creation order, storage keeps key order. */
function byKey(state: State): State {
  return {
    ...state,
    accounts: sortedByKey(state.accounts),
    categories: sortedByKey(state.categories),
    transactions: sortedByKey(state.transactions),
    budgets: sortedByKey(state.budgets),
    profiles: sortedByKey(state.profiles),
  };
}

/** `state` with each list in reverse, as memory may hold records after a few actions. */
function reversed(state: State): State {
  return {
    ...state,
    accounts: [...state.accounts].reverse(),
    categories: [...state.categories].reverse(),
    transactions: [...state.transactions].reverse(),
    budgets: [...state.budgets].reverse(),
    profiles: [...state.profiles].reverse(),
  };
}

describe("backupFileName", () => {
  test("names the file after the local date of saving", () => {
    expect(backupFileName("2026-09-03")).toBe("financial-copilot-backup-2026-09-03.json");
  });
});

describe("serializeBackup (FR-070)", () => {
  test("writes the app, format version 1, the time of saving and the whole state", () => {
    const state = everyEntityState();

    const json = JSON.parse(serializeBackup(state, EXPORTED_AT)) as BackupJson & { data: State };

    expect(json).toMatchObject({
      app: "financial-copilot",
      formatVersion: 1,
      exportedAt: EXPORTED_AT,
    });
    expect(Object.keys(json).sort()).toEqual(["app", "data", "exportedAt", "formatVersion"]);
    expect(Object.keys(json.data).sort()).toEqual([
      "accounts",
      "budgets",
      "categories",
      "pendingBatch",
      "profiles",
      "settings",
      "transactions",
    ]);
    expect(byKey(json.data)).toEqual(byKey(state));
  });

  test("lists the records in one order whatever their order in memory, so a round trip is exact", () => {
    const state = everyEntityState();
    expect(JSON.parse(serializeBackup(reversed(state), EXPORTED_AT))).toEqual(
      JSON.parse(serializeBackup(state, EXPORTED_AT)),
    );
  });

  test("keeps the pending rows in file order", () => {
    const json = fileJson();
    const rows = (json.data.pendingBatch as { rows: { rowNumber: number }[] }).rows;
    expect(rows.map((row) => row.rowNumber)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  test("writes amounts as integer cents and dates as stored, never in a locale format", () => {
    const [first] = records(fileJson(), "transactions");
    expect(first).toMatchObject({ date: "2026-08-01", amountCents: 4520 });
  });

  test("writes null when no batch is pending", () => {
    const state = { ...everyEntityState(), pendingBatch: null };
    const json = JSON.parse(serializeBackup(state, EXPORTED_AT)) as BackupJson & { data: Json };
    expect(json.data.pendingBatch).toBeNull();
  });
});

describe("parseBackup: a round trip (SC-014)", () => {
  test("gives back exactly the records that were saved", () => {
    const state = everyEntityState();
    expect(byKey(parseBackup(serializeBackup(state, EXPORTED_AT)) as State)).toEqual(byKey(state));
  });

  test("gives back a state without a pending batch", () => {
    const state = { ...everyEntityState(), pendingBatch: null };
    expect(byKey(parseBackup(serializeBackup(state, EXPORTED_AT)) as State)).toEqual(byKey(state));
  });

  test("keeps the mark of a category Claude suggested (FR-093)", () => {
    const loaded = parseBackup(serializeBackup(everyEntityState(), EXPORTED_AT)) as State;
    const row = loaded.pendingBatch?.rows.find((r) => r.rowNumber === 2);
    expect(row).toMatchObject({
      assignment: { type: "category", suggested: true },
    });
  });

  test("loads a file without marks, as earlier versions saved it (backup-file.md, compatibility)", () => {
    const json = fileJson();
    const rows = (json.data.pendingBatch as { rows: { assignment?: Json }[] }).rows;
    for (const row of rows) delete row.assignment?.suggested;

    const loaded = parsed(json) as State;

    expect(loaded).not.toHaveProperty("code");
    const row = loaded.pendingBatch?.rows.find((r) => r.rowNumber === 2);
    expect(row).toHaveProperty("assignment.type", "category");
    expect(row).not.toHaveProperty("assignment.suggested");
  });

  test("keeps Don't warn me again (FR-095)", () => {
    const loaded = parseBackup(serializeBackup(everyEntityState(), EXPORTED_AT)) as State;
    expect(loaded.settings).toStrictEqual({
      manualEntryAccountId: "giro",
      skipSharingWarning: true,
    });
  });

  test("loads a file without the choice, as earlier versions saved it, with the warning back", () => {
    const json = fileJson();
    delete (json.data.settings as Json).skipSharingWarning;

    const loaded = parsed(json) as State;

    expect(loaded).not.toHaveProperty("code");
    expect(loaded.settings).toStrictEqual({ manualEntryAccountId: "giro" });
  });

  test("saves the loaded state as the same file", () => {
    const text = serializeBackup(everyEntityState(), EXPORTED_AT);
    expect(JSON.parse(serializeBackup(parseBackup(text) as State, EXPORTED_AT))).toEqual(
      JSON.parse(text),
    );
  });
});

describe("parseBackup: step 1, a Financial Copilot file", () => {
  test.each([
    ["", "an empty file"],
    ["Date;Amount\n01.08.2026;-45,20", "a CSV file"],
    ['{"app": "financial-copilot"', "cut-off JSON"],
    ["[]", "a JSON list"],
    ["null", "JSON null"],
    ["42", "a JSON number"],
    ["{}", "an object without app"],
  ])("refuses %j, %s, as not a backup", (text) => {
    expect(parseBackup(text)).toEqual({ code: "backup-not-a-backup" });
  });

  test("refuses another app's file, even with a known format version", () => {
    expect(parsed({ ...fileJson(), app: "other-app" })).toEqual({ code: "backup-not-a-backup" });
  });

  test("checks the app before the format version", () => {
    expect(parsed({ ...fileJson(), app: "other-app", formatVersion: 2 })).toEqual({
      code: "backup-not-a-backup",
    });
  });
});

describe("parseBackup: step 2, format version 1", () => {
  test("refuses a newer version, whatever its data looks like", () => {
    expect(parsed({ ...fileJson(), formatVersion: 2 })).toEqual({ code: "backup-newer-version" });
    expect(parsed({ app: "financial-copilot", formatVersion: 3, data: { shape: "new" } })).toEqual({
      code: "backup-newer-version",
    });
  });

  test.each([0, "1", 1.5, null])("refuses the version %j as damaged", (formatVersion) => {
    expect(parsed({ ...fileJson(), formatVersion })).toMatchObject({ code: "backup-damaged" });
  });

  test("refuses a missing version as damaged", () => {
    const json = fileJson();
    delete json.formatVersion;
    expect(parsed(json)).toMatchObject({ code: "backup-damaged" });
  });
});

describe("parseBackup: step 3, every part with the right shape", () => {
  test.each([undefined, null, [], "data"])("refuses the data %j as damaged", (data) => {
    expect(parsed({ ...fileJson(), data })).toMatchObject({ code: "backup-damaged" });
  });

  test.each([
    "accounts",
    "categories",
    "transactions",
    "budgets",
    "profiles",
    "pendingBatch",
    "settings",
  ])("names the missing part %s", (key) => {
    const json = fileJson();
    delete json.data[key];
    expect(parsed(json)).toMatchObject({
      code: "backup-damaged",
      details: { record: "data", field: key },
    });
  });

  test("names a transaction without a date", () => {
    const json = fileJson();
    delete records(json, "transactions")[1]!.date;
    expect(parsed(json)).toMatchObject({
      code: "backup-damaged",
      details: { record: "transaction", field: "date" },
    });
  });

  test.each<[string, string, (json: { data: Json }) => void]>([
    [
      "transaction",
      "amountCents",
      (json) => (records(json, "transactions")[0]!.amountCents = "45.20"),
    ],
    ["transaction", "kind", (json) => (records(json, "transactions")[0]!.kind = "refund")],
    ["account", "type", (json) => (records(json, "accounts")[0]!.type = "wallet")],
    [
      "account",
      "openingBalanceCents",
      (json) => delete records(json, "accounts")[0]!.openingBalanceCents,
    ],
    ["category", "color", (json) => (records(json, "categories")[0]!.color = 42)],
    ["budget", "limitCents", (json) => delete records(json, "budgets")[0]!.limitCents],
    ["profile", "hasHeaderRow", (json) => (records(json, "profiles")[0]!.hasHeaderRow = "yes")],
    [
      "pendingRow",
      "status",
      (json) => ((json.data.pendingBatch as { rows: Json[] }).rows[0]!.status = "maybe"),
    ],
    ["pendingBatch", "rows", (json) => delete (json.data.pendingBatch as Json).rows],
    [
      "settings",
      "manualEntryAccountId",
      (json) => delete (json.data.settings as Json).manualEntryAccountId,
    ],
  ])("names the %s field %s when it is missing or of the wrong type", (record, field, damage) => {
    const json = fileJson();
    damage(json);
    expect(parsed(json)).toMatchObject({ code: "backup-damaged", details: { record, field } });
  });

  test("names settings whose choice to skip the warning is not true (FR-095)", () => {
    const json = fileJson();
    (json.data.settings as Json).skipSharingWarning = false;

    expect(parsed(json)).toMatchObject({
      code: "backup-damaged",
      details: { record: "settings", field: "skipSharingWarning" },
    });
  });

  test("names a pending row's assignment whose mark is not true (FR-093)", () => {
    const json = fileJson();
    const rows = (json.data.pendingBatch as { rows: { assignment: Json }[] }).rows;
    rows[0]!.assignment.suggested = false;

    expect(parsed(json)).toMatchObject({
      code: "backup-damaged",
      details: { record: "pendingRow", field: "assignment" },
    });
  });

  test("leaves the rules between records to the invariant check of step 4", () => {
    const json = fileJson();
    records(json, "transactions")[0]!.accountId = "not-in-the-backup";

    const result = parsed(json);

    expect(result).not.toHaveProperty("code");
    expect(result).toMatchObject({
      transactions: expect.arrayContaining([
        expect.objectContaining({ accountId: "not-in-the-backup" }),
      ]),
    });
  });
});
