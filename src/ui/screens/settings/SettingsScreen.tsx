import { InfoIcon } from "lucide-react";
import { useId, useState } from "react";
import { AI_MODELS, modelInUse } from "@/ai/models";
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
import { KeyDialog } from "@/ui/components/KeyDialog";
import { Button } from "@/ui/components/ui/button";
import { Label } from "@/ui/components/ui/label";
import { Switch } from "@/ui/components/ui/switch";
import {
  aiFeaturesDescription,
  aiKey,
  messageFor,
  modelChoice,
  updateNotice,
  type MessageCode,
} from "@/ui/messages";
import { saveBackup } from "@/ui/screens/backup/saveBackup";
import { ScreenIntro } from "@/ui/components/ScreenIntro";

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
      <ScreenIntro>AI features, the model that answers, and updates of the app.</ScreenIntro>
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
