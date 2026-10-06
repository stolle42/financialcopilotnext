import { useMemo } from "react";
import { pickerCategories } from "@/domain/categories";
import type { Side } from "@/domain/types";
import { useStore } from "@/store/store";
import { CategoryChip } from "@/ui/components/CategoryChip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/ui/select";

interface CategorySelectProps {
  id: string;
  side: Side;
  value: string;
  onValueChange: (categoryId: string) => void;
}

/**
 * Picks a category of one side. There is no empty option (FR-011) and no "Unaccounted"
 * (FR-030), but the current value always shows, even when it is not among the options, as when a
 * reconciliation entry is edited (contracts/ui.md, transaction form).
 */
export function CategorySelect({ id, side, value, onValueChange }: CategorySelectProps) {
  const categories = useStore((state) => state.categories);
  const options = useMemo(() => pickerCategories(categories, side), [categories, side]);
  const current = categories.find((category) => category.id === value);

  return (
    <Select value={value} onValueChange={(next) => next && onValueChange(next)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue>{() => current && <CategoryChip category={current} />}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((category) => (
          <SelectItem key={category.id} value={category.id}>
            <CategoryChip category={category} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
