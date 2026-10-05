import { useId, useState, type FormEvent } from "react";
import type { Side } from "@/domain/types";
import { createCategory } from "@/store/categories";
import { useStoreApi } from "@/store/store";
import { ColourPicker, firstFreeColour } from "@/ui/components/ColourPicker";
import { Button } from "@/ui/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/ui/components/ui/field";
import { Input } from "@/ui/components/ui/input";
import { messageFor, type MessageCode } from "@/ui/messages";

/** Asks for a name and a colour, which starts as the first one the side does not use (FR-032). */
export function NewCategoryDialog({ side, onClose }: { side: Side; onClose: () => void }) {
  const store = useStoreApi();
  const id = useId();
  const [name, setName] = useState("");
  // Chosen once, when the dialog opens: the colours the side uses do not change while it is open.
  const [color, setColor] = useState(() =>
    firstFreeColour(
      store
        .getState()
        .categories.filter((c) => c.side === side)
        .map((c) => c.color),
    ),
  );
  const [nameError, setNameError] = useState<MessageCode | null>(null);
  const [formError, setFormError] = useState<MessageCode | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const refusal = await createCategory(store, { side, name, color });
    if (!refusal) onClose();
    else if (refusal.code === "save-failed") setFormError(refusal.code);
    else setNameError(refusal.code);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New category</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <FieldGroup>
            <Field data-invalid={nameError ? true : undefined}>
              <FieldLabel htmlFor={id}>Name</FieldLabel>
              <Input
                id={id}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(null);
                }}
                aria-invalid={nameError ? true : undefined}
                autoComplete="off"
              />
              <FieldError>
                {nameError && messageFor({ code: nameError, details: { side } })}
              </FieldError>
            </Field>
            <ColourPicker value={color} onChange={setColor} />
          </FieldGroup>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {messageFor({ code: formError })}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit">Create category</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
