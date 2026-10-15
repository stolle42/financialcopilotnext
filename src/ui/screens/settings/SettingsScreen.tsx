import { useId, useState } from "react";
import type { Refusal } from "@/domain/types";
import { setAiFeatures } from "@/store/settings";
import { useStore, useStoreApi } from "@/store/store";
import { ConfirmDialog } from "@/ui/components/ConfirmDialog";
import { Label } from "@/ui/components/ui/label";
import { Switch } from "@/ui/components/ui/switch";
import { aiFeaturesDescription, messageFor, sharingWarning, type MessageCode } from "@/ui/messages";

/**
 * Settings (contracts/ui.md, settings): the AI features switch, which warns that data will now be
 * shared before it turns on, and turns off at once (FR-095).
 */
export function SettingsScreen() {
  const store = useStoreApi();
  const on = useStore((state) => state.settings.aiFeatures === true);
  const [warning, setWarning] = useState(false);
  const [refusal, setRefusal] = useState<Refusal<MessageCode> | null>(null);
  const switchId = useId();

  async function set(next: boolean) {
    setRefusal(await setAiFeatures(store, next));
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      {refusal && (
        <p role="alert" className="text-sm text-destructive">
          {messageFor(refusal)}
        </p>
      )}
      <section aria-labelledby="ai-features" className="flex flex-col items-start gap-3">
        <h2 id="ai-features" className="text-lg font-medium">
          AI features
        </h2>
        <div className="flex items-center gap-2">
          <Switch
            id={switchId}
            checked={on}
            onCheckedChange={(checked) => (checked ? setWarning(true) : void set(false))}
          />
          <Label htmlFor={switchId} className="text-sm font-normal">
            AI features
          </Label>
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
