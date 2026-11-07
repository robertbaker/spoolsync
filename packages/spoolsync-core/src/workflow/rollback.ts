import { strictValuesEqual } from "../core/comparison/record-edits";
import type { FieldValue, PlannedChange, PlannedUpdate } from "../core/comparison/types";
import { valuesEqual } from "../core/comparison/values";
import {
  COMPARABLE_FIELDS,
  SOURCE_LABELS,
  isWritableSource,
  type ComparableField,
  type LoadResult,
  type WritableSourceId,
} from "../core/model";

/**
 * A rollback file records what a service held before SpoolSync wrote to it, so a sync can be taken
 * back. It stores the values of the fields that were changed (never the whole inventory), the value
 * each was changed to, and a short description of every spool that was created. It is plain JSON a
 * person can read.
 *
 * Restoring is conservative: a field is set back only while it still holds the value SpoolSync
 * wrote, so edits made since are never overwritten. Created spools are listed but never deleted,
 * and the cross-service ids SpoolSync stamped are left alone.
 */
export const ROLLBACK_FORMAT = "spoolsync-rollback";
export const ROLLBACK_VERSION = 1;

const MAX_UPDATES = 100_000;
const MAX_CHANGES_PER_SPOOL = 40;
const MAX_TEXT = 300;

export interface RollbackFieldChange {
  field: ComparableField;
  before: FieldValue;
  after: FieldValue;
}

export interface RollbackUpdate {
  /** The spool's id in the service. */
  sourceId: string;
  /** What the spool was called when it was changed, for a person reading the file. */
  label: string;
  changes: RollbackFieldChange[];
}

export interface RollbackCreation {
  label: string;
}

export interface RollbackDocument {
  format: typeof ROLLBACK_FORMAT;
  version: typeof ROLLBACK_VERSION;
  /** ISO time the file was made, just before the write. */
  createdAt: string;
  source: WritableSourceId;
  service: string;
  /** The server or file the write was aimed at, as the apply step described it. */
  target: string;
  updates: RollbackUpdate[];
  creations: RollbackCreation[];
  note: string;
}

const NOTE =
  "Restoring sets each field back only while it still holds the value in 'after'. Spools SpoolSync created are listed under 'creations' and must be deleted in the service by hand; cross-service ids that were added are not removed.";

const describeSpool = (
  vendor: string | null | undefined,
  material: string | null | undefined,
  name: string | null | undefined,
  fallback: string,
): string => {
  let s = "";
  if (vendor) s = vendor;
  if (material) s = s ? `${s} ${material}` : material;
  if (name) s = s ? `${s} ${name}` : name;
  return (s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) : s) || fallback;
};

/** The rollback for a set of planned changes, taken before any of them is written. */
export function buildRollback(
  source: WritableSourceId,
  changes: readonly PlannedChange[],
  info: { target: string; now: Date },
): RollbackDocument {
  const updates: RollbackUpdate[] = [];
  const creations: RollbackCreation[] = [];
  for (const change of changes) {
    if (change.kind === "create") {
      creations.push({
        label: describeSpool(
          change.values.vendor,
          change.values.material,
          change.values.name,
          "New spool",
        ),
      });
      continue;
    }
    // A change that only stamps cross-service ids has no field to put back.
    if (!change.changes.length) continue;
    const fields = change.changes.map((item) => ({
      field: item.field,
      before: item.from,
      after: item.to,
    }));
    updates.push({
      sourceId: change.spool.sourceId,
      label: describeSpool(
        change.spool.vendor,
        change.spool.material,
        change.spool.name,
        `Spool ${change.spool.sourceId}`,
      ),
      changes: fields,
    });
  }
  return {
    format: ROLLBACK_FORMAT,
    version: ROLLBACK_VERSION,
    createdAt: info.now.toISOString(),
    source,
    service: SOURCE_LABELS[source],
    target: info.target.slice(0, MAX_TEXT),
    updates,
    creations,
    note: NOTE,
  };
}

export function serializeRollback(document: RollbackDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isFieldValue = (value: unknown): value is FieldValue =>
  value === null ||
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value)) ||
  (Array.isArray(value) && value.length <= 20 && value.every((item) => typeof item === "string"));

const text = (value: unknown): string =>
  typeof value === "string" ? value.slice(0, MAX_TEXT) : "";

/**
 * Reads a rollback file. Anything that is not a rollback file of a service SpoolSync can write to
 * is refused with a plain message, and every entry is validated (a rollback file is data from
 * outside, and what it names is later written to a service).
 */
