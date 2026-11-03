import { COMPARABLE_FIELDS, type ComparableField } from "../model";
import type { FieldValue } from "../comparison/types";
import type { AcceptedCleanup } from "./engine";
import { CLEANUP_RULE_IDS, type CleanupRuleId } from "./types";

/** Which rules a person wants to run. The default is all of them. */
export interface CleanupSettings {
  enabled: CleanupRuleId[];
}

export const DEFAULT_CLEANUP_SETTINGS: CleanupSettings = { enabled: [...CLEANUP_RULE_IDS] };

/**
 * Keeps only known rule ids, in run order. Damaged or hand-edited storage falls back to every
 * rule; an explicit empty list stays empty (all rules switched off).
 */
export function sanitizeCleanupSettings(raw: unknown): CleanupSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { enabled: [...CLEANUP_RULE_IDS] };
  const enabled = (raw as Record<string, unknown>)["enabled"];
  if (!Array.isArray(enabled)) return { enabled: [...CLEANUP_RULE_IDS] };
  const wanted = new Set(enabled.filter((item): item is string => typeof item === "string"));
  return { enabled: CLEANUP_RULE_IDS.filter((id) => wanted.has(id)) };
}

const isFieldValue = (value: unknown): value is FieldValue =>
  value === null ||
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value)) ||
  (Array.isArray(value) && value.every((item) => typeof item === "string"));

/** Upper bound on stored accepted changes, so damaged storage cannot grow without limit. */
export const MAX_ACCEPTED_CLEANUPS = 20_000;

/** Validates stored accepted cleanups; anything malformed is dropped. */
export function sanitizeAcceptedCleanups(raw: unknown): AcceptedCleanup[] {
  if (!Array.isArray(raw)) return [];
  const accepted: AcceptedCleanup[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const { spoolKey, field, before, after } = entry;
    if (typeof spoolKey !== "string" || !spoolKey) continue;
    if (!COMPARABLE_FIELDS.includes(field as ComparableField)) continue;
    if (!isFieldValue(before) || !isFieldValue(after)) continue;
    const id = `${spoolKey}#${field as string}`;
    if (seen.has(id)) continue;
    seen.add(id);
    accepted.push({ spoolKey, field: field as ComparableField, before, after });
    if (accepted.length >= MAX_ACCEPTED_CLEANUPS) break;
  }
  return accepted;
}
