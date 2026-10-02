import type { Category } from "@/domain/types";

/**
 * A category's colour swatch and name: the one way a category appears anywhere in the app
 * (FR-065, contracts/ui.md shared patterns).
 */
export function CategoryChip({ category }: { category: Pick<Category, "name" | "color"> }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: category.color }}
      />
      <span className="truncate">{category.name}</span>
    </span>
  );
}
