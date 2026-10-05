import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  draftOfProfile,
  newProfileDraft,
  withAmountMode,
  withHeaderRow,
  type ProfileDraft,
} from "@/domain/import/profiles";
import {
  DATE_FORMATS,
  ENCODINGS,
  type DateFormat,
  type DecimalSeparator,
  type MappingProfile,
  type Refusal,
} from "@/domain/types";
import { decodeFile, tokenise } from "@/files/csv";
import { saveProfile } from "@/store/import";
import { useStore, useStoreApi } from "@/store/store";
import { navigate } from "@/ui/app/router";
import { Button } from "@/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/ui/components/ui/field";
import { Input } from "@/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/ui/select";
import { Switch } from "@/ui/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/ui/components/ui/toggle-group";
import { messageFor, type MessageCode } from "@/ui/messages";
import { ProfilePreview, type SampleRecords } from "./ProfilePreview";

/** Header text with a header row, a 0-based position without one (data-model.md). */
type Column = string | number;

interface ColumnOption {
  value: Column;
  label: string;
}

const dateFormatExamples: Record<DateFormat, string> = {
  "DD.MM.YYYY": "03.09.2026",
  "DD.MM.YY": "03.09.26",
  "DD/MM/YYYY": "03/09/2026",
  "MM/DD/YYYY": "09/03/2026",
  "YYYY-MM-DD": "2026-09-03",
  "DD-MM-YYYY": "03-09-2026",
};

const decimalSeparators: { value: DecimalSeparator; label: string }[] = [
  { value: ",", label: "Comma (1.250,00)" },
  { value: ".", label: "Point (1,250.00)" },
];

const columnLabel = (column: Column) =>
  typeof column === "number" ? `Column ${column + 1}` : column;

/** The sample file's header texts, or "Column 1…n" with a sample value without a header row. */
function columnOptions(sample: SampleRecords, hasHeaderRow: boolean): ColumnOption[] {
  if (!Array.isArray(sample)) return [];
  if (hasHeaderRow) {
    const headers = (sample[0] ?? []).map((cell) => cell.trim()).filter(Boolean);
    return [...new Set(headers)].map((header) => ({ value: header, label: header }));
  }
  const records = sample.filter((record) => record.some((cell) => cell.trim() !== ""));
  const first = records[0] ?? [];
  const width = Math.max(0, ...records.slice(0, 10).map((record) => record.length));
  return Array.from({ length: width }, (_, position) => {
    const value = first[position]?.trim();
    return { value: position, label: `${columnLabel(position)}${value ? ` (${value})` : ""}` };
  });
}

