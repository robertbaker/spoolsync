import { type GroupResolution } from "@spoolsync/core/core/compare";
import { canonicalDecisions, type MatchDecisions } from "@spoolsync/core/core/match";
import {
  COMPARABLE_FIELDS,
  SOURCE_IDS,
  WRITABLE_SOURCE_IDS,
  type ComparableField,
  type SourceId,
  type WritableSourceId,
} from "@spoolsync/core/core/model";

import { read, write, local, session } from "./access";

const DECISIONS_KEY = "spoolsync:match-decisions";
const RESOLUTIONS_KEY = "spoolsync:resolutions";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isComparableField = (value: string): value is ComparableField =>
  COMPARABLE_FIELDS.some((field) => field === value);

function validFieldValue(field: ComparableField, value: unknown): boolean {
  if (field === "colors")
    return Array.isArray(value) && value.every((color) => typeof color === "string");
  if (field === "archived") return typeof value === "boolean";
  if (
    [
      "diameter",
      "density",
      "nozzleTempMin",
      "nozzleTempMax",
      "bedTempMin",
      "bedTempMax",
      "initialWeight",
      "remainingWeight",
      "emptySpoolWeight",
      "price",
      "td",
    ].includes(field)
  )
    return value === null || (typeof value === "number" && Number.isFinite(value));
  return value === null || typeof value === "string";
}

/** Drops damaged session choices before they reach the planner's typed resolution logic. */
function sanitizeResolutions(raw: unknown): Map<string, GroupResolution> {
  const result = new Map<string, GroupResolution>();
  if (!Array.isArray(raw)) return result;
  for (const entry of raw) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string" || !entry[0] || !isRecord(entry[1]))
      continue;
    const candidate = entry[1];
    if (!isRecord(candidate.values) || !Array.isArray(candidate.createIn)) continue;
    if (candidate.seen !== undefined && !isRecord(candidate.seen)) continue;

    const values: GroupResolution["values"] = {};
    const seen: NonNullable<GroupResolution["seen"]> = {};
    for (const [rawField, value] of Object.entries(candidate.values)) {
      if (!isComparableField(rawField) || !validFieldValue(rawField, value)) continue;
      const previous = candidate.seen?.[rawField];
      if (candidate.seen !== undefined && previous !== undefined && !isRecord(previous)) continue;
      const fieldSeen: Partial<Record<SourceId, GroupResolution["values"][ComparableField]>> = {};
      if (isRecord(previous))
        for (const [rawSource, oldValue] of Object.entries(previous))
          if (
            SOURCE_IDS.some((source) => source === rawSource) &&
            validFieldValue(rawField, oldValue)
          )
            fieldSeen[rawSource as SourceId] =
              oldValue as GroupResolution["values"][ComparableField];
      values[rawField] = value as GroupResolution["values"][ComparableField];
      if (candidate.seen !== undefined) seen[rawField] = fieldSeen;
    }
    const createIn = [
      ...new Set(
        candidate.createIn.filter((source): source is WritableSourceId =>
          WRITABLE_SOURCE_IDS.some((valid) => valid === source),
        ),
      ),
    ];
    result.set(entry[0], {
      values,
      createIn,
      ...(candidate.seen === undefined ? {} : { seen }),
    });
  }
  return result;
}

/** Match confirmations and rejections, kept across visits so the same question is not asked twice. */
export function loadMatchDecisions(): MatchDecisions {
  const raw = read(local, DECISIONS_KEY);
  // Charts, the action bar and the Sync page ask on every render; parse only when the stored text
  // changed. Callers get their own arrays, so mutating a result never corrupts the cache.
  if (!lastDecisions || lastDecisions.raw !== raw)
    lastDecisions = { raw, decisions: parseDecisions(raw) };
  const { confirmed, rejected } = lastDecisions.decisions;
  return { confirmed: [...confirmed], rejected: [...rejected] };
}

let lastDecisions: { raw: string | null; decisions: MatchDecisions } | null = null;

function parseDecisions(raw: string | null): MatchDecisions {
  try {
    const parsed = JSON.parse(raw ?? "{}") as Partial<MatchDecisions>;
    // Decisions saved before `%` and `|` in record IDs were escaped are re-keyed on read.
    return canonicalDecisions({
      confirmed: Array.isArray(parsed.confirmed)
        ? parsed.confirmed.filter((p) => typeof p === "string")
        : [],
      rejected: Array.isArray(parsed.rejected)
        ? parsed.rejected.filter((p) => typeof p === "string")
        : [],
    });
  } catch {
    return { confirmed: [], rejected: [] };
  }
}

export function saveMatchDecisions(decisions: MatchDecisions): void {
  write(local, DECISIONS_KEY, JSON.stringify(decisions));
}

/** Choices made on the sync page, for this tab only. */
export function loadResolutions(): Map<string, GroupResolution> {
  try {
    return sanitizeResolutions(JSON.parse(read(session, RESOLUTIONS_KEY) ?? "[]"));
  } catch {
    return new Map();
  }
}

export function saveResolutions(resolutions: ReadonlyMap<string, GroupResolution>): void {
  write(session, RESOLUTIONS_KEY, JSON.stringify([...resolutions]));
}

export function clearResolutions(): void {
  write(session, RESOLUTIONS_KEY, null);
}

export function clearMatchDecisions(): void {
  write(local, DECISIONS_KEY, null);
}
