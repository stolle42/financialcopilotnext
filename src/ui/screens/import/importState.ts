import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { MappingProfile, Refusal } from "@/domain/types";
import { importFile } from "@/store/import";
import type { Store } from "@/store/store";
import { navigate } from "@/ui/app/router";
import type { MessageCode } from "@/ui/messages";

/** The profile select's choice that opens the editor for a new profile. */
export const NEW_PROFILE = "new-profile";

export interface ChosenFile {
  name: string;
  bytes: Uint8Array;
}

/**
 * What the Import screen holds while the user defines a new profile, so the editor can preview
 * the file and continue its import (contracts/ui.md, import). It lives in memory only.
 */
export interface ImportState {
  accountId: string | null;
  file: ChosenFile | null;
  /** A profile id, `NEW_PROFILE`, or `null` before the user has chosen. */
  profileId: string | null;
  refusal: Refusal<MessageCode> | null;
}

export const emptyImport: ImportState = {
  accountId: null,
  file: null,
  profileId: null,
  refusal: null,
};

export const ImportStateContext = createContext<{
  importState: ImportState;
  setImportState: Dispatch<SetStateAction<ImportState>>;
} | null>(null);

export function useImportState() {
  const value = useContext(ImportStateContext);
  if (!value) throw new Error("ImportStateContext is used outside the shell");
  return value;
}

/**
 * Imports the chosen file with `profile`. Success opens review with the choices cleared; a
 * refusal returns to Import, which shows it.
 */
export async function importChosenFile(
  store: Store,
  state: ImportState,
  profile: MappingProfile,
  setImportState: (state: ImportState) => void,
): Promise<void> {
  if (!state.file) throw new Error("No file is chosen");
  const refusal = await importFile(store, {
    accountId: state.accountId,
    profile,
    fileName: state.file.name,
    bytes: state.file.bytes,
  });
  if (refusal) {
    setImportState({ ...state, profileId: profile.id, refusal });
    navigate("/import");
  } else {
    setImportState(emptyImport);
    navigate("/import/review");
  }
}
