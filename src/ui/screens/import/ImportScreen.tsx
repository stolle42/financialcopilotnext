import { useId, useMemo, useState } from "react";
import { sortAccounts } from "@/domain/accounts";
import { reviewView } from "@/domain/import/groups";
import { sortProfiles } from "@/domain/import/profiles";
import type { MappingProfile, PendingBatch, Refusal } from "@/domain/types";
import { deleteProfile, discardBatch } from "@/store/import";
import { useStore, useStoreApi } from "@/store/store";
import { navigate } from "@/ui/app/router";
import { ConfirmDialog } from "@/ui/components/ConfirmDialog";
import { Button } from "@/ui/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/ui/components/ui/field";
import { Input } from "@/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/ui/select";
import { messageFor, type MessageCode } from "@/ui/messages";
import { importChosenFile, NEW_PROFILE, useImportState } from "./importState";

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** The batch's counts as review shows them (contracts/ui.md, review). */
export function countsText(batch: PendingBatch): string {
  const { review, duplicates, unparsable } = reviewView(batch).counts;
  return `${review} to review · ${plural(duplicates, "duplicate")} · ${unparsable} unparsable`;
}

/** The pending batch, with Review and Discard (FR-022, FR-027). */
function PendingBatchCard({ batch }: { batch: PendingBatch }) {
  const store = useStoreApi();
  const account = useStore((state) => state.accounts.find((a) => a.id === batch.accountId));
  const [confirming, setConfirming] = useState(false);
  const [refusal, setRefusal] = useState<Refusal<MessageCode> | null>(null);

  async function discard() {
    setConfirming(false);
    setRefusal(await discardBatch(store));
  }

  return (
    <section aria-label="Import waiting for review" className="surface flex flex-col gap-3 p-6">
      {refusal && (
        <p role="alert" className="text-sm text-destructive">
          {messageFor(refusal)}
        </p>
      )}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">An import is waiting for review</h2>
          <p className="text-sm text-muted-foreground">
            {batch.fileName} into {account?.name} · {countsText(batch)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate("/import/review")}>Review</Button>
          <Button variant="outline" onClick={() => setConfirming(true)}>
            Discard
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Discard this import?"
        description="None of its rows enter the ledger, and the choices made in review are lost."
        confirmLabel="Discard import"
        onConfirm={() => void discard()}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}

/** The step a refusal offers, if any (FR-067). */
function nextStep(refusal: Refusal<MessageCode>, profile: MappingProfile | undefined) {
  if (refusal.code === "import-batch-pending") {
    return { label: "Open pending batch", path: "/import/review" };
  }
  const profileAtFault = [
    "import-decoding-failed",
    "import-missing-columns",
    "import-duplicate-header",
  ];
  if (profile && profileAtFault.includes(refusal.code)) {
    return { label: "Edit profile", path: `/import/profiles/${encodeURIComponent(profile.id)}` };
  }
  return null;
}

/** Account, file and profile, then Import (contracts/ui.md, import). */
function ImportForm({ batchPending }: { batchPending: boolean }) {
  const store = useStoreApi();
  const accounts = useStore((state) => state.accounts);
  const profiles = useStore((state) => state.profiles);
  const sortedAccounts = useMemo(() => sortAccounts(accounts), [accounts]);
  const sortedProfiles = useMemo(() => sortProfiles(profiles), [profiles]);
  const { importState, setImportState } = useImportState();
  const [importing, setImporting] = useState(false);
  const ids = { account: useId(), file: useId(), profile: useId() };

  // Exactly one profile is preselected; with none yet, a new one is the only choice.
  const chosen = importState.profileId;
  const profileId =
    chosen === NEW_PROFILE || profiles.some((p) => p.id === chosen)
      ? chosen
      : profiles.length === 1
        ? profiles[0]!.id
        : profiles.length === 0
          ? NEW_PROFILE
          : null;
  const profile = profiles.find((p) => p.id === profileId);
  const refusal = importState.refusal;
  const accountRefused = refusal?.code === "import-account-missing";

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    // A pending batch refuses the file before it is read (FR-022).
    if (batchPending) {
      setImportState((state) => ({ ...state, refusal: { code: "import-batch-pending" } }));
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setImportState((state) => ({ ...state, file: { name: file.name, bytes }, refusal: null }));
    } catch {
      setImportState((state) => ({
        ...state,
        file: null,
        refusal: { code: "import-file-unreadable" },
      }));
    }
  }

  async function startImport() {
    const state = { ...importState, profileId, refusal: null };
    if (profileId === NEW_PROFILE) {
      if (!state.accountId) {
        setImportState({ ...state, refusal: { code: "import-account-missing" } });
        return;
      }
      setImportState(state);
      navigate("/import/profiles/new");
      return;
    }
    if (!profile) return;
    setImporting(true);
    await importChosenFile(store, state, profile, setImportState);
    setImporting(false);
  }

  const step = refusal && !accountRefused ? nextStep(refusal, profile) : null;
  const fileZone = (
    <Field>
      <FieldLabel htmlFor={ids.file}>Bank file</FieldLabel>
      <div
        className="flex flex-col gap-2 rounded-2xl border border-dashed border-foreground/15 bg-muted/60 p-4"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void chooseFile(event.dataTransfer.files[0]);
        }}
      >
        <p className="text-sm text-muted-foreground">Drop a CSV file here, or choose one.</p>
        <Input
          id={ids.file}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(event) => {
            void chooseFile(event.target.files?.[0]);
            // Choosing the same file again must still count as a choice.
            event.target.value = "";
          }}
        />
        {importState.file && !batchPending && (
          <p className="text-sm">Chosen: {importState.file.name}</p>
        )}
      </div>
    </Field>
  );

  return (
    <section aria-label="Import a file" className="surface flex max-w-2xl flex-col gap-4 p-6">
      {refusal && !accountRefused && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-2xl border border-destructive/40 p-4 text-sm text-destructive"
        >
          <span>{messageFor(refusal)}</span>
          {step && (
            <Button variant="outline" size="sm" onClick={() => navigate(step.path)}>
              {step.label}
            </Button>
          )}
        </div>
      )}
      {batchPending ? (
        fileZone
      ) : (
        <>
          <Field data-invalid={accountRefused ? true : undefined}>
            <FieldLabel htmlFor={ids.account}>Account</FieldLabel>
            <Select
              value={importState.accountId}
              onValueChange={(accountId) =>
                setImportState((state) => ({ ...state, accountId, refusal: null }))
              }
            >
              <SelectTrigger
                id={ids.account}
                className="w-full"
                aria-invalid={accountRefused || undefined}
              >
                <SelectValue>
                  {(id: string | null) =>
                    accounts.find((a) => a.id === id)?.name ?? (
                      <span className="text-muted-foreground">Choose an account</span>
                    )
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {sortedAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{refusal && accountRefused ? messageFor(refusal) : null}</FieldError>
          </Field>
          {fileZone}
          <Field>
            <FieldLabel htmlFor={ids.profile}>Profile</FieldLabel>
            <Select
              value={profileId}
              onValueChange={(id) =>
                setImportState((state) => ({ ...state, profileId: id, refusal: null }))
              }
            >
              <SelectTrigger id={ids.profile} className="w-full">
                <SelectValue>
                  {(id: string | null) =>
                    id === NEW_PROFILE
                      ? "Create new profile"
                      : (profiles.find((p) => p.id === id)?.name ?? (
                          <span className="text-muted-foreground">Choose a profile</span>
                        ))
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {sortedProfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
                {sortedProfiles.length > 0 && <SelectSeparator />}
                <SelectItem value={NEW_PROFILE}>Create new profile</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div>
            <Button
              onClick={() => void startImport()}
              disabled={!importState.file || profileId === null || importing}
            >
              Import
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

/** The saved mapping profiles, with Edit and Delete (FR-021). */
function ProfileList({ batchPending }: { batchPending: boolean }) {
  const store = useStoreApi();
  const profiles = useStore((state) => state.profiles);
  const sorted = useMemo(() => sortProfiles(profiles), [profiles]);
  const [deleting, setDeleting] = useState<MappingProfile | null>(null);
  const [refusal, setRefusal] = useState<Refusal<MessageCode> | null>(null);

  async function confirmDelete() {
    const profile = deleting;
    setDeleting(null);
    if (profile) setRefusal(await deleteProfile(store, profile.id));
  }

  return (
    <section aria-label="Mapping profiles" className="surface flex max-w-2xl flex-col gap-3 p-6">
      <h2 className="text-xl font-semibold">Mapping profiles</h2>
      {refusal && (
        <p role="alert" className="text-sm text-destructive">
          {messageFor(refusal)}
        </p>
      )}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No profiles yet. You define one the first time you import a file.
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {sorted.map((profile) => (
            <li key={profile.id} className="flex items-center justify-between py-2">
              <span className="font-medium">{profile.name}</span>
              <span className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/import/profiles/${encodeURIComponent(profile.id)}`)}
                >
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleting(profile)}>
                  Delete
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete the profile "${deleting?.name ?? ""}"?`}
        description={
          "Future imports can no longer use it. " +
          (batchPending
            ? "The import waiting for review is not affected."
            : "Transactions it imported stay in the ledger.")
        }
        confirmLabel="Delete profile"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}

/** Bank CSV import: the pending batch, the import form and the profiles (contracts/ui.md). */
export function ImportScreen() {
  const batch = useStore((state) => state.pendingBatch);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Import</h1>
      {batch && <PendingBatchCard batch={batch} />}
      <ImportForm batchPending={batch !== null} />
      <ProfileList batchPending={batch !== null} />
    </div>
  );
}
