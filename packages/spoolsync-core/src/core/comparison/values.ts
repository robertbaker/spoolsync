import type { ComparableField, SourceId } from "../model";
import type { FieldValue } from "./types";

const TOLERANCE: Partial<Record<ComparableField, number>> = {
  initialWeight: 0.5,
  remainingWeight: 0.5,
  emptySpoolWeight: 0.5,
  price: 0.005,
  density: 0.005,
  diameter: 0.005,
  td: 0.005,
  // Spoolman stores temperatures as integers, so 215.5 comes back as 216.
  nozzleTempMin: 0.5,
  nozzleTempMax: 0.5,
  bedTempMin: 0.5,
  bedTempMax: 0.5,
};

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

export function isBlank(value: FieldValue): boolean {
  return value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

/** True when `field` compares numbers within a tolerance rather than exactly. */
export const hasTolerance = (field: ComparableField): boolean => TOLERANCE[field] !== undefined;

/**
 * Splits numbers into runs where each value is within the field's tolerance of the run's lowest
 * value. Walking the values in sorted order makes the result independent of the order they are
 * given in (a chain such as 215, 215.5, 216 is not split differently by who is listed first).
 * Returns each value's cluster index, in input order.
 */
export function clusterByTolerance(field: ComparableField, values: readonly number[]): number[] {
  const tolerance = TOLERANCE[field] ?? 0;
  const order = values.map((_, index) => index).toSorted((x, y) => values[x]! - values[y]!);
  const cluster = Array.from<number>({ length: values.length });
  let base = Number.NaN;
  let current = -1;
  for (const index of order) {
    const value = values[index]!;
    if (current < 0 || value - base > tolerance) {
      current++;
      base = value;
    }
    cluster[index] = current;
  }
  return cluster;
}

/**
 * Equality as a person would judge it: case and spacing in text, sub-gram weight noise ignored.
 * `target` is the service the value is being compared for; Spoolman's 64-character cut applies only
 * to Spoolman. Without a target (comparing several services) the cut is allowed.
 */
export function valuesEqual(
  field: ComparableField,
  a: FieldValue,
  b: FieldValue,
  target?: SourceId,
): boolean {
  if (a === b) return true;
  if (isBlank(a) || isBlank(b)) return isBlank(a) && isBlank(b);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  if (typeof a === "number" && typeof b === "number")
    return Math.abs(a - b) <= (TOLERANCE[field] ?? 0);
  if (typeof a === "string" && typeof b === "string")
    return (
      normalizeText(a) === normalizeText(b) ||
      ((target === undefined || target === "spoolman") &&
        LIMITED_FIELDS.has(field) &&
        (cutToLimit(a, b) || cutToLimit(b, a)))
    );
  return false;
}

/**
 * Spoolman cuts text to 64 characters when writing. A stored value that is exactly the first 64
 * characters of a longer one is that same value after a write, not a disagreement, so a sync
 * converges instead of proposing the same change again.
 */
const TEXT_LIMIT = 64;
/** The fields Spoolman cuts; notes and every other field keep a strict comparison. */
const LIMITED_FIELDS: ReadonlySet<ComparableField> = new Set([
  "vendor",
  "material",
  "name",
  "upc",
  "location",
  "lotNr",
]);
function cutToLimit(stored: string, full: string): boolean {
  if (full.length <= TEXT_LIMIT) return false;
  const characters = Array.from(full);
  if (characters.length <= TEXT_LIMIT) return false;
  return normalizeText(characters.slice(0, TEXT_LIMIT).join("")) === normalizeText(stored);
}

export function formatValue(field: ComparableField, value: FieldValue): string {
  if (isBlank(value)) return "—";
  if (Array.isArray(value)) return value.map((hex) => `#${hex}`).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    const rounded = Number(value.toFixed(field === "density" || field === "diameter" ? 3 : 2));
    return String(rounded);
  }
  return String(value);
}
