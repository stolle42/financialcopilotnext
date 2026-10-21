import { InfoIcon } from "lucide-react";
import { useId, useState } from "react";
import type { Refusal } from "@/domain/types";
import { servedLocally } from "@/ai/local";
import { applyUpdate, runningVersion, useNewerVersion } from "@/pwa/updates";
import { aiFeaturesOn, setAiFeatures } from "@/store/settings";
import { useStore, useStoreApi } from "@/store/store";
import { ConfirmDialog } from "@/ui/components/ConfirmDialog";
import { Button } from "@/ui/components/ui/button";
import { Label } from "@/ui/components/ui/label";
import { Switch } from "@/ui/components/ui/switch";
import {
  aiFeaturesDescription,
  aiFeaturesLocalOnly,
  messageFor,
  sharingWarning,
  updateNotice,
  type MessageCode,
} from "@/ui/messages";
import { saveBackup } from "@/ui/screens/backup/saveBackup";

/**
 * Settings (contracts/ui.md, settings): the AI features switch, which warns that data will now be
 * shared before it turns on, and turns off at once (FR-095). Outside the user's own computer it is
 * off and unavailable, with the reason beside it (FR-106). Above it, while the service worker holds
 * a newer version, the notice that offers Backup and Update (FR-124).
 */
export function SettingsScreen() {
  const store = useStoreApi();
  const local = servedLocally();
  const on = useStore(aiFeaturesOn);
  const [warning, setWarning] = useState(false);
  const [refusal, setRefusal] = useState<Refusal<MessageCode> | null>(null);
  const switchId = useId();
  const localOnlyId = useId();
  const newer = useNewerVersion();

  async function update() {
    setRefusal(null);
    setRefusal(
      (await applyUpdate(navigator.serviceWorker?.controller, () => location.reload())) ?? null,
    );
  }

  async function set(next: boolean) {
    setRefusal(await setAiFeatures(store, next));
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
            disabled={!local}
            aria-describedby={local ? undefined : localOnlyId}
            onCheckedChange={(checked) => (checked ? setWarning(true) : void set(false))}
          />
          <Label htmlFor={switchId} className="text-sm font-normal">
            AI features
          </Label>
          {!local && (
            <span id={localOnlyId} className="text-sm text-muted-foreground">
              {aiFeaturesLocalOnly}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{aiFeaturesDescription}</p>
      </section>
      <ConfirmDialog
        open={warning}
        title="Turn on AI features?"
        description={sharingWarning}
        confirmLabel="Turn on"
        onConfirm={() => {
          setWarning(false);
          void set(true);
        }}
        onCancel={() => setWarning(false)}
      />
    </div>
  );
}
