import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/ui/lib/utils";
import type { ItemStatus } from "./useReviewFocus";

/**
 * How review shows where the user is and what was seen (FR-150, FR-151): the current item has a 2px
 * outline, a 4px bar at its left edge and an arrow; a seen one a check and its text in the
 * secondary ink. Shape as well as colour, so it reads without telling colours apart.
 */
export const itemStatusClass: Record<ItemStatus, string> = {
  current: "border-l-4 border-l-primary outline-2 -outline-offset-2 outline-primary outline-solid",
  seen: "text-muted-foreground",
  unseen: "",
};

/** The arrow of the current item or the check of a seen one; nothing for an item not seen. */
export function ItemStatusIcon({ status }: { status: ItemStatus }) {
  if (status === "current") {
    return (
      <ArrowRight
        role="img"
        aria-label="Current item"
        aria-hidden={false}
        className="size-3.5 shrink-0 text-primary"
      />
    );
  }
  if (status === "seen") {
    return (
      <Check
        role="img"
        aria-label="Seen"
        aria-hidden={false}
        className="size-3.5 shrink-0 text-muted-foreground"
      />
    );
  }
  return null;
}

/** Keeps the icon in the left margin of a row, whose columns are the row's own. */
export function RowStatusIcon({ status }: { status: ItemStatus }) {
  return (
    <span
      className={cn("absolute top-1/2 left-0.5 -translate-y-1/2", status === "unseen" && "hidden")}
    >
      <ItemStatusIcon status={status} />
    </span>
  );
}
