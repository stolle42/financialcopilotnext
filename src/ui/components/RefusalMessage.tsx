import type { Refusal } from "@/domain/types";
import { messageFor, type MessageCode } from "@/ui/messages";

/** The refusals whose next step is in Settings, so their alert links there (contracts/ui.md). */
const NEXT_STEP_IN_SETTINGS: readonly string[] = ["ai-key-rejected", "ai-model-unavailable"];

/** The wording of `refusal`, followed by a link to Settings when the next step is there. */
export function RefusalMessage({ refusal }: { refusal: Refusal<MessageCode> }) {
  return (
    <>
      {messageFor(refusal)}
      {NEXT_STEP_IN_SETTINGS.includes(refusal.code) && (
        <>
          {" "}
          <a href="#/settings" className="font-medium underline">
            Open Settings
          </a>
        </>
      )}
    </>
  );
}
