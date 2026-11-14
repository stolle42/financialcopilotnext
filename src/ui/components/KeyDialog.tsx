import { useId, useRef, useState } from "react";
import { checkKey, OPENAI_API_KEYS_URL } from "@/ai/openai";
import { maskKey } from "@/domain/settings";
import type { Refusal } from "@/domain/types";
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
import { aiKey, messageFor, sharingWarning, type MessageCode } from "@/ui/messages";

export interface KeyDialogProps {
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
export function KeyDialog({ storedKey, onTurnOn, onClose }: KeyDialogProps) {
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
          href={OPENAI_API_KEYS_URL}
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
