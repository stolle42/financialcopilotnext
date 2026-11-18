import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, MouseEvent } from "react";
import type { ReviewView } from "@/domain/import/groups";
import {
  firstNotSeen,
  itemSeen,
  notSeenCount,
  reviewItems,
  type ReviewItem,
} from "@/domain/import/items";
import { markSeen } from "@/store/import";
import { useStoreApi } from "@/store/store";

// The current item, the unfolded groups, and where Tab goes (FR-150, FR-151, R-44). Which item is
// current is not stored; the seen marks are, on the rows, written at once.

export type ItemStatus = "current" | "seen" | "unseen";

/** The attribute that tells an item's element from everything else in review. */
const ITEM_ATTRIBUTE = "data-item-id";

/** Lists, dialogs and the like that a field opens: the focus going there does not leave the item. */
const POPUPS = '[data-slot$="-content"], [role="dialog"], [role="listbox"], [role="menu"]';

const itemIdOf = (node: EventTarget | null): string | null =>
  node instanceof Element
    ? (node.closest(`[${ITEM_ATTRIBUTE}]`)?.getAttribute(ITEM_ATTRIBUTE) ?? null)
    : null;

export function useReviewFocus(view: ReviewView) {
  const store = useStoreApi();
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(() => new Set());
  const items = useMemo(() => reviewItems(view, unfolded), [view, unfolded]);
  const [currentId, setCurrentId] = useState<string | null>(() => firstNotSeen(items)?.id ?? null);

  // What the handlers below read, which must be the latest items and not those of their render.
  const latest = useRef<readonly ReviewItem[]>(items);
  useEffect(() => {
    latest.current = items;
  }, [items]);

  // Each item's field, the picker or the Transfer switch, and the callbacks that register them.
  const fields = useRef(new Map<string, HTMLElement>());
  const callbacks = useRef(new Map<string, (element: HTMLElement | null) => void>());
  const fieldRef = useCallback((id: string) => {
    let callback = callbacks.current.get(id);
    if (!callback) {
      callback = (element) => {
        if (element) fields.current.set(id, element);
        else fields.current.delete(id);
      };
      callbacks.current.set(id, callback);
    }
    return callback;
  }, []);

  // Review opens on the first item not seen, with its field in focus so typing searches at once.
  useEffect(() => {
    if (currentId === null) return;
    const field = fields.current.get(currentId);
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({ block: "nearest" });
    // Once, when review opens; later the current item changes by the user's own doing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const statusOf = (id: string): ItemStatus => {
    if (id === currentId) return "current";
    const item = byId.get(id);
    return item && itemSeen(item) ? "seen" : "unseen";
  };

  /** Tab and Shift+Tab in an item's field: on to the next or back to the previous item. */
  function moveFrom(id: string, direction: "next" | "previous", event: KeyboardEvent) {
    const list = latest.current;
    const index = list.findIndex((item) => item.id === id);
    const target = list[index + (direction === "next" ? 1 : -1)];
    const field = target && fields.current.get(target.id);
    // At either end the browser moves the focus on, which marks the item seen as any other focus
    // leaving it does.
    if (!target || !field) return;
    event.preventDefault();
    setCurrentId(target.id);
    field.focus({ preventScroll: true });
    field.scrollIntoView({ block: "nearest" });
  }

  const onFocus = (event: FocusEvent) => {
    const id = itemIdOf(event.target);
    if (id) setCurrentId(id);
  };

  const onBlur = (event: FocusEvent) => {
    const id = itemIdOf(event.target);
    const to = event.relatedTarget;
    if (!id) return;
    // Into the list or dialog the item's own field opened: the item is still where the user is.
    if (to instanceof Element && to.closest(POPUPS)) return;
    if (itemIdOf(to) === id) return;
    const item = latest.current.find((candidate) => candidate.id === id);
    if (item) void markSeen(store, item);
    // The focus went to something that is no item, so no item is current until one is chosen.
    if (itemIdOf(to) === null) setCurrentId(null);
  };

  const onClick = (event: MouseEvent) => {
    const id = itemIdOf(event.target);
    if (id) setCurrentId(id);
  };

  const toggleUnfolded = (id: string) =>
    setUnfolded((before) => {
      const next = new Set(before);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return {
    items,
    notSeen: notSeenCount(items),
    isUnfolded: (id: string) => unfolded.has(id),
    toggleUnfolded,
    statusOf,
    /** Spread on an item's element. */
    itemProps: (id: string) => ({
      [ITEM_ATTRIBUTE]: id,
      "aria-current": id === currentId ? ("true" as const) : undefined,
    }),
    fieldRef,
    moveFrom,
    /** Spread on the element that holds every item. */
    regionProps: { onFocus, onBlur, onClick },
  };
}

export type ReviewFocus = ReturnType<typeof useReviewFocus>;
