/** Names compare by this key, so "Groceries" and " groceries" count as the same name (R-08). */
export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Whether another item already uses `name`; `exceptId` is the item being renamed. */
export function isNameTaken(
  items: readonly { id: string; name: string }[],
  name: string,
  exceptId?: string,
): boolean {
  const key = nameKey(name);
  return items.some((item) => item.id !== exceptId && nameKey(item.name) === key);
}

/** Orders names ignoring case, in the browser's language (contracts/ui.md, list order). */
export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}
