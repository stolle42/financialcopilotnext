import { useId, useState } from "react";
import { isCalendarDate, periodPreset, type Period, type PeriodPreset } from "@/domain/dates";
import { todayLocal } from "@/store/clock";
import { Field, FieldError, FieldLabel } from "@/ui/components/ui/field";
import { Input } from "@/ui/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/ui/components/ui/toggle-group";
import { messageFor } from "@/ui/messages";

const PRESETS: { name: PeriodPreset; label: string }[] = [
  { name: "this-month", label: "This month" },
  { name: "last-month", label: "Last month" },
  { name: "last-3-months", label: "Last 3 months" },
  { name: "this-year", label: "This year" },
  { name: "last-year", label: "Last year" },
];

const isPeriod = ({ start, end }: Period) =>
  isCalendarDate(start) && isCalendarDate(end) && start <= end;

/**
 * The start and end date and the presets (FR-050). `onChange` hears only of a period that exists,
 * so while the dates are being typed the sections keep showing the last period they were given.
 */
export function PeriodPicker({
  period,
  onChange,
}: {
  period: Period;
  onChange: (period: Period) => void;
}) {
  const ids = { start: useId(), end: useId() };
  // What the date inputs show, which is not always a period yet.
  const [draft, setDraft] = useState(period);

  function change(next: Period) {
    setDraft(next);
    if (isPeriod(next)) onChange(next);
  }

  // A preset shows as pressed whenever the period is its range, whether it was chosen or typed.
  const today = todayLocal();
  const pressed = PRESETS.find(({ name }) => {
    const range = periodPreset(name, today);
    return range.start === period.start && range.end === period.end;
  })?.name;
  const invalid = !isPeriod(draft);

  return (
    <section aria-label="Period" className="flex flex-wrap items-end gap-4">
      <ToggleGroup
        aria-label="Period presets"
        variant="outline"
        value={pressed ? [pressed] : []}
        onValueChange={(values) => {
          // Pressing the pressed preset again would unpress it, but a period always has a range.
          const name = values[0] as PeriodPreset | undefined;
          if (name) change(periodPreset(name, todayLocal()));
        }}
      >
        {PRESETS.map(({ name, label }) => (
          <ToggleGroupItem key={name} value={name}>
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Field className="w-44" data-invalid={invalid ? true : undefined}>
        <FieldLabel htmlFor={ids.start}>Start date</FieldLabel>
        <Input
          id={ids.start}
          type="date"
          value={draft.start}
          onChange={(event) => change({ ...draft, start: event.target.value })}
          aria-invalid={invalid ? true : undefined}
        />
      </Field>
      <Field className="w-44" data-invalid={invalid ? true : undefined}>
        <FieldLabel htmlFor={ids.end}>End date</FieldLabel>
        <Input
          id={ids.end}
          type="date"
          value={draft.end}
          onChange={(event) => change({ ...draft, end: event.target.value })}
          aria-invalid={invalid ? true : undefined}
        />
      </Field>
      {invalid && (
        <FieldError className="basis-full">{messageFor({ code: "period-invalid" })}</FieldError>
      )}
    </section>
  );
}
