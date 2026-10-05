import { describe, expect, test } from "vitest";
import { everyEntityState } from "@/domain/testing";
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

describe("backupFileName", () => {
  test("names the file after the local date of saving", () => {
    expect(backupFileName("2026-09-03")).toBe("financial-copilot-backup-2026-09-03.json");
  });
});

describe("serializeBackup (FR-070)", () => {
  test("writes the app, format version 1, the time of saving and the whole state", () => {
    const state = everyEntityState();

    const json = JSON.parse(serializeBackup(state, EXPORTED_AT)) as BackupJson;

    expect(json).toEqual({
      app: "financial-copilot",
      formatVersion: 1,
      exportedAt: EXPORTED_AT,
      data: {
        accounts: state.accounts,
        categories: state.categories,
        transactions: state.transactions,
        budgets: state.budgets,
        profiles: state.profiles,
        pendingBatch: state.pendingBatch,
        settings: state.settings,
      },
    });
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
  test("gives back exactly the state that was saved", () => {
    const state = everyEntityState();
    expect(parseBackup(serializeBackup(state, EXPORTED_AT))).toEqual(state);
  });

  test("gives back a state without a pending batch", () => {
    const state = { ...everyEntityState(), pendingBatch: null };
    expect(parseBackup(serializeBackup(state, EXPORTED_AT))).toEqual(state);
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