function ColumnSelect({
  id,
  value,
  options,
  optional = false,
  onValueChange,
}: {
  id: string;
  value: Column | null;
  options: ColumnOption[];
  /** Offers "None", as the counterparty column does (FR-021). */
  optional?: boolean;
  onValueChange: (column: Column | null) => void;
}) {
  // A saved column stays visible before any sample file lists the columns.
  const shown =
    value === null || options.some((option) => option.value === value)
      ? options
      : [{ value, label: columnLabel(value) }, ...options];
  return (
    <Select<Column> value={value} onValueChange={(next) => onValueChange(next)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue>
          {(current: Column | null) =>
            current === null ? (
              <span className="text-muted-foreground">{optional ? "None" : "Choose a column"}</span>
            ) : (
              columnLabel(current)
            )
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {optional && <SelectItem value={null}>None</SelectItem>}
        {shown.map((option) => (
          <SelectItem key={String(option.value)} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LabelledField({
  id,
  label,
  children,
  error,
}: {
  id: string;
  label: string;
  children: ReactNode;
  error?: Refusal<MessageCode>;
}) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
      <FieldError>{error && messageFor(error)}</FieldError>
    </Field>
  );
}

interface Errors {
  name?: Refusal<MessageCode>;
  form?: Refusal<MessageCode>;
}

/** The profile editor's form, for a new profile or for editing `profile` (contracts/ui.md). */
function ProfileForm({ profile }: { profile: MappingProfile | null }) {
  const store = useStoreApi();
  const ids = {
    name: useId(),
    sample: useId(),
    header: useId(),
    encoding: useId(),
    dateFormat: useId(),
    decimal: useId(),
    date: useId(),
    amount: useId(),
    debit: useId(),
    credit: useId(),
    invert: useId(),
    description: useId(),
    counterparty: useId(),
  };
  const [draft, setDraft] = useState<ProfileDraft>(() =>
    profile ? draftOfProfile(profile) : newProfileDraft(),
  );
  const [sampleBytes, setSampleBytes] = useState<Uint8Array | null>(null);
  const [errors, setErrors] = useState<Errors>({});

  // The sample is decoded with the draft's encoding, so a wrong encoding shows at once.
  const sample: SampleRecords = useMemo(() => {
    if (!sampleBytes) return null;
    const text = decodeFile(sampleBytes, draft.encoding);
    return typeof text === "string" ? tokenise(text) : text;
  }, [sampleBytes, draft.encoding]);
  const options = useMemo(
    () => columnOptions(sample, draft.hasHeaderRow),
    [sample, draft.hasHeaderRow],
  );

  // Each value comes from `options`, whose variant matches `hasHeaderRow`.
  const setColumn = (
    field: "dateColumn" | "descriptionColumn" | "counterpartyColumn",
    value: Column | null,
  ) => setDraft({ ...draft, [field]: value } as ProfileDraft);
  const setAmountColumn = (
    field: "column" | "debitColumn" | "creditColumn",
    value: Column | null,
  ) => setDraft({ ...draft, amount: { ...draft.amount, [field]: value } } as ProfileDraft);

  async function chooseSample(file: File | undefined) {
    if (!file) return;
    try {
      setSampleBytes(new Uint8Array(await file.arrayBuffer()));
      setErrors({});
    } catch {
      setErrors({ form: { code: "import-file-unreadable" } });
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const refusal = await saveProfile(store, draft);
    if (!refusal) navigate("/import");
    else if (refusal.code === "profile-name-empty" || refusal.code === "profile-name-taken") {
      setErrors({ name: refusal });
    } else setErrors({ form: refusal });
  }

  const amount = draft.amount;
  return (
    <form onSubmit={submit} noValidate className="flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{profile ? "Edit profile" : "New profile"}</h1>
      <FieldGroup>
        <LabelledField id={ids.name} label="Name" error={errors.name}>
          <Input
            id={ids.name}
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            aria-invalid={errors.name ? true : undefined}
            autoComplete="off"
          />
        </LabelledField>

        <Field>
          <FieldLabel htmlFor={ids.sample}>Sample file</FieldLabel>
          <Input
            id={ids.sample}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(event) => void chooseSample(event.target.files?.[0])}
          />
          <FieldDescription>The preview and the column lists read this file.</FieldDescription>
        </Field>

        <Field orientation="horizontal">
          <Switch
            id={ids.header}
            checked={draft.hasHeaderRow}
            onCheckedChange={(checked) => setDraft(withHeaderRow(draft, checked))}
          />
          <FieldLabel htmlFor={ids.header}>First row contains column names</FieldLabel>
        </Field>

        <div className="grid grid-cols-3 gap-4">
          <LabelledField id={ids.encoding} label="Encoding">
            <Select
              value={draft.encoding}
              onValueChange={(encoding) => encoding && setDraft({ ...draft, encoding })}
            >
              <SelectTrigger id={ids.encoding} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENCODINGS.map((encoding) => (
                  <SelectItem key={encoding} value={encoding}>
                    {encoding}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabelledField>
          <LabelledField id={ids.dateFormat} label="Date format">
            <Select
              value={draft.dateFormat}
              onValueChange={(dateFormat) => dateFormat && setDraft({ ...draft, dateFormat })}
            >
              <SelectTrigger id={ids.dateFormat} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((format) => (
                  <SelectItem key={format} value={format}>
                    {format} ({dateFormatExamples[format]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabelledField>
          <LabelledField id={ids.decimal} label="Decimal separator">
            <Select
              items={decimalSeparators}
              value={draft.decimalSeparator}
              onValueChange={(separator) =>
                separator && setDraft({ ...draft, decimalSeparator: separator })
              }
            >
              <SelectTrigger id={ids.decimal} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {decimalSeparators.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabelledField>
        </div>

        <ToggleGroup
          aria-label="Amount"
          variant="outline"
          value={[amount.mode]}
          onValueChange={(values) => {
            const mode = values[0];
            if (mode === "signed" || mode === "debit-credit") {
              setDraft(withAmountMode(draft, mode));
            }
          }}
        >
          <ToggleGroupItem value="signed">One signed column</ToggleGroupItem>
          <ToggleGroupItem value="debit-credit">Separate debit and credit columns</ToggleGroupItem>
        </ToggleGroup>

        <div className="grid grid-cols-2 gap-4">
          <LabelledField id={ids.date} label="Date column">
            <ColumnSelect
              id={ids.date}
              value={draft.dateColumn}
              options={options}
              onValueChange={(column) => setColumn("dateColumn", column)}
            />
          </LabelledField>
          {amount.mode === "signed" ? (
            <LabelledField id={ids.amount} label="Amount column">
              <ColumnSelect
                id={ids.amount}
                value={amount.column}
                options={options}
                onValueChange={(column) => setAmountColumn("column", column)}
              />
            </LabelledField>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <LabelledField id={ids.debit} label="Debit column">
                <ColumnSelect
                  id={ids.debit}
                  value={amount.debitColumn}
                  options={options}
                  onValueChange={(column) => setAmountColumn("debitColumn", column)}
                />
              </LabelledField>
              <LabelledField id={ids.credit} label="Credit column">
                <ColumnSelect
                  id={ids.credit}
                  value={amount.creditColumn}
                  options={options}
                  onValueChange={(column) => setAmountColumn("creditColumn", column)}
                />
              </LabelledField>
            </div>
          )}
          <LabelledField id={ids.description} label="Description column">
            <ColumnSelect
              id={ids.description}
              value={draft.descriptionColumn}
              options={options}
              onValueChange={(column) => setColumn("descriptionColumn", column)}
            />
          </LabelledField>
          <LabelledField id={ids.counterparty} label="Counterparty column">
            <ColumnSelect
              id={ids.counterparty}
              value={draft.counterpartyColumn}
              options={options}
              optional
              onValueChange={(column) => setColumn("counterpartyColumn", column)}
            />
          </LabelledField>
        </div>

        {amount.mode === "signed" && (
          <Field orientation="horizontal">
            <Switch
              id={ids.invert}
              checked={amount.invertSign}
              onCheckedChange={(invertSign) =>
                setDraft({ ...draft, amount: { ...amount, invertSign } } as ProfileDraft)
              }
            />
            <FieldLabel htmlFor={ids.invert}>Invert the sign</FieldLabel>
            <FieldDescription>
              For exports that list purchases as positive numbers.
            </FieldDescription>
          </Field>
        )}
      </FieldGroup>

      <ProfilePreview draft={draft} sample={sample} />

      {errors.form && (
        <p role="alert" className="text-sm text-destructive">
          {messageFor(errors.form)}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit">Save profile</Button>
        <Button type="button" variant="outline" onClick={() => navigate("/import")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** The profile editor at `#/import/profiles/new` or `#/import/profiles/:id` (contracts/ui.md). */
export function ProfileEditor({ profileId }: { profileId: string | null }) {
  const profile = useStore((state) =>
    profileId === null ? null : (state.profiles.find((p) => p.id === profileId) ?? null),
  );
  if (profileId !== null && !profile) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
        <p>This profile does not exist. It may have been deleted.</p>
        <Button onClick={() => navigate("/import")}>Back to Import</Button>
      </div>
    );
  }
  return <ProfileForm profile={profile} />;
}
