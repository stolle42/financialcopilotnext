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
      "conversation",
      "pendingBatch",
      "profiles",
      "settings",
      "transactions",
    ]);
    // The key stays on this computer, so the file has no place for it (FR-126).
    expect(byKey(json.data)).toEqual(byKey({ ...state, apiKey: undefined } as unknown as State));
  });

  test("holds neither the key nor its last 4 characters, whatever the state holds (FR-126, R-31)", () => {
    const state: State = {
      ...everyEntityState(),
      settings: { ...everyEntityState().settings, aiFeatures: true, model: "gpt-5.6-luna" },
      apiKey: "sk-proj-abcdefa1b2",
    };

    const text = serializeBackup(state, EXPORTED_AT);

    expect(text).not.toContain("sk-proj");
    expect(text).not.toContain("a1b2");
    const json = JSON.parse(text) as { data: Json };
    expect(json.data).not.toHaveProperty("apiKey");
    expect(json.data.settings).toStrictEqual(state.settings);
  });

  test("writes the conversation's turns in order, and leaves the key out while it is empty (R-26)", () => {
    const state = everyEntityState();
    expect(fileJson().data.conversation).toEqual(state.conversation);

    const empty = JSON.parse(serializeBackup({ ...state, conversation: [] }, EXPORTED_AT)) as {
      data: Json;
    };
    expect(empty.data).not.toHaveProperty("conversation");
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

  test("keeps the mark of a category the AI suggested (FR-093)", () => {
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

  test("keeps AI features on (FR-095)", () => {
    const loaded = parseBackup(serializeBackup(everyEntityState(), EXPORTED_AT)) as State;
    expect(loaded.settings).toStrictEqual({ manualEntryAccountId: "giro", aiFeatures: true });
  });

  test("loads a file without AI features, as earlier versions saved it, with them off", () => {
    const json = fileJson();
    delete (json.data.settings as Json).aiFeatures;

    const loaded = parsed(json) as State;

    expect(loaded).not.toHaveProperty("code");
    expect(loaded.settings).toStrictEqual({ manualEntryAccountId: "giro" });
  });

  test("keeps the chosen model (FR-130)", () => {
    const state = everyEntityState();
    const chosen = { ...state, settings: { ...state.settings, model: "gpt-5.6-luna" } };
    const json = JSON.parse(serializeBackup(chosen, EXPORTED_AT)) as { data: Json };
    expect(json.data.settings).toHaveProperty("model", "gpt-5.6-luna");
    expect((parseBackup(serializeBackup(chosen, EXPORTED_AT)) as State).settings).toStrictEqual(
      chosen.settings,
    );
  });

  test("keeps a model the app no longer lists, which then uses the default (FR-130, R-32)", () => {
    const json = fileJson();
    (json.data.settings as Json).model = "gpt-4o";

    const loaded = parsed(json) as State;

    expect(loaded).not.toHaveProperty("code");
    expect(loaded.settings.model).toBe("gpt-4o");
  });

  test("loads a file without a model, as v1.5 saves it, with none chosen", () => {
    const json = fileJson();
    delete (json.data.settings as Json).model;

    const loaded = parsed(json) as State;

    expect(loaded).not.toHaveProperty("code");
    expect(loaded.settings).not.toHaveProperty("model");
  });

  test("keeps the conversation, every kind of turn, source and follow-up alike (FR-104, FR-111)", () => {
    const state = everyEntityState();
    const loaded = parseBackup(serializeBackup(state, EXPORTED_AT)) as State;
    expect(loaded.conversation).toStrictEqual(state.conversation);
  });

  test("loads a file without a conversation, as earlier versions saved it, with an empty one", () => {
    const json = fileJson();
    delete json.data.conversation;

    const loaded = parsed(json) as State;

    expect(loaded).not.toHaveProperty("code");
    expect(loaded.conversation).toEqual([]);
  });

  test("saves a loaded file without a conversation as the same file", () => {
    const json = fileJson();
    delete json.data.conversation;
    const text = JSON.stringify(json);

    expect(JSON.parse(serializeBackup(parseBackup(text) as State, EXPORTED_AT))).toEqual(json);
  });

  test("gives back a state without a key, which restoring takes from this computer (FR-126)", () => {
    const state: State = { ...everyEntityState(), apiKey: "sk-proj-abcdefa1b2" };
    expect((parseBackup(serializeBackup(state, EXPORTED_AT)) as State).apiKey).toBeNull();
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

  test("names settings whose AI features are not true (FR-095)", () => {
    const json = fileJson();
    (json.data.settings as Json).aiFeatures = false;

    expect(parsed(json)).toMatchObject({
      code: "backup-damaged",
      details: { record: "settings", field: "aiFeatures" },
    });
  });

  test.each<[string, unknown]>([
    ["empty", ""],
    ["not a string", 7],
  ])("names settings whose model is %s (FR-130)", (_, model) => {
    const json = fileJson();
    (json.data.settings as Json).model = model;

    expect(parsed(json)).toMatchObject({
      code: "backup-damaged",
      details: { record: "settings", field: "model" },
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

  test.each<[string, string, (turns: Json[]) => void]>([
    ["turn", "question", (turns) => delete turns[0]!.question],
    ["turn", "answer", (turns) => (turns[0]!.answer = 42)],
    ["turn", "stopped", (turns) => (turns[1]!.stopped = false)],
    ["turn", "outOfScope", (turns) => (turns[3]!.outOfScope = "yes")],
    ["turn", "sources", (turns) => delete turns[0]!.sources],
    ["turn", "followUps", (turns) => (turns[4]!.followUps = ["And last year?", 7])],
    ["source", "from", (turns) => delete (turns[0]!.sources as Json[])[0]!.from],
    ["source", "categoryId", (turns) => ((turns[0]!.sources as Json[])[0]!.categoryId = 7)],
  ])(
    "names the conversation's %s field %s when it is missing or of the wrong type (FR-104)",
    (record, field, damage) => {
      const json = fileJson();
      damage(json.data.conversation as Json[]);
      expect(parsed(json)).toMatchObject({ code: "backup-damaged", details: { record, field } });
    },
  );

  test("names a conversation that is not a list of turns", () => {
    const json = fileJson();
    json.data.conversation = { question: "Groceries?" };
    expect(parsed(json)).toMatchObject({
      code: "backup-damaged",
      details: { record: "data", field: "conversation" },
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
