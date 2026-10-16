import { useMemo, useState } from "react";
import { budgetableCategories } from "@/domain/budgets";
import type { Category } from "@/domain/types";
import { removeLimit, setLimit } from "@/store/budgets";
import { useStore, useStoreApi } from "@/store/store";
import { AmountField, amountText, parseAmountText } from "@/ui/components/AmountField";
import { CategoryChip } from "@/ui/components/CategoryChip";
import { Button } from "@/ui/components/ui/button";
import { Field, FieldError } from "@/ui/components/ui/field";
import { messageFor, type MessageCode } from "@/ui/messages";

/** One category's limit field, which saves on Enter and when it loses focus (contracts/ui.md, budgets). */
function BudgetRow({
  category,
  limitCents,
}: {
  category: Category;
  limitCents: number | undefined;
}) {
  const store = useStoreApi();
  const saved = limitCents === undefined ? "" : amountText(limitCents);
  const [text, setText] = useState(saved);
  const [error, setError] = useState<MessageCode | null>(null);

  async function save() {
    const typed = text.trim();
    // Nothing typed that differs from what is saved, so an empty field nobody filled stays quiet.
    if (typed === saved) {
      setError(null);
      return;
    }
    const cents = parseAmountText(typed, false);
    const refusal = await setLimit(store, category.id, cents);
    if (!refusal && cents !== null) {
      setText(amountText(cents));
      setError(null);
    } else if (refusal?.code === "budget-limit-invalid" || refusal?.code === "save-failed") {
      setError(refusal.code);
    } else {
      // The screen lists only categories that can carry a budget, so this is a bug, not a mistake.
      throw new Error(`Refused unexpectedly: ${refusal?.code}`);
    }
  }

  async function remove() {
    const refusal = await removeLimit(store, category.id);
    if (refusal) {
      setError(refusal.code);
      return;
    }
    setText("");
    setError(null);
  }

  return (
    <li className="grid grid-cols-[1fr_14rem_6rem] items-start gap-4 px-4 py-3 text-sm">
      <span className="flex h-8 items-center">
        <CategoryChip category={category} />
      </span>
      <Field data-invalid={error ? true : undefined}>
        <AmountField
          aria-label={`Monthly limit for ${category.name}`}
          placeholder="No limit"
          value={text}
          onValueChange={setText}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save();
          }}
          aria-invalid={error ? true : undefined}
        />
        <FieldError>{error && messageFor({ code: error })}</FieldError>
      </Field>
      <span>
        {limitCents !== undefined && (
          <Button
            variant="outline"
            aria-label={`Remove limit for ${category.name}`}
            onClick={() => void remove()}
          >
            Remove
          </Button>
        )}
      </span>
    </li>
  );
}

/** Monthly limits on the expense categories that can carry one (FR-040, FR-041). */
export function BudgetsScreen() {
  const categories = useStore((state) => state.categories);
  const budgets = useStore((state) => state.budgets);
  const budgetable = useMemo(() => budgetableCategories(categories), [categories]);
  const limits = useMemo(
    () => new Map(budgets.map((budget) => [budget.categoryId, budget.limitCents])),
    [budgets],
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Budgets</h1>
      <p className="text-muted-foreground">
        A limit applies to every month. Each month starts at zero, and what is left over does not
        carry into the next.
      </p>
      <ul className="flex flex-col divide-y rounded-lg border">
        {budgetable.map((category) => (
          <BudgetRow key={category.id} category={category} limitCents={limits.get(category.id)} />
        ))}
      </ul>
    </div>
  );
}
