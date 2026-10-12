import { TriangleAlert } from "lucide-react";
import { useId } from "react";
import type { Refusal } from "@/domain/types";
import { setDataSharing } from "@/store/settings";
import { useStore, useStoreApi } from "@/store/store";
import { Button } from "@/ui/components/ui/button";
import { Label } from "@/ui/components/ui/label";
import { Switch } from "@/ui/components/ui/switch";
import { toast } from "@/ui/components/ui/toast";
import { dataSharingWarning, messageFor, type MessageCode } from "@/ui/messages";

// Data sharing (FR-095, contracts/ui.md, shell): nothing leaves the app unless the user turned it
// on, and while it is on, every screen says so (FR-061).

function useDataSharing() {
  const store = useStoreApi();
  const on = useStore((state) => state.settings.dataSharing === true);
  async function set(next: boolean) {
    const refusal: Refusal<MessageCode> | null = await setDataSharing(store, next);
    if (refusal) toast.add({ title: messageFor(refusal), type: "error" });
  }
  return { on, set };
}

/** The header's switch. */
export function DataSharingSwitch() {
  const { on, set } = useDataSharing();
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={on} onCheckedChange={(checked) => void set(checked)} />
      <Label htmlFor={id} className="text-sm font-normal">
        Data sharing
      </Label>
    </div>
  );
}

/** The warning under the header on every screen, for as long as data sharing is on. */
export function DataSharingWarning() {
  const { on, set } = useDataSharing();
  if (!on) return null;
  return (
    <div
      role="alert"
      className="flex items-center gap-3 border-b border-amber-300 bg-amber-50 px-6 py-2 text-sm text-amber-950"
    >
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      <p className="flex-1">{dataSharingWarning}</p>
      <Button variant="outline" size="sm" onClick={() => void set(false)}>
        Turn off
      </Button>
    </div>
  );
}
