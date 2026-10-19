import { useMemo, useState, type KeyboardEvent } from "react";
import { deletionImpact, protectedCategory, sortCategories } from "@/domain/categories";
import type { Category, Refusal, Side } from "@/domain/types";
import { deleteCategory, recolourCategory, renameCategory } from "@/store/categories";
import { useStore, useStoreApi } from "@/store/store";
import { CategoryChip } from "@/ui/components/CategoryChip";
import { ColourPicker } from "@/ui/components/ColourPicker";
import { ConfirmDialog } from "@/ui/components/ConfirmDialog";
import { Button } from "@/ui/components/ui/button";
import { FieldError } from "@/ui/components/ui/field";
import { Input } from "@/ui/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/components/ui/tabs";
import { messageFor, type MessageCode } from "@/ui/messages";
import { NewCategoryDialog } from "./NewCategoryDialog";

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** The consequences of a deletion, with counts (FR-034, contracts/ui.md, categories). */
function deletionSentence(
  impact: ReturnType<typeof deletionImpact>,
  uncategorisedName: string,
): string {
  const moved =
    impact.transactionCount === 0
      ? "No transactions use it"
      : `${plural(impact.transactionCount, "transaction")} ${
          impact.transactionCount === 1 ? "moves" : "move"
        } to ${uncategorisedName}`;
  return `${moved}${impact.budgetRemoved ? "; its monthly limit is removed" : ""}.`;
}

interface Renaming {
  id: string;
  text: string;
  refusal: Refusal<MessageCode> | null;
}

/** One side's categories, each with Rename (inline), Colour (palette) and Delete. */
function CategoryList({ side }: { side: Side }) {
  const store = useStoreApi();
  const categories = useStore((state) => state.categories);
  const listed = useMemo(() => sortCategories(categories, side), [categories, side]);
  // Which row is being renamed, with what was typed and why it was refused.
  const [renaming, setRenaming] = useState<Renaming | null>(null);
  const [colouring, setColouring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  // A refusal that belongs to the whole list, shown at its top (contracts/ui.md, shared patterns).
  const [alert, setAlert] = useState<Refusal<MessageCode> | null>(null);

  async function saveName(edit: Renaming) {
    const category = listed.find((c) => c.id === edit.id)!;
    const name = edit.text.trim();
    // Nothing changed, so nothing to write.
    if (name === category.name) {
      setRenaming(null);
      return;
    }
    const refusal = await renameCategory(store, category.id, name);
    if (!refusal) setRenaming(null);
    else if (refusal.code === "save-failed") setAlert(refusal);
    else setRenaming({ ...edit, refusal });
  }

  function onNameKey(event: KeyboardEvent, edit: Renaming) {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveName(edit);
    } else if (event.key === "Escape") {
      setRenaming(null);
    }
  }

  async function pickColour(category: Category, colour: string) {
    setColouring(null);
    if (colour === category.color) return;
    const refusal = await recolourCategory(store, category.id, colour);
    if (refusal) setAlert(refusal);
  }

  function askToDelete(category: Category) {
    // The app shows why instead of asking, since asking would only lead to a refusal (FR-033).
    if (category.role) setAlert({ code: "category-protected", details: { role: category.role } });
    else setDeleting(category);
  }

  async function confirmDelete(category: Category) {
    setDeleting(null);
    const refusal = await deleteCategory(store, category.id);
    if (refusal) setAlert(refusal);
  }

  const impact = deleting ? deletionImpact(store.getState(), deleting.id) : null;
  const uncategorised = protectedCategory(categories, side, "uncategorised");

  return (
    <div className="flex flex-col gap-4">
      {alert && (
        <p role="alert" className="text-sm text-destructive">
          {messageFor(alert)}
        </p>
      )}
      <ul className="surface flex flex-col divide-y">
        {listed.map((category) => (
          <li key={category.id} className="flex flex-col gap-3 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              {renaming?.id === category.id ? (
                <div className="flex flex-1 flex-col gap-1">
                  <Input
                    aria-label="Name"
                    value={renaming.text}
                    onChange={(event) =>
                      setRenaming({ ...renaming, text: event.target.value, refusal: null })
                    }
                    onKeyDown={(event) => onNameKey(event, renaming)}
                    onFocus={(event) => event.currentTarget.select()}
                    aria-invalid={renaming.refusal ? true : undefined}
                    autoComplete="off"
                    autoFocus
                  />
                  <FieldError>{renaming.refusal && messageFor(renaming.refusal)}</FieldError>
                </div>
              ) : (
                <CategoryChip category={category} />
              )}
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Rename ${category.name}`}
                  onClick={() => {
                    setAlert(null);
                    setColouring(null);
                    setRenaming({ id: category.id, text: category.name, refusal: null });
                  }}
                >
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Colour of ${category.name}`}
                  onClick={() => {
                    setAlert(null);
                    setColouring(colouring === category.id ? null : category.id);
                  }}
                >
                  Colour
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${category.name}`}
                  onClick={() => {
                    setAlert(null);
                    askToDelete(category);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
            {colouring === category.id && (
              <div onKeyDown={(event) => event.key === "Escape" && setColouring(null)}>
                <ColourPicker
                  value={category.color}
                  onChange={(colour) => void pickColour(category, colour)}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "category"}?`}
        description={impact ? deletionSentence(impact, uncategorised.name) : ""}
        confirmLabel="Delete category"
        onConfirm={() => deleting && void confirmDelete(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

/** Both sets of categories on their own tabs, which are never mixed (FR-030, FR-032). */
export function CategoriesScreen() {
  const [side, setSide] = useState<Side>("expense");
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Categories</h1>
        <Button onClick={() => setCreating(true)}>New category</Button>
      </div>
      <Tabs value={side} onValueChange={(value) => setSide(value as Side)}>
        <TabsList>
          <TabsTrigger value="expense">Expenses</TabsTrigger>
          <TabsTrigger value="income">Income</TabsTrigger>
        </TabsList>
        <TabsContent value="expense">
          <CategoryList side="expense" />
        </TabsContent>
        <TabsContent value="income">
          <CategoryList side="income" />
        </TabsContent>
      </Tabs>
      {creating && <NewCategoryDialog side={side} onClose={() => setCreating(false)} />}
    </div>
  );
}
