import { Sparkles } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReviewView } from "@/domain/import/groups";
import { suggestableRows } from "@/domain/import/suggestions";
import type { Refusal } from "@/domain/types";
import { suggestCategories } from "@/store/import";
import { skipSharingWarning } from "@/store/settings";
import { useStore, useStoreApi } from "@/store/store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/ui/components/ui/alert-dialog";
import { Button } from "@/ui/components/ui/button";
import { Label } from "@/ui/components/ui/label";
import { notifications, sharingWarning, type MessageCode } from "@/ui/messages";

const rows = (count: number) => `${count} row${count === 1 ? "" : "s"}`;

/**
 * Suggest categories (contracts/ui.md, review; FR-090 – FR-095): one request per click, sent only
 * after the user agreed to the data-sharing warning or asked never to see it again. Leaving review
 * cancels it, so nothing is filled after the user went elsewhere.
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
  const warn = useStore((state) => state.settings.skipSharingWarning !== true);
  const categories = useStore((state) => state.categories);
  const count = useMemo(() => suggestableRows(view, categories).length, [view, categories]);
  const [asking, setAsking] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [warning, setWarning] = useState(false);
  const [dontWarnAgain, setDontWarnAgain] = useState(false);
  const checkboxId = useId();

  // The requests still running, cancelled when review closes.
  const running = useRef(new Set<AbortController>());
  useEffect(() => {
    const requests = running.current;
    return () => requests.forEach((request) => request.abort());
  }, []);

  function select() {
    if (!warn) return void ask();
    setDontWarnAgain(false);
    setWarning(true);
  }

  async function agree() {
    setWarning(false);
    void ask();
    if (!dontWarnAgain) return;
    const refusal: Refusal<MessageCode> | null = await skipSharingWarning(store);
    // The choice could not be saved: say so, while the request the user agreed to still runs.
    if (refusal) onRefusal(refusal);
  }

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
      <Button variant="outline" disabled={asking || count === 0} onClick={select}>
        <Sparkles aria-hidden />
        {asking ? "Asking Claude…" : `Suggest categories for ${rows(count)}`}
      </Button>
      {outcome && (
        <p role="status" className="text-sm">
          {outcome}
        </p>
      )}
      <AlertDialog open={warning} onOpenChange={(next) => !next && setWarning(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Share data with Claude?</AlertDialogTitle>
            <AlertDialogDescription>{sharingWarning}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2">
            <input
              id={checkboxId}
              type="checkbox"
              className="size-4 accent-primary"
              checked={dontWarnAgain}
              onChange={(event) => setDontWarnAgain(event.target.checked)}
            />
            <Label htmlFor={checkboxId} className="text-sm font-normal">
              {"Don't warn me again"}
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void agree()}>Share and suggest</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
