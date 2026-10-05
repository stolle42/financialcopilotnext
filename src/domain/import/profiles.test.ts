import { describe, expect, test } from "vitest";
import { protectedCategory } from "../categories";
import { seedState } from "../seed";
import { applyValid, changesOf, idCounter, testContext } from "../testing";
import type { MappingProfile, State } from "../types";
import {
  deleteProfile,
  draftOfProfile,
  newProfileDraft,
  profileOf,
  saveProfile,
  sortProfiles,
  withAmountMode,
  withHeaderRow,
  type ProfileDraft,
} from "./profiles";

const myBank: ProfileDraft = {
  id: null,
  name: "MyBank",
  hasHeaderRow: true,
  dateColumn: "Date",
  descriptionColumn: "Purpose",
  counterpartyColumn: "Payee",
  amount: { mode: "signed", column: "Amount", invertSign: false },
  dateFormat: "DD.MM.YYYY",
  decimalSeparator: ",",
  encoding: "Windows-1252",
};

/** A fresh install with one saved profile, "MyBank", and a pending batch on Cash. */
function withProfileAndBatch(): { state: State; profile: MappingProfile } {
  const seeded = seedState(idCounter());
  const saved = applyValid(seeded, changesOf(saveProfile(seeded, myBank, testContext())));
  const state = applyValid(saved, {
    pendingBatch: {
      put: [
        {
          id: "batch",
          accountId: seeded.accounts[0]!.id,
          fileName: "mybank-2026-08.csv",
          createdAt: "2026-09-03T10:00:00.000Z",
          rows: [
            {
              rowNumber: 2,
              status: "parsed",
              date: "2026-08-01",
              amountCents: -4520,
              description: "Groceries",
              counterparty: "Shop",
              duplicate: false,
              included: true,
              assignment: {
                type: "category",
                categoryId: protectedCategory(seeded.categories, "expense", "uncategorised").id,
              },
            },
          ],
        },
      ],
    },
  });
  return { state, profile: state.profiles[0]! };
}

describe("saveProfile (FR-021)", () => {
  test("saves a new profile under a new id, with its name trimmed", () => {
    const state = seedState(idCounter());
    const changes = changesOf(saveProfile(state, { ...myBank, name: " MyBank " }, testContext()));
    const next = applyValid(state, changes);
    expect(next.profiles).toEqual([{ ...myBank, id: "new-1", name: "MyBank" }]);
  });

  test("edits a profile in place, keeping its id, and may change only the case of its name", () => {
    const { state, profile } = withProfileAndBatch();
    const draft: ProfileDraft = {
      ...myBank,
      id: profile.id,
      name: "MYBANK",
      decimalSeparator: ".",
    };
    const next = applyValid(state, changesOf(saveProfile(state, draft, testContext())));
    expect(next.profiles).toEqual([{ ...profile, name: "MYBANK", decimalSeparator: "." }]);
  });

  test("saves a profile without a header row, with columns by position", () => {
    const state = seedState(idCounter());
    const draft: ProfileDraft = {
      ...myBank,
      hasHeaderRow: false,
      dateColumn: 0,
      descriptionColumn: 2,
      counterpartyColumn: null,
      amount: { mode: "debit-credit", debitColumn: 3, creditColumn: 4 },
    };
    const next = applyValid(state, changesOf(saveProfile(state, draft, testContext())));
    expect(next.profiles[0]).toMatchObject({ hasHeaderRow: false, dateColumn: 0 });
  });

  test("refuses a name that is empty after trimming", () => {
    const state = seedState(idCounter());
    expect(saveProfile(state, { ...myBank, name: "  " }, testContext())).toEqual({
      code: "profile-name-empty",
    });
  });

  test("refuses a name another profile has, ignoring case and surrounding spaces", () => {
    const { state } = withProfileAndBatch();
    expect(saveProfile(state, { ...myBank, name: " mybank" }, testContext())).toEqual({
      code: "profile-name-taken",
    });
  });

  test("names every unassigned column among date, amount and description, in that order", () => {
    const state = seedState(idCounter());
    const draft: ProfileDraft = {
      ...myBank,
      dateColumn: null,
      descriptionColumn: null,
      amount: { mode: "signed", column: null, invertSign: false },
    };
    expect(saveProfile(state, draft, testContext())).toEqual({
      code: "profile-columns-incomplete",
      details: { roles: ["date", "amount", "description"] },
    });
  });

  test("counts the amount as unassigned until both debit and credit columns are", () => {
    const state = seedState(idCounter());
    const draft: ProfileDraft = {
      ...myBank,
      amount: { mode: "debit-credit", debitColumn: "Debit", creditColumn: null },
    };
    expect(saveProfile(state, draft, testContext())).toEqual({
      code: "profile-columns-incomplete",
      details: { roles: ["amount"] },
    });
  });

  test("lets the counterparty column stay unassigned, so review is ungrouped (FR-026)", () => {
    const state = seedState(idCounter());
    const draft: ProfileDraft = { ...myBank, counterpartyColumn: null };
    const next = applyValid(state, changesOf(saveProfile(state, draft, testContext())));
    expect(next.profiles[0]?.counterpartyColumn).toBeNull();
  });

  test("leaves a pending batch untouched", () => {
    const { state, profile } = withProfileAndBatch();
    const draft: ProfileDraft = { ...myBank, id: profile.id, name: "Renamed", dateColumn: "Day" };
    const changes = changesOf(saveProfile(state, draft, testContext()));
    expect(changes.pendingBatch).toBeUndefined();
    expect(applyValid(state, changes).pendingBatch).toBe(state.pendingBatch);
  });
});

