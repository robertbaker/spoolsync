import { local, read, write } from "./browser/storage/access";

/** The columns of the loaded-spools table, in display order. */
export const TABLE_COLUMNS = [
  "source",
  "id",
  "vendor",
  "material",
  "name",
  "color",
  "remaining",
  "location",
  "linked",
] as const;
export type TableColumn = (typeof TABLE_COLUMNS)[number];

/** The name column opens the spool drawer, so it cannot be hidden. */
export const REQUIRED_COLUMNS: readonly TableColumn[] = ["name"];

export const TABLE_COLUMNS_KEY = "spoolsync:table-columns";

export const isTableColumn = (value: unknown): value is TableColumn =>
  typeof value === "string" && (TABLE_COLUMNS as readonly string[]).includes(value);

/**
 * Keeps known columns once each, in table order, and always includes the required ones. Anything
 * else (damaged storage, a column removed in a later version) gives the full set.
 */
export function sanitizeColumns(raw: unknown): TableColumn[] {
  if (!Array.isArray(raw)) return [...TABLE_COLUMNS];
  const wanted = new Set(raw.filter(isTableColumn));
  for (const required of REQUIRED_COLUMNS) wanted.add(required);
  return TABLE_COLUMNS.filter((column) => wanted.has(column));
}

export const isDefaultColumns = (columns: readonly TableColumn[]): boolean =>
  columns.length === TABLE_COLUMNS.length;

export function readColumns(): TableColumn[] {
  try {
    return sanitizeColumns(JSON.parse(read(local, TABLE_COLUMNS_KEY) ?? "null"));
  } catch {
    return [...TABLE_COLUMNS];
  }
}

/** Saves the chosen columns; showing every column forgets the entry. Returns what was kept. */
export function saveColumns(columns: readonly string[]): TableColumn[] {
  const clean = sanitizeColumns(columns);
  write(local, TABLE_COLUMNS_KEY, isDefaultColumns(clean) ? null : JSON.stringify(clean));
  return clean;
}
