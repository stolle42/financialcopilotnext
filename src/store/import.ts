import { canStartImport, createBatch } from "@/domain/import/batch";
import {
  confirmBatch as decideConfirm,
  discardBatch as decideDiscard,
} from "@/domain/import/confirm";
import type { VendorGroup } from "@/domain/import/groups";
import {
  deleteProfile as decideDeleteProfile,
  saveProfile as decideSaveProfile,
  type ProfileDraft,
} from "@/domain/import/profiles";
import {
  assignGroup as decideAssignGroup,
  assignRow as decideAssignRow,
  includeDuplicate as decideIncludeDuplicate,
  type AssignmentChoice,
} from "@/domain/import/review";
import type { MappingProfile } from "@/domain/types";
import { decodeFile, tokenise } from "@/files/csv";
import type { Store } from "./store";

// The import actions. Review edits are written at once, so review progress survives closing the
// app (FR-022, R-05).

export function saveProfile(store: Store, draft: ProfileDraft) {
  return store.run((state, context) => decideSaveProfile(state, draft, context));
}

export function deleteProfile(store: Store, id: string) {
  // Deleting never refuses, so only the store's own save-failed can come back.
  return store.run<never>((state) => decideDeleteProfile(state, id));
}

export interface ImportInput {
  accountId: string | null;
  profile: MappingProfile;
  fileName: string;
  bytes: Uint8Array;
}

/** Turns a bank file into the pending batch (contracts/csv-import.md, pipeline). */
export async function importFile(store: Store, input: ImportInput) {
  // A pending batch refuses the import before the file is even decoded (FR-022).
  const pending = canStartImport(store.getState());
  if (pending) return pending;
  const text = decodeFile(input.bytes, input.profile.encoding);
  if (typeof text !== "string") return text;
  const records = tokenise(text);
  const createdAt = new Date().toISOString();
  return store.run(
    (state, context) =>
      createBatch(
        state,
        {
          accountId: input.accountId,
          profile: input.profile,
          fileName: input.fileName,
          createdAt,
          records,
        },
        context,
      ),
    { requireNoPendingBatch: true },
  );
}

export function assignRow(store: Store, rowNumber: number, choice: AssignmentChoice) {
  return store.run((state) => decideAssignRow(state, rowNumber, choice));
}

export function assignGroup(
  store: Store,
  group: Pick<VendorGroup, "key" | "side">,
  choice: AssignmentChoice,
) {
  return store.run((state) => decideAssignGroup(state, group, choice));
}

export function includeDuplicate(store: Store, rowNumber: number, included: boolean) {
  return store.run((state) => decideIncludeDuplicate(state, rowNumber, included));
}

export function confirmBatch(store: Store) {
  return store.run<never>((state, context) => decideConfirm(state, context));
}

export function discardBatch(store: Store) {
  return store.run<never>((state) => decideDiscard(state));
}
