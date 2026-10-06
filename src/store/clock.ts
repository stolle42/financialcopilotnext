const pad = (value: number) => String(value).padStart(2, "0");

/** Today's date in the user's own calendar, as `YYYY-MM-DD` (R-08). */
export function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
