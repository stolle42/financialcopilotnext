import { useContext, useEffect, useRef, useState } from "react";
import type { Refusal, State } from "@/domain/types";
import { prepareRestore, restore } from "@/store/backup";
import { useStoreApi } from "@/store/store";
import { navigate } from "@/ui/app/router";
import { StoragePersistedContext } from "@/ui/app/storagePersisted";
import { ConfirmDialog } from "@/ui/components/ConfirmDialog";
import { Button } from "@/ui/components/ui/button";
import { toast } from "@/ui/components/ui/toast";
import { messageFor, notifications, type MessageCode } from "@/ui/messages";
import { saveBackup } from "./saveBackup";

/** A state that passed validation, waiting for the user to agree to replace everything. */
interface Pending {
  state: State;
  fileName: string;
}

/** Saves all data to one file, and replaces it all from one (FR-070 – FR-072, FR-075). */
export function BackupScreen() {
  const store = useStoreApi();
  const fileInput = useRef<HTMLInputElement>(null);
  const [refusal, setRefusal] = useState<Refusal<MessageCode> | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  // Whether the browser agreed to keep the data, which it answers some time after start-up (R-07).
  const storagePersisted = useContext(StoragePersistedContext);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    void storagePersisted.then((answer) => current && setPersisted(answer));
    return () => {
      current = false;
    };
  }, [storagePersisted]);

  function save() {
    setRefusal(null);
    saveBackup(store);
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setRefusal(null);
    let text: string;
    try {
      text = await file.text();
    } catch {
      setRefusal({ code: "import-file-unreadable" });
      return;
    }
    // A refused file is shown at once, before the user is asked to give up their data (FR-072).
    const prepared = prepareRestore(text);
    if ("code" in prepared) setRefusal(prepared);
    else setPending({ state: prepared, fileName: file.name });
  }

  async function replace({ state, fileName }: Pending) {
    setPending(null);
    const failure = await restore(store, state);
    if (failure) {
      setRefusal(failure);
      return;
    }
    toast.add({ title: notifications.restored(fileName), type: "success" });
    navigate("/");
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Backup</h1>
      {persisted === false && (
        <p className="surface p-6 text-sm">
          Your browser may clear this app&apos;s data when disk space runs low, because it did not
          agree to keep it. A backup is the safeguard, so save one now and then.
        </p>
      )}
      {refusal && (
        <p role="alert" className="text-sm text-destructive">
          {messageFor(refusal)}
        </p>
      )}
      <section
        aria-labelledby="save-backup"
        className="surface flex flex-col items-start gap-3 p-6"
      >
        <h2 id="save-backup" className="text-xl font-semibold">
          Save a backup
        </h2>
        <p className="text-sm text-muted-foreground">
          Everything in the app goes into one file, which you can keep or load on another computer.
        </p>
        <Button onClick={save}>Save backup</Button>
      </section>
      <section
        aria-labelledby="restore-backup"
        className="surface flex flex-col items-start gap-3 p-6"
      >
        <h2 id="restore-backup" className="text-xl font-semibold">
          Restore from a backup
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose a backup file. It is checked first, and you are asked before it replaces what the
          app holds now.
        </p>
        <Button variant="outline" onClick={() => fileInput.current?.click()}>
          Restore from backup
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            void chooseFile(event.target.files?.[0]);
            // Choosing the same file again must still count as a choice.
            event.target.value = "";
          }}
        />
      </section>
      <ConfirmDialog
        open={pending !== null}
        title="Replace all data?"
        description={`Every account, transaction, budget, category and pending import in the app is replaced by what ${pending?.fileName ?? "the file"} holds. This cannot be undone, so save a backup of the current data first if you may want it back.`}
        confirmLabel="Replace all data"
        danger
        onConfirm={() => pending && void replace(pending)}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
