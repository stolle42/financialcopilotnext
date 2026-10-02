import { cn } from "cn";
import { ArrowLeftRightIcon } from "lucide-react";
import { useContext, useMemo, useState } from "react";
import { sortAccounts } from "@/domain/accounts";
import { sortCategories } from "@/domain/categories";
import { listTransactions } from "@/domain/transactions";
import type { Side, Transaction } from "@/domain/types";
import { useStore } from "@/store/store";
import { CategoryChip } from "@/ui/components/CategoryChip";
import { Button } from "@/ui/components/ui/button";
import { Field, FieldLabel } from "@/ui/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/ui/components/ui/toggle-group";
import { formatAmount, formatDate } from "@/ui/format";
import { OpenTransactionFormContext } from "./formContext";

// The "All" option of a filter select; Base UI selects need a value for every option.
const ALL = "";

function Amount({ transaction }: { transaction: Transaction }) {
  if (transaction.kind === "transfer") {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <ArrowLeftRightIcon aria-label="Transfer" className="size-4" />
        {formatAmount(transaction.amountCents)}
      </span>
    );
  }
  return transaction.kind === "income" ? (
    <span className="text-emerald-700">+{formatAmount(transaction.amountCents)}</span>
  ) : (
    <span>{formatAmount(-transaction.amountCents)}</span>
  );
}

/** Every transaction, newest first, with the account and category filters (FR-016). */
export function TransactionsScreen() {
  const openForm = useContext(OpenTransactionFormContext);
  const transactions = useStore((state) => state.transactions);
  const accounts = useStore((state) => state.accounts);
  const categories = useStore((state) => state.categories);
  const [accountId, setAccountId] = useState(ALL);
  const [side, setSide] = useState<Side>("expense");
  const [categoryId, setCategoryId] = useState(ALL);

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const sortedAccounts = useMemo(() => sortAccounts(accounts), [accounts]);
  const sideCategories = useMemo(() => sortCategories(categories, side), [categories, side]);
  // Memoised, so typing elsewhere never re-sorts a long list (R-21).
  const listed = useMemo(
    () => listTransactions(transactions, { accountId, categoryId }),
    [transactions, accountId, categoryId],
  );

  const filtered = accountId !== ALL || categoryId !== ALL;
  function clearFilters() {
    setAccountId(ALL);
    setCategoryId(ALL);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Transactions</h1>

      {transactions.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
          <p>No transactions yet. Record your first one to start your ledger.</p>
          <Button onClick={() => openForm(null)}>Add transaction</Button>
        </div>
      ) : (
        <>
          <section aria-label="Filters" className="flex flex-wrap items-end gap-4">
            <Field className="w-48">
              <FieldLabel htmlFor="filter-account">Account</FieldLabel>
              <Select value={accountId} onValueChange={(id) => setAccountId(id ?? ALL)}>
                <SelectTrigger id="filter-account" className="w-full">
                  <SelectValue>
                    {(id: string) => accountsById.get(id)?.name ?? "All accounts"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All accounts</SelectItem>
                  {sortedAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {/* Expense and income categories never share one list (FR-030). */}
            <ToggleGroup
              aria-label="Category side"
              variant="outline"
              value={[side]}
              onValueChange={(values) => {
                const next = values[0];
                if (next === "expense" || next === "income") {
                  setSide(next);
                  setCategoryId(ALL);
                }
              }}
            >
              <ToggleGroupItem value="expense">Expenses</ToggleGroupItem>
              <ToggleGroupItem value="income">Income</ToggleGroupItem>
            </ToggleGroup>
            <Field className="w-48">
              <FieldLabel htmlFor="filter-category">Category</FieldLabel>
              <Select value={categoryId} onValueChange={(id) => setCategoryId(id ?? ALL)}>
                <SelectTrigger id="filter-category" className="w-full">
                  <SelectValue>
                    {(id: string) => {
                      const category = categoriesById.get(id);
                      return category ? <CategoryChip category={category} /> : "All categories";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  {sideCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <CategoryChip category={category} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {filtered && (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </section>

          {listed.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
              <p>No transactions match these filters.</p>
              <Button onClick={clearFilters}>Clear filters</Button>
            </div>
          ) : (
            <ul aria-label="Transactions" className="flex flex-col divide-y rounded-lg border">
              {listed.map((transaction) => (
                // Off-screen rows skip layout and paint, but stay findable in the page (R-21).
                <li
                  key={transaction.id}
                  className="[contain-intrinsic-size:auto_3.5rem] [content-visibility:auto]"
                >
                  <button
                    type="button"
                    onClick={() => openForm(transaction)}
                    className="grid w-full grid-cols-[7rem_1fr_10rem_9rem_8rem] items-center gap-4 px-4 py-3 text-left text-sm hover:bg-muted"
                  >
                    <span className="text-muted-foreground">{formatDate(transaction.date)}</span>
                    <span
                      data-description
                      className={cn(
                        "truncate",
                        !transaction.description && "text-muted-foreground",
                      )}
                    >
                      {transaction.description || "No description"}
                    </span>
                    <span className="truncate">
                      {transaction.kind === "transfer" ? (
                        `→ ${accountsById.get(transaction.destinationAccountId)?.name ?? ""}`
                      ) : (
                        <CategoryChip category={categoriesById.get(transaction.categoryId)!} />
                      )}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {accountsById.get(transaction.accountId)?.name}
                    </span>
                    <span className="text-right tabular-nums">
                      <Amount transaction={transaction} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
