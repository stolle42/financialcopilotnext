import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReviewView } from "@/domain/import/groups";
import { suggestableRows } from "@/domain/import/suggestions";
import type { Refusal } from "@/domain/types";
import { suggestCategories } from "@/store/import";
import { aiFeaturesOn } from "@/store/settings";
import { useStore, useStoreApi } from "@/store/store";
import { Button } from "@/ui/components/ui/button";
import { aiFeaturesNeeded, notifications, type MessageCode } from "@/ui/messages";

const rows = (count: number) => `${count} row${count === 1 ? "" : "s"}`;

/**
 * Suggest categories (contracts/ui.md, review; FR-090 – FR-095): one request per click, available
 * only while AI features are on, which the user turned on in Settings after the data-sharing
 * warning. Leaving review cancels it, so nothing is filled after the user went elsewhere.
 */
export function SuggestCategories({
  view,
  onRefusal,
  onAskingChange,
}: {
  view: ReviewView;
  onRefusal: (refusal: Refusal<MessageCode> | null) => void;
  onAskingChange: (asking: boolean) => void;
}) {
  const store = useStoreApi();
  const aiFeatures = useStore(aiFeaturesOn);
  const categories = useStore((state) => state.categories);
  const count = useMemo(() => suggestableRows(view, categories).length, [view, categories]);
  const [asking, setAsking] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  // The requests still running, cancelled when review closes.
  const running = useRef(new Set<AbortController>());
  useEffect(() => {
    const requests = running.current;
    return () => requests.forEach((request) => request.abort());
  }, []);

  async function ask() {
    const request = new AbortController();
    running.current.add(request);
    setAsking(true);
    onAskingChange(true);
    setOutcome(null);
    onRefusal(null);
    const result = await suggestCategories(store, request.signal);
    running.current.delete(request);
    // Review has closed: there is no screen left to report to.
    if (request.signal.aborted) return;
    setAsking(false);
    onAskingChange(false);
    if (result === null) return;
    if ("code" in result) onRefusal(result);
    else setOutcome(notifications.categoriesSuggested(result.filled, result.sent));
  }

  return (
    <section aria-label="Suggestions" className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        disabled={!aiFeatures || asking || count === 0}
        onClick={() => void ask()}
      >
        <Sparkles aria-hidden />
        {asking ? "Asking the AI…" : `Suggest categories for ${rows(count)}`}
      </Button>
      {!aiFeatures && (
        <p className="text-sm text-muted-foreground">
          {aiFeaturesNeeded}{" "}
          <a href="#/settings" className="font-medium text-foreground underline">
            Open Settings
          </a>
        </p>
      )}
      {outcome && (
        <p role="status" className="text-sm">
          {outcome}
        </p>
      )}
    </section>
  );
}
