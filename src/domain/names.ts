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
