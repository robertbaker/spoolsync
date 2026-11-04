import { local, read, write } from "../browser/storage/access";
import { MAP_FIELDS, isWeightUnit, type ColumnMapping, type MapWeightUnit } from "./fields";

/** Column mappings remembered per column layout (see `headerSignature`). */
export const COLUMN_MAPS_KEY = "spoolsync:column-maps";
/** Layouts kept; the least recently saved are dropped first. */
export const MAX_SAVED_MAPS = 20;
const MAX_HEADER_LENGTH = 200;
const SIGNATURE = /^\d{1,5}-[0-9a-f]{8}$/;

export interface SavedMapping {
  mapping: ColumnMapping;
  unit: MapWeightUnit;
  /** ISO timestamp of the last save. */
  savedAt: string;
}

export type SavedMappings = Record<string, SavedMapping>;

function sanitizeMapping(raw: unknown): ColumnMapping {
  const mapping: ColumnMapping = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return mapping;
  const input = raw as Record<string, unknown>;
  for (const field of MAP_FIELDS) {
    const header = Object.hasOwn(input, field) ? input[field] : undefined;
    if (typeof header === "string" && header.length > 0 && header.length <= MAX_HEADER_LENGTH)
      mapping[field] = header;
  }
  return mapping;
}

/**
 * Keeps only well-formed, size-capped entries, so damaged or hand-edited storage cannot break the
 * dialog.
 */
export function sanitizeColumnMaps(raw: unknown): SavedMappings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const entries: Array<[string, SavedMapping]> = [];
  for (const [signature, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!SIGNATURE.test(signature) || !value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const mapping = sanitizeMapping(item["mapping"]);
    // A key that is not a known field would have been dropped above; reject the entry if none remain.
    if (!Object.keys(mapping).length) continue;
    const savedAt = item["savedAt"];
    if (typeof savedAt !== "string" || Number.isNaN(Date.parse(savedAt))) continue;
    entries.push([
      signature,
      {
        mapping,
        unit: isWeightUnit(item["unit"]) ? item["unit"] : "g",
        savedAt: new Date(savedAt).toISOString(),
      },
    ]);
  }
  entries.sort((a, b) => Date.parse(a[1].savedAt) - Date.parse(b[1].savedAt));
  return Object.fromEntries(entries.slice(-MAX_SAVED_MAPS));
}

export function readColumnMaps(): SavedMappings {
  try {
    return sanitizeColumnMaps(JSON.parse(read(local, COLUMN_MAPS_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

export function readSavedMapping(signature: string): SavedMapping | null {
  const maps = readColumnMaps();
  return Object.hasOwn(maps, signature) ? maps[signature]! : null;
}

/** Remembers a mapping for a layout. Returns false when storage refused the write. */
export function saveColumnMapping(
  signature: string,
  mapping: ColumnMapping,
  unit: MapWeightUnit,
  now: Date = new Date(),
): boolean {
  if (!SIGNATURE.test(signature)) return false;
  const next = sanitizeColumnMaps({
    ...readColumnMaps(),
    [signature]: { mapping, unit, savedAt: now.toISOString() },
  });
  return write(local, COLUMN_MAPS_KEY, JSON.stringify(next));
}

/** Forgets the mapping saved for one layout. */
export function forgetColumnMapping(signature: string): void {
  const maps = readColumnMaps();
  if (!Object.hasOwn(maps, signature)) return;
  delete maps[signature];
  write(local, COLUMN_MAPS_KEY, Object.keys(maps).length ? JSON.stringify(maps) : null);
}
