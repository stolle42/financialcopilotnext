import { InfoIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { AI_MODELS, modelInUse } from "@/ai/models";
import { checkKey } from "@/ai/openai";
import { maskKey } from "@/domain/settings";
import type { Refusal } from "@/domain/types";
import { applyUpdate, runningVersion, useNewerVersion } from "@/pwa/updates";
import {
  aiFeaturesOn,
  chooseModel,
  removeKey,
  setAiFeatures,
  turnOnWithKey,
} from "@/store/settings";
import { useStore, useStoreApi } from "@/store/store";
import { ConfirmDialog } from "@/ui/components/ConfirmDialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/ui/components/ui/alert-dialog";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { Label } from "@/ui/components/ui/label";
import { Switch } from "@/ui/components/ui/switch";
import {
  aiFeaturesDescription,
  aiKey,
  messageFor,
  modelChoice,
  sharingWarning,
  updateNotice,
  type MessageCode,
} from "@/ui/messages";
import { saveBackup } from "@/ui/screens/backup/saveBackup";

/**
 * Settings (contracts/ui.md, settings): the AI features switch, which turns on only with an OpenAI
 * key OpenAI accepts, after the data-sharing warning, and turns off at once (FR-095, FR-126,
 * FR-127); the stored key, masked, with Remove key; and the model that answers (FR-129, FR-130).
 * Above them, while the service worker holds a newer version, the notice that offers Backup and
 * Update (FR-124).
 */
export function SettingsScreen() {
  const store = useStoreApi();
  const on = useStore(aiFeaturesOn);
  const apiKey = useStore((state) => state.apiKey);
  const settings = useStore((state) => state.settings);
  const [turningOn, setTurningOn] = useState(false);
  const [removing, setRemoving] = useState(false);
  // The model being saved, shown checked at once rather than once the write is done.
  const [choosing, setChoosing] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<Refusal<MessageCode> | null>(null);
  const switchId = useId();
  const modelLabelId = useId();
  const newer = useNewerVersion();
  const { model, noLongerOffered } = modelInUse(settings);

  async function update() {
    setRefusal(null);
    setRefusal(
      (await applyUpdate(navigator.serviceWorker?.controller, () => location.reload())) ?? null,
    );
  }

  async function turnOff() {
    setRefusal(await setAiFeatures(store, false));
  }

  async function remove() {
    setRemoving(false);
    setRefusal(await removeKey(store));
  }

  async function choose(id: string) {
    setChoosing(id);
    const refused = await chooseModel(store, id);
    setChoosing(null);
    setRefusal(refused);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Settings</h1>
      {newer && (
        <section className="surface flex flex-wrap items-center gap-3 p-6">
          <InfoIcon aria-hidden className="size-5 shrink-0 text-primary" />
          <p className="grow text-sm">{updateNotice(newer, runningVersion)}</p>
          <Button variant="outline" onClick={() => saveBackup(store)}>
            Backup
          </Button>
          <Button onClick={() => void update()}>Update</Button>
        </section>
      )}
      {refusal && (
        <p role="alert" className="text-sm text-destructive">
          {messageFor(refusal)}
        </p>
      )}
      <section
        aria-labelledby="ai-features"
        className="surface flex flex-col items-start gap-3 p-6"
      >
        <h2 id="ai-features" className="text-xl font-semibold">
          AI features
        </h2>
        <div className="flex items-center gap-2">
          <Switch
            id={switchId}
            checked={on}
            onCheckedChange={(checked) => (checked ? setTurningOn(true) : void turnOff())}
          />
          <Label htmlFor={switchId} className="text-sm font-normal">
            AI features
          </Label>
        </div>
        <p className="text-sm text-muted-foreground">{aiFeaturesDescription}</p>
        {apiKey !== null && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">{aiKey.stored(maskKey(apiKey))}</span>
            <Button variant="outline" onClick={() => setRemoving(true)}>
              {aiKey.remove}
            </Button>
          </div>
        )}
        <div role="radiogroup" aria-labelledby={modelLabelId} className="flex flex-col gap-2 pt-2">
          <span id={modelLabelId} className="text-sm font-medium">
            {modelChoice.label}
          </span>
          {AI_MODELS.map(({ id, hint }) => (
            <label key={id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="model"
                value={id}
                checked={id === (choosing ?? model)}
                // Selecting the one already checked saves it too, which ends the note (FR-130).
                onClick={() => void choose(id)}
                onChange={() => undefined}
                className="accent-primary"
              />
              {id} <span className="text-muted-foreground">{hint}</span>
            </label>
          ))}
          {noLongerOffered && (
            <p className="text-sm text-muted-foreground">{modelChoice.noLongerOffered(model)}</p>
          )}
        </div>
      </section>
      {turningOn && (
        <KeyDialog
          storedKey={apiKey}
          onTurnOn={(key) => turnOnWithKey(store, key)}
          onClose={() => setTurningOn(false)}
        />
      )}
      <ConfirmDialog
        open={removing}
        title={aiKey.removeTitle}
        description={aiKey.removeWarning}
        confirmLabel={aiKey.remove}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(false)}
      />
    </div>
  );
}

interface KeyDialogProps {
  /** The key already stored, which the dialog checks again in place of asking for one. */
  storedKey: string | null;
  onTurnOn: (key: string) => Promise<Refusal<MessageCode> | null>;
  onClose: () => void;
}

/**
 * The dialog of turning AI features on: the data-sharing warning, the lines about the key, and the
 * key, which OpenAI must accept before anything is stored (FR-127). Closing it, also during the
 * check, stops the check.
 */
function KeyDialog({ storedKey, onTurnOn, onClose }: KeyDialogProps) {
  const [entered, setEntered] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<Refusal<MessageCode> | null>(null);
  const check = useRef<AbortController | null>(null);
  const fieldId = useId();
  const key = storedKey ?? entered.trim();

  function close() {
    check.current?.abort();
    onClose();
  }

  async function turnOn() {
    setError(null);
    setChecking(true);
    const controller = new AbortController();
    check.current = controller;
    const result = await checkKey(key, controller.signal);
    if (result === "cancelled") return;
    if (result !== "accepted") {
      setChecking(false);
      setError(result);
      return;
    }
    const refused = await onTurnOn(key);
    if (refused) {
      setChecking(false);
      setError(refused);
      return;
    }
    onClose();
  }

  return (
    <AlertDialog open onOpenChange={(next) => !next && close()}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Turn on AI features?</AlertDialogTitle>
          <AlertDialogDescription>{sharingWarning}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm">{aiKey.about}</p>
        <a
          href={aiKey.createUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary underline underline-offset-3"
        >
          {aiKey.createLink}
        </a>
        {storedKey === null ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fieldId}>{aiKey.field}</Label>
            <Input
              id={fieldId}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={entered}
              readOnly={checking}
              onChange={(event) => setEntered(event.target.value)}
            />
          </div>
        ) : (
          <p className="text-sm">{aiKey.stored(maskKey(storedKey))}</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {messageFor(error)}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button disabled={checking || key === ""} onClick={() => void turnOn()}>
            {checking ? aiKey.checking : "Turn on"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
