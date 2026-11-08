import { store } from "./groups";
import {
  BACKUP_LIMITS,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  isValidEntry,
  portableKeys,
} from "./portable";

/** The portable settings as a JSON document. Credentials and loaded inventories are never included. */
export function exportSettings(now: Date = new Date()): string {
  const entries: Record<string, string> = {};
  const storage = store("local");
  if (storage)
    for (const key of portableKeys()) {
      const value = storage.getItem(key);
      if (value !== null && isValidEntry(key, value)) entries[key] = value;
    }
  return `${JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now.toISOString(), entries }, null, 2)}\n`;
}

export interface ImportResult {
  imported: string[];
  skipped: string[];
}

/**
 * Applies an exported settings document. Only portable keys with valid values are written; anything
 * else is skipped and named, so a hand-edited or hostile file cannot change credentials or store
 * arbitrary data. Throws when the text is not a SpoolSync settings export at all.
 */
export function importSettings(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON. Choose a settings file exported from SpoolSync.");
  }
  const document = parsed as { format?: unknown; version?: unknown; entries?: unknown };
  if (!document || typeof document !== "object" || document.format !== EXPORT_FORMAT)
    throw new Error("This is not a SpoolSync settings export.");
  if (document.version !== EXPORT_VERSION)
    throw new Error(
      `This export is version ${String(document.version)}, which this page cannot read.`,
    );
  if (!document.entries || typeof document.entries !== "object" || Array.isArray(document.entries))
    throw new Error("This settings export has no entries.");
  const storage = store("local");
  if (!storage) throw new Error("Browser storage is unavailable, so settings cannot be imported.");
  const allowed = new Set(portableKeys());
  const result: ImportResult = { imported: [], skipped: [] };
  let total = 0;
  for (const [key, value] of Object.entries(document.entries as Record<string, unknown>)) {
    if (
      allowed.has(key) &&
      typeof value === "string" &&
      value.length <= BACKUP_LIMITS.entryBytes &&
      total + value.length <= BACKUP_LIMITS.totalBytes &&
      isValidEntry(key, value)
    ) {
      total += value.length;
      storage.setItem(key, value);
      result.imported.push(key);
    } else result.skipped.push(key);
  }
  return result;
}
