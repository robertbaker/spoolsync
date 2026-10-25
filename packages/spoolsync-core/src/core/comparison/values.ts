import type { ComparableField } from "../model";
import type { FieldValue } from "./types";

const TOLERANCE: Partial<Record<ComparableField, number>> = {
  initialWeight: 0.5,
  remainingWeight: 0.5,
  emptySpoolWeight: 0.5,
  price: 0.005,
  density: 0.005,
  diameter: 0.005,
};

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

export function isBlank(value: FieldValue): boolean {
  return value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

/** Equality as a person would judge it: case and spacing in text, sub-gram weight noise ignored. */
export function valuesEqual(field: ComparableField, a: FieldValue, b: FieldValue): boolean {
  if (isBlank(a) || isBlank(b)) return isBlank(a) && isBlank(b);
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => v === b[i]);
  if (typeof a === "number" && typeof b === "number")
    return Math.abs(a - b) <= (TOLERANCE[field] ?? 0);
  if (typeof a === "string" && typeof b === "string") return normalizeText(a) === normalizeText(b);
  return a === b;
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
