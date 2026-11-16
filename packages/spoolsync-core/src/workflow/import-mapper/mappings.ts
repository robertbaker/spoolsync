import { MAP_FIELDS, isWeightUnit, type ColumnMapping, type MapWeightUnit } from "./fields";

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

/** Keeps only well-formed, size-capped mapping records, so imported settings cannot break the UI. */
export function sanitizeColumnMaps(raw: unknown): SavedMappings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const entries: Array<[string, SavedMapping]> = [];
  for (const [signature, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!SIGNATURE.test(signature) || !value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const mapping = sanitizeMapping(item["mapping"]);
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
