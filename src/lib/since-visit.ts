import type { SourceId } from "@spoolsync/core/core/model";
import { sanitizeVisits, type VisitSummary } from "@spoolsync/core/workflow";

import { local, read, write } from "./browser/storage/access";

/** Compatibility entry point; comparison summaries live in the shared core package. */
export {
  MAX_LISTED,
  currentVisits,
  sanitizeVisits,
  summarizeVisit,
  visitHasChanges,
  visitText,
  visitTotals,
  type VisitSummary,
} from "@spoolsync/core/workflow";

export const SINCE_VISIT_KEY = "spoolsync:since-visit";

export function readVisits(): Partial<Record<SourceId, VisitSummary>> {
  try {
    return sanitizeVisits(JSON.parse(read(local, SINCE_VISIT_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

/** Keeps exactly these summaries (an empty list removes the entry). Returns false when it fails. */
export function writeVisits(visits: readonly VisitSummary[]): boolean {
  if (!visits.length) return write(local, SINCE_VISIT_KEY, null);
  return write(
    local,
    SINCE_VISIT_KEY,
    JSON.stringify(Object.fromEntries(visits.map((visit) => [visit.source, visit]))),
  );
}