describe("deleteProfile (FR-021)", () => {
  test("removes the profile and leaves a pending batch untouched", () => {
    const { state, profile } = withProfileAndBatch();
    const changes = deleteProfile(state, profile.id);
    const next = applyValid(state, changes);
    expect(next.profiles).toEqual([]);
    expect(changes.pendingBatch).toBeUndefined();
    expect(next.pendingBatch).toBe(state.pendingBatch);
  });

  test("throws for a profile that does not exist", () => {
    const state = seedState(idCounter());
    expect(() => deleteProfile(state, "missing")).toThrow();
  });
});

describe("the editor's draft (contracts/ui.md, profile editor)", () => {
  test("starts with a header row, one signed column, nothing assigned, and UTF-8", () => {
    expect(newProfileDraft()).toEqual({
      id: null,
      name: "",
      hasHeaderRow: true,
      dateColumn: null,
      descriptionColumn: null,
      counterpartyColumn: null,
      amount: { mode: "signed", column: null, invertSign: false },
      dateFormat: "DD.MM.YYYY",
      decimalSeparator: ",",
      encoding: "UTF-8",
    });
  });

  test("opens a saved profile for editing as it is", () => {
    const { profile } = withProfileAndBatch();
    expect(draftOfProfile(profile)).toEqual(profile);
  });

  test("resets every column when the header switch changes, keeping the other settings", () => {
    const { profile } = withProfileAndBatch();
    const draft = withHeaderRow(draftOfProfile(profile), false);
    expect(draft).toEqual({
      ...profile,
      hasHeaderRow: false,
      dateColumn: null,
      descriptionColumn: null,
      counterpartyColumn: null,
      amount: { mode: "signed", column: null, invertSign: false },
    });
    expect(withHeaderRow(draft, false)).toBe(draft);
  });

  test("resets the amount columns when the amount mode changes", () => {
    const draft = withAmountMode(myBank, "debit-credit");
    expect(draft.amount).toEqual({ mode: "debit-credit", debitColumn: null, creditColumn: null });
    expect(withAmountMode(draft, "signed").amount).toEqual({
      mode: "signed",
      column: null,
      invertSign: false,
    });
    expect(withAmountMode(myBank, "signed")).toBe(myBank);
  });

  test("becomes a profile, for the preview, once every required column is assigned", () => {
    expect(profileOf(myBank, "preview")).toEqual({ ...myBank, id: "preview" });
    expect(profileOf({ ...myBank, dateColumn: null }, "preview")).toEqual({
      code: "profile-columns-incomplete",
      details: { roles: ["date"] },
    });
  });
});

describe("sortProfiles (contracts/ui.md, list order)", () => {
  test("lists profiles by name, ignoring case", () => {
    const named = (name: string) => ({ ...myBank, id: name, name }) as MappingProfile;
    expect(
      sortProfiles([named("savings"), named("Giro"), named("broker")]).map((p) => p.name),
    ).toEqual(["broker", "Giro", "savings"]);
  });
});
