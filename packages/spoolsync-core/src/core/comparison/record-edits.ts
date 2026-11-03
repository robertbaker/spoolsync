import type { ComparableField } from "../model";
import type { FieldValue } from "./types";

/**
 * Field values to write to individual records, keyed by record key (`source:sourceId`). Unlike a
 * bulk edit, which follows a matched group, these belong to one service's record (an accepted data
 * cleanup of that record's own text and numbers). The plan applies them only where the record's
 * service stores the field, and a field the person resolved explicitly keeps their choice.
 */
export type RecordEdits = ReadonlyMap<string, Partial<Record<ComparableField, FieldValue>>>;

/**
 * Exact equality, unlike `valuesEqual`, which ignores case and spacing in text and small weight
 * differences. A cleanup that only changes capitalization (`esun` to `eSUN`) must still count as a
 * change.
 */
export function strictValuesEqual(a: FieldValue, b: FieldValue): boolean {
  if (Array.isArray(a) || Array.isArray(b))
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
  return a === b;
}
