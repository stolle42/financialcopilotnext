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
