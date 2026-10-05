import { checkInvariants } from "@/domain/invariants";
import type { Refusal, State } from "@/domain/types";
import {
  backupFileName,
  parseBackup,
  serializeBackup,
  type BackupRefusalCode,
} from "@/files/backup";
import { todayLocal } from "./clock";
import type { Store, StoreRefusalCode } from "./store";

/** The backup file for the current state: its text and name. Nothing is written (FR-070). */
export function createBackup(store: Store): { text: string; fileName: string } {
  return {
    text: serializeBackup(store.getState(), new Date().toISOString()),
    fileName: backupFileName(todayLocal()),
  };
}

/**
 * Loading steps 1–4 (backup-file.md): the file's shape, then the rules between its records. Gives
 * the state to restore, or the refusal. Nothing is written, so a refused file changes nothing
 * (FR-072).
 */
export function prepareRestore(text: string): State | Refusal<BackupRefusalCode> {
  const parsed = parseBackup(text);
  if ("code" in parsed) return parsed;
  const broken = checkInvariants(parsed);
  if (broken) {
    return { code: "backup-damaged", details: { rule: broken.code, ...broken.details } };
  }
  return parsed;
}

/** Replaces all data with a state `prepareRestore` accepted, in storage and then in memory. */
export function restore(store: Store, state: State): Promise<Refusal<StoreRefusalCode> | null> {
  return store.replaceAll(state);
}