export function parseRollback(content: string): RollbackDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error("That file is not valid JSON, so it is not a SpoolSync rollback file.");
  }
  if (!isObject(raw) || raw["format"] !== ROLLBACK_FORMAT)
    throw new Error("That is not a SpoolSync rollback file.");
  if (raw["version"] !== ROLLBACK_VERSION)
    throw new Error(
      "That rollback file is from a different version of SpoolSync and cannot be read.",
    );
  const source = raw["source"];
  if (typeof source !== "string" || !isWritableSource(source as never))
    throw new Error("The rollback file names a service SpoolSync cannot write to.");
  if (!Array.isArray(raw["updates"]) || raw["updates"].length > MAX_UPDATES)
    throw new Error("The rollback file has no usable list of changes.");

  const updates: RollbackUpdate[] = [];
  for (const item of raw["updates"]) {
    if (!isObject(item) || typeof item["sourceId"] !== "string" || !item["sourceId"]) continue;
    if (!Array.isArray(item["changes"])) continue;
    const changes: RollbackFieldChange[] = [];
    for (const change of item["changes"].slice(0, MAX_CHANGES_PER_SPOOL)) {
      if (!isObject(change)) continue;
      const field = change["field"];
      if (!(COMPARABLE_FIELDS as readonly unknown[]).includes(field)) continue;
      if (!isFieldValue(change["before"]) || !isFieldValue(change["after"])) continue;
      changes.push({
        field: field as ComparableField,
        before: change["before"],
        after: change["after"],
      });
    }
    if (changes.length)
      updates.push({
        sourceId: item["sourceId"].slice(0, 200),
        label: text(item["label"]) || `Spool ${item["sourceId"]}`,
        changes,
      });
  }
  const creations = Array.isArray(raw["creations"])
    ? raw["creations"]
        .filter(isObject)
        .slice(0, MAX_UPDATES)
        .map((item) => ({ label: text(item["label"]) || "New spool" }))
    : [];
  if (!updates.length && !creations.length)
    throw new Error("The rollback file has nothing in it to restore.");
  const createdAt = typeof raw["createdAt"] === "string" ? raw["createdAt"] : "";
  return {
    format: ROLLBACK_FORMAT,
    version: ROLLBACK_VERSION,
    createdAt: Number.isNaN(Date.parse(createdAt)) ? "" : createdAt,
    source: source as WritableSourceId,
    service: SOURCE_LABELS[source as WritableSourceId],
    target: text(raw["target"]),
    updates,
    creations,
    note: NOTE,
  };
}

export interface RollbackSkip {
  label: string;
  /** The field that was left alone, or `null` for the whole spool. */
  field: ComparableField | null;
  reason: string;
}

export interface RollbackPlan {
  /** Updates that set fields back, ready for the ordinary apply step. */
  changes: PlannedUpdate[];
  /** How many individual fields will be set back. */
  fields: number;
  skipped: RollbackSkip[];
  /** Spools the original sync created, which have to be deleted by hand. */
  creations: RollbackCreation[];
}

/**
 * What can be restored now, against the service's current inventory. A field is put back only if it
 * still holds the value SpoolSync wrote; one that has changed again, a spool that is gone, and a
 * field that already has its earlier value are reported and left alone.
 */
export function planRollback(document: RollbackDocument, inventory: LoadResult): RollbackPlan {
  if (inventory.source !== document.source)
    throw new Error(
      `The rollback file is for ${document.service}, not ${SOURCE_LABELS[inventory.source] ?? inventory.source}.`,
    );
  const bySourceId = new Map(inventory.spools.map((spool) => [spool.sourceId, spool]));
  const changes: PlannedUpdate[] = [];
  const skipped: RollbackSkip[] = [];
  let fields = 0;
  for (const update of document.updates) {
    const spool = bySourceId.get(update.sourceId);
    if (!spool) {
      skipped.push({ label: update.label, field: null, reason: "is no longer in the service" });
      continue;
    }
    const restore = [];
    for (const change of update.changes) {
      const current = spool[change.field];
      const exactOnly = valuesEqual(change.field, change.before, change.after);
      const matchesAfter = exactOnly
        ? strictValuesEqual(current, change.after)
        : valuesEqual(change.field, current, change.after);
      const matchesBefore = exactOnly
        ? strictValuesEqual(current, change.before)
        : valuesEqual(change.field, current, change.before);
      if (matchesAfter) {
        restore.push({ field: change.field, from: current, to: change.before });
      } else if (matchesBefore) {
        skipped.push({
          label: update.label,
          field: change.field,
          reason: "already has its earlier value",
        });
      } else {
        skipped.push({
          label: update.label,
          field: change.field,
          reason: "was changed again after SpoolSync wrote it, so it is left as it is",
        });
      }
    }
    if (!restore.length) continue;
    fields += restore.length;
    changes.push({
      kind: "update",
      source: document.source,
      groupId: `rollback:${update.sourceId}`,
      spool,
      changes: restore,
      links: {},
    });
  }
  return { changes, fields, skipped, creations: document.creations };
}
