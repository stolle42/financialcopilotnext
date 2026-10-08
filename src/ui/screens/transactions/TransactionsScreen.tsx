import { cn } from "cn";
import { ArrowLeftRightIcon } from "lucide-react";
import {
  Fragment,
  memo,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { sortAccounts } from "@/domain/accounts";
import { sortCategories } from "@/domain/categories";
import { listTransactions, type Draft } from "@/domain/transactions";
import type { Category, Side, Transaction } from "@/domain/types";
import { useStore, useStoreApi } from "@/store/store";
import { saveTransaction } from "@/store/transactions";
import { CategoryChip } from "@/ui/components/CategoryChip";
import { Button, buttonVariants } from "@/ui/components/ui/button";
import { Field, FieldLabel } from "@/ui/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/ui/select";
import { formatAmount, formatDate } from "@/ui/format";
import type { MessageCode } from "@/ui/messages";
import { CellEditor, type Column } from "./CellEditor";
import { OpenTransactionFormContext } from "./formContext";

// The "All" option of a filter select; Base UI selects need a value for every option.
const ALL = "";

// The category filter holds both sides, each as a group under its name (FR-030).
const sideNames: Record<Side, string> = { expense: "Expenses", income: "Income" };

// The column header and every row share one grid, so each name sits over its column. The last
// column holds each row's Edit transaction button.
const columns = "grid grid-cols-[7rem_1fr_10rem_9rem_8rem_2rem] items-center gap-4 px-4";
const rowGrid = cn(columns, "py-1.5 text-sm");

// A cell reads as plain text, and shows that it edits its value on hover and focus. The class
// strings are built once, not for each of thousands of rows (R-21).
const cellStyle =
  "flex w-full min-w-0 items-center rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";
const mutedCellStyle = `${cellStyle} text-muted-foreground`;
const amountCellStyle = `${cellStyle} justify-end tabular-nums`;
const editButton = buttonVariants({ variant: "ghost", size: "icon-sm" });

interface EditedCell {
  id: string;
  column: Column;
}

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

interface TransactionRowProps {
  transaction: Transaction;
  /** The category of an expense or income; a transfer has none. */
  category: Category | undefined;
  accountName: string | undefined;
  destinationName: string | undefined;
  /** The column being edited in this row, if any. */
  editing: Column | null;
  onEdit: (id: string, column: Column) => void;
  onSave: (draft: Draft) => Promise<MessageCode | null>;
  onStopEditing: (id: string, column: Column) => void;
  onOpenForm: (transaction: Transaction) => void;
}

/**
 * One row of the list. It is memoised, so that opening or closing a cell renders its own row
 * again, not every row of a long list (R-21).
 */
const TransactionRow = memo(function TransactionRow({
  transaction,
  category,
  accountName,
  destinationName,
  editing,
  onEdit,
  onSave,
  onStopEditing,
  onOpenForm,
}: TransactionRowProps) {
  /** One cell: a button showing its value, or its editor while it is being edited. */
  function cellOf(column: Column, props: ComponentProps<"button"> & { "data-description"?: true }) {
    if (editing === column) {
      return (
        <CellEditor
          transaction={transaction}
          column={column}
          onSave={onSave}
          onClose={() => onStopEditing(transaction.id, column)}
        />
      );
    }
    return <button type="button" {...props} onClick={() => onEdit(transaction.id, column)} />;
  }

  return (
    // Off-screen rows skip layout and paint, but stay findable in the page (R-21).
    <li className="[contain-intrinsic-size:auto_3.5rem] [content-visibility:auto]">
      <div className={rowGrid}>
        {cellOf("date", { className: mutedCellStyle, children: formatDate(transaction.date) })}
        {cellOf("description", {
          "data-description": true,
          className: transaction.description ? cellStyle : mutedCellStyle,
          children: <span className="truncate">{transaction.description || "No description"}</span>,
        })}
        {cellOf("category", {
          className: cellStyle,
          children: category ? (
            <CategoryChip category={category} />
          ) : (
            <span className="truncate">{`→ ${destinationName ?? ""}`}</span>
          ),
        })}
        {cellOf("account", {
          className: mutedCellStyle,
          children: <span className="truncate">{accountName}</span>,
        })}
        {cellOf("amount", {
          className: amountCellStyle,
          children: <Amount transaction={transaction} />,
        })}
        <button
          type="button"
          aria-label="Edit transaction"
          title="Edit transaction"
          className={editButton}
          onClick={() => onOpenForm(transaction)}
        >
          <svg aria-hidden="true" className="size-4">
            <use href="#edit-icon" />
          </svg>
        </button>
      </div>
    </li>
  );
});

/**
 * Every transaction, newest first, with the account and category filters, and each value
 * editable in place (FR-016).
 */
export function TransactionsScreen() {
  const openForm = useContext(OpenTransactionFormContext);
  const store = useStoreApi();
  const transactions = useStore((state) => state.transactions);
  const accounts = useStore((state) => state.accounts);
  const categories = useStore((state) => state.categories);
  const [accountId, setAccountId] = useState(ALL);
  const [categoryId, setCategoryId] = useState(ALL);
  const [editing, setEditing] = useState<EditedCell | null>(null);
  // The save of the cell being left, while it runs or after it was refused (see `edit`).
  const leaving = useRef<Promise<MessageCode | null> | null>(null);

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const sortedAccounts = useMemo(() => sortAccounts(accounts), [accounts]);
  const categoryGroups = useMemo(
    () =>
      (["expense", "income"] as const).map((side) => ({
        side,
        categories: sortCategories(categories, side),
      })),
    [categories],
  );
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

  // The rows are memoised, so what they are handed must stay the same between renders.
  const saveCell = useCallback(
    (draft: Draft): Promise<MessageCode | null> => {
      const saved = saveTransaction(store, draft).then((refusal) => {
        if (!refusal) return null;
        if (refusal.code === "draft-invalid") return Object.values(refusal.details)[0]!;
        if (refusal.code === "save-failed") return refusal.code;
        // No cell offers such a category, so reaching this is a bug, not a user mistake.
        throw new Error(`Refused unexpectedly: ${refusal.code}`);
      });
      leaving.current = saved;
      return saved;
    },
    [store],
  );

  // Leaving a field saves it, so a cell opens only once that save succeeds: a refused value then
  // stays in view under its own cell (FR-068).
  const edit = useCallback(async (id: string, column: Column) => {
    if (leaving.current && (await leaving.current) !== null) return;
    setEditing({ id, column });
  }, []);

  // Only the cell that asks may close: a cell left with a save still running closes after the next
  // one has opened.
  const stopEditing = useCallback((id: string, column: Column) => {
    leaving.current = null;
    setEditing((current) => (current?.id === id && current.column === column ? null : current));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Transactions</h1>

      {transactions.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
          <p>No transactions yet. Record your first one, or import a bank file.</p>
          <div className="flex gap-2">
            <Button onClick={() => openForm(null)}>Add transaction</Button>
            <a href="#/import" className={buttonVariants({ variant: "outline" })}>
              Import a CSV
            </a>
          </div>
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
            <Field className="w-64">
              <FieldLabel htmlFor="filter-category">Category</FieldLabel>
              <Select value={categoryId} onValueChange={(id) => setCategoryId(id ?? ALL)}>
                <SelectTrigger id="filter-category" className="w-full">
                  <SelectValue>
                    {(id: string) => {
                      const category = categoriesById.get(id);
                      if (!category) return "All categories";
                      // Both sides may hold the same name (FR-032), so the group tells them apart.
                      return (
                        <span className="flex min-w-0 items-center gap-1.5">
                          <CategoryChip category={category} />
                          <span className="shrink-0 text-muted-foreground">
                            · {sideNames[category.side]}
                          </span>
                        </span>
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  {categoryGroups.map((group, index) => (
                    <Fragment key={group.side}>
                      {index > 0 && <SelectSeparator className="my-1.5 bg-muted-foreground/40" />}
                      <SelectGroup>
                        <SelectLabel className="font-medium">{sideNames[group.side]}</SelectLabel>
                        {group.categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            <CategoryChip category={category} />
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </Fragment>
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
            <div className="rounded-lg border">
              <div
                data-column-headers
                className={cn(columns, "border-b py-2 text-xs font-medium text-muted-foreground")}
              >
                <span className="px-2">Date</span>
                <span className="px-2">Description</span>
                <span className="px-2">Category</span>
                <span className="px-2">Account</span>
                <span className="px-2 text-right">Amount</span>
              </div>
              {/* Lucide's pencil, drawn once and reused by every row's Edit transaction button: an
                  icon component in each row added about 0.8 s to the first render of 10,000 rows
                  in Firefox (R-21). */}
              <svg aria-hidden="true" className="absolute size-0">
                <symbol
                  id="edit-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
                  <path d="m15 5 4 4" />
                </symbol>
              </svg>
              <ul aria-label="Transactions" className="flex flex-col divide-y">
                {listed.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    category={
                      transaction.kind === "transfer"
                        ? undefined
                        : categoriesById.get(transaction.categoryId)
                    }
                    accountName={accountsById.get(transaction.accountId)?.name}
                    destinationName={
                      transaction.kind === "transfer"
                        ? accountsById.get(transaction.destinationAccountId)?.name
                        : undefined
                    }
                    editing={editing?.id === transaction.id ? editing.column : null}
                    onEdit={edit}
                    onSave={saveCell}
                    onStopEditing={stopEditing}
                    onOpenForm={openForm}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
