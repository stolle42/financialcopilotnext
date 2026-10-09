// Calendar dates are local `YYYY-MM-DD` strings, never Date objects, so no time zone can move a
// transaction to another day (R-08).

/** Number of days in `month` (1–12) of `year`. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** True only for a real date written as `YYYY-MM-DD`, so `2026-02-31` is false. */
export function isCalendarDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** The `YYYY-MM` month a date falls in. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** A span of days that includes both its start and its end date (R-14). */
export interface Period {
  start: string;
  end: string;
}

export type PeriodPreset =
  "this-month" | "last-month" | "last-3-months" | "this-year" | "last-year";

type DateParts = [year: number, month: number, day: number];

function partsOf(date: string): DateParts {
  return date.split("-").map(Number) as DateParts;
}

function dateOf(year: number, month: number, day: number): string {
  const pad = (value: number, width: number) => String(value).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** The first day of the month `months` months from `year` and `month` (1–12), which may be negative. */
function firstOfMonth(year: number, month: number, months = 0): [year: number, month: number] {
  const index = year * 12 + (month - 1) + months;
  return [Math.floor(index / 12), (index % 12) + 1];
}

function lastDayOf(year: number, month: number): string {
  return dateOf(year, month, daysInMonth(year, month));
}

/**
 * The days from a fixed origin to `date` in the proleptic Gregorian calendar. Subtracting two of
 * them counts calendar days, which milliseconds between `Date`s do not across a clock change.
 */
function dayNumber(date: string): number {
  const [year, month, day] = partsOf(date);
  const shiftedYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;
  const dayOfYear = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra;
}

/** The range of one of the presets of contracts/ui.md, insights, as seen on `today`. */
export function periodPreset(name: PeriodPreset, today: string): Period {
  const [year, month] = partsOf(today);
  switch (name) {
    case "this-month":
      return { start: dateOf(year, month, 1), end: lastDayOf(year, month) };
    case "last-month": {
      const [lastYear, lastMonth] = firstOfMonth(year, month, -1);
      return { start: dateOf(lastYear, lastMonth, 1), end: lastDayOf(lastYear, lastMonth) };
    }
    case "last-3-months": {
      const [fromYear, fromMonth] = firstOfMonth(year, month, -2);
      return { start: dateOf(fromYear, fromMonth, 1), end: lastDayOf(year, month) };
    }
    case "this-year":
      return { start: dateOf(year, 1, 1), end: today };
    case "last-year":
      return { start: dateOf(year - 1, 1, 1), end: dateOf(year - 1, 12, 31) };
  }
}

/** How many days the period spans, counting both ends. */
export function daysInPeriod(period: Period): number {
  return dayNumber(period.end) - dayNumber(period.start) + 1;
}

/** Every date of the period, in order, as the spending line's daily buckets. */
export function datesInPeriod(period: Period): string[] {
  const dates: string[] = [];
  let [year, month, day] = partsOf(period.start);
  for (let remaining = daysInPeriod(period); remaining > 0; remaining--) {
    dates.push(dateOf(year, month, day));
    if (day < daysInMonth(year, month)) {
      day += 1;
    } else {
      [year, month] = firstOfMonth(year, month, 1);
      day = 1;
    }
  }
  return dates;
}

/** Every `YYYY-MM` month the period touches, partial months at both ends included, in order. */
export function monthsInPeriod(period: Period): string[] {
  const months: string[] = [];
  const [endYear, endMonth] = partsOf(period.end);
  let [year, month] = partsOf(period.start);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(dateOf(year, month, 1).slice(0, 7));
    [year, month] = firstOfMonth(year, month, 1);
  }
  return months;
}
