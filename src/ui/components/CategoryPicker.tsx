import { useMemo, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { pickerCategories } from "@/domain/categories";
import type { Category, Side } from "@/domain/types";
import { useStore } from "@/store/store";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/ui/components/ui/combobox";
import { InputGroupAddon } from "@/ui/components/ui/input-group";

/** What the list holds: a category of the side, or the last item, New category… (FR-149). */
type Entry = { kind: "category"; category: Category } | { kind: "new" };

export const NEW_CATEGORY_LABEL = "New category…";

const labelOf = (entry: Entry) => (entry.kind === "new" ? NEW_CATEGORY_LABEL : entry.category.name);

/** Keeps the categories whose name contains the typed text, trimmed and ignoring case (FR-148). */
function matches(entry: Entry, query: string): boolean {
  if (entry.kind === "new") return true;
  return entry.category.name.toLowerCase().includes(query.trim().toLowerCase());
}

/** The category the list of `input` highlights, which the combobox names by `aria-activedescendant`. */
function highlightedCategory(input: HTMLInputElement): string | null {
  const id = input.getAttribute("aria-activedescendant");
  return (id && document.getElementById(id)?.getAttribute("data-category-id")) || null;
}

interface CategoryPickerProps {
  /** For a visible label; a picker without one, as in a list cell, takes `aria-label` instead. */
  id?: string;
  "aria-label"?: string;
  side: Side;
  /** `null` when there is no single current value, as for a vendor group whose rows differ. */
  value: string | null;
  /** What the field shows without a current value. */
  placeholder?: string;
  onValueChange: (categoryId: string) => void;
  /**
   * Opens the New category dialog with the text typed so far as its name. Without it, the list
   * has no New category… item.
   */
  onNewCategory?: (typedName: string) => void;
  /** Opens the list on mount, as editing a cell in place does (contracts/ui.md). */
  defaultOpen?: boolean;
  autoFocus?: boolean;
  onOpenChange?: (open: boolean, details: { reason: string }) => void;
  /**
   * Called for every key pressed in the field, before the list handles it, with the category the
   * open list highlights, or `null`: what review's Tab picks first (R-43, R-44).
   */
  /** `-1` keeps the list's button out of the Tab order, as review's Tab from item to item needs. */
  triggerTabIndex?: number;
  onKeyDown?: (
    event: KeyboardEvent<HTMLInputElement>,
    highlightedCategoryId: string | null,
  ) => void;
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * Picks a category of one side by typing: the list keeps the names containing the text, the first
 * is highlighted, Enter picks it and Escape leaves the field as it was (FR-148, R-43). There is no
 * empty choice (FR-011) and no "Unaccounted" (FR-030), but the current value always shows, even
 * when it is not in the list, as when a reconciliation entry is edited.
 */
export function CategoryPicker({
  id,
  "aria-label": ariaLabel,
  side,
  value,
  placeholder,
  onValueChange,
  onNewCategory,
  defaultOpen,
  autoFocus,
  onOpenChange,
  triggerTabIndex,
  onKeyDown,
  inputRef,
}: CategoryPickerProps) {
  const categories = useStore((state) => state.categories);
  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = pickerCategories(categories, side).map((category) => ({
      kind: "category",
      category,
    }));
    if (onNewCategory) list.push({ kind: "new" });
    return list;
  }, [categories, side, onNewCategory]);
  const current = categories.find((category) => category.id === value);
  // Stable between renders: a new object would make the combobox rewrite what the user typed.
  const selected = useMemo<Entry | null>(
    () => (current ? { kind: "category", category: current } : null),
    [current],
  );
  // What the user typed, not the label the combobox writes into its field when an item is chosen,
  // which New category… must not take as the new name.
  const typed = useRef("");
  const [query, setQuery] = useState("");
  const noMatch =
    query.trim() !== "" &&
    !entries.some((entry) => entry.kind === "category" && matches(entry, query));

  return (
    <Combobox<Entry>
      items={entries}
      value={selected}
      defaultOpen={defaultOpen}
      autoHighlight
      filter={matches}
      itemToStringLabel={labelOf}
      isItemEqualToValue={(a, b) => labelOf(a) === labelOf(b) && a.kind === b.kind}
      onValueChange={(entry) => {
        if (!entry) return;
        if (entry.kind === "new") {
          onNewCategory?.(typed.current.trim());
          return;
        }
        onValueChange(entry.category.id);
      }}
      onInputValueChange={(text, details) => {
        if (details.reason !== "input-change") return;
        typed.current = text;
        setQuery(text);
      }}
      onOpenChange={(open, details) => {
        if (!open) {
          typed.current = "";
          setQuery("");
        }
        onOpenChange?.(open, details);
      }}
    >
      <ComboboxInput
        id={id}
        aria-label={ariaLabel}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        // Typing replaces the category shown, so a field focused by Tab or by review searches at once.
        onFocus={(event) => event.currentTarget.select()}
        triggerTabIndex={triggerTabIndex}
        ref={inputRef}
        onKeyDown={
          onKeyDown && ((event) => onKeyDown(event, highlightedCategory(event.currentTarget)))
        }
        className="w-full"
      >
        {current && (
          <InputGroupAddon align="inline-start">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: current.color }}
            />
          </InputGroupAddon>
        )}
      </ComboboxInput>
      <ComboboxContent>
        {noMatch && (
          <p className="py-2 text-center text-sm text-muted-foreground">No category matches</p>
        )}
        <ComboboxList>
          {(entry: Entry) => (
            <ComboboxItem
              key={entry.kind === "new" ? "new" : entry.category.id}
              value={entry}
              data-category-id={entry.kind === "category" ? entry.category.id : undefined}
            >
              {entry.kind === "new" ? (
                NEW_CATEGORY_LABEL
              ) : (
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.category.color }}
                  />
                  <span className="truncate">{entry.category.name}</span>
                </span>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
