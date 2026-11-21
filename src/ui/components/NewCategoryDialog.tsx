import { useId, useState, type FormEvent } from "react";
import type { Refusal, Side } from "@/domain/types";
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

/**
 * Asks for a name, which may start filled in, and a colour, which starts as the first one the side
 * does not use (FR-032, FR-149). A name is refused as Categories refuses it. `onCreated` gets the
 * new category's id, and `onClose` is called after it, or when the dialog is cancelled.
 */
export function NewCategoryDialog({
  side,
  initialName = "",
  create,
  onCreated,
  onClose,
}: {
  side: Side;
  initialName?: string;
  /**
   * Creates the category in place of Categories' own way, as review does when it creates and
   * assigns in one change. Resolves to the refusal, or `null`; `onCreated` is then not called.
   */
  create?: (input: { name: string; color: string }) => Promise<Refusal<MessageCode> | null>;
  onCreated?: (categoryId: string) => void;
  onClose: () => void;
}) {
  const store = useStoreApi();
  const id = useId();
  const [name, setName] = useState(initialName);
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
    // The dialog sits in the React tree of a form when a picker opens it; its submit is not that form's.
    event.stopPropagation();
    const refusal = create
      ? await create({ name, color })
      : await createCategory(store, { side, name, color });
    if (!refusal) {
      // Names are unique within a side, so the new category is the one with this name.
      const created = store
        .getState()
        .categories.find((c) => c.side === side && c.name === name.trim());
      if (created && !create) onCreated?.(created.id);
      onClose();
    } else if (refusal.code === "save-failed") setFormError(refusal.code);
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
