import { sanitizeBulkEdit, type BulkEdit } from "@spoolsync/core/core/compare";

import { read, session, write } from "./access";

const KEY = "spoolsync:bulk-edits";
/** Upper bound on stored groups, so damaged storage cannot grow without limit. */
export const MAX_STORED_EDITS = 5000;

/** Keeps only well-formed edits keyed by a non-empty group id. */
export function sanitizeBulkEdits(raw: unknown): Map<string, BulkEdit> {
  const edits = new Map<string, BulkEdit>();
  if (!Array.isArray(raw)) return edits;
  for (const entry of raw) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string" || !entry[0]) continue;
    const edit = sanitizeBulkEdit(entry[1]);
    if (edit) edits.set(entry[0], edit);
    if (edits.size >= MAX_STORED_EDITS) break;
  }
  return edits;
}

/** Bulk edits made on the sync page, for this tab only (like the plan's resolutions). */
export function loadBulkEdits(): Map<string, BulkEdit> {
  try {
    return sanitizeBulkEdits(JSON.parse(read(session, KEY) ?? "[]"));
  } catch {
    return new Map();
  }
}

export function saveBulkEdits(edits: ReadonlyMap<string, BulkEdit>): void {
  write(session, KEY, edits.size ? JSON.stringify([...edits]) : null);
}

export function clearBulkEdits(): void {
  write(session, KEY, null);
}
