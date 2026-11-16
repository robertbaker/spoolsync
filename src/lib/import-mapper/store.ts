import {
  MAX_SAVED_MAPS,
  sanitizeColumnMaps,
  type SavedMapping,
  type SavedMappings,
} from "@spoolsync/core/import-mapper/mappings";

import { local, read, write } from "../browser/storage/access";
import type { ColumnMapping, MapWeightUnit } from "./fields";

/** Column mappings remembered per column layout (see `headerSignature`). */
export const COLUMN_MAPS_KEY = "spoolsync:column-maps";
const SIGNATURE = /^\d{1,5}-[0-9a-f]{8}$/;

export { MAX_SAVED_MAPS, sanitizeColumnMaps };
export type { SavedMapping, SavedMappings };

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
