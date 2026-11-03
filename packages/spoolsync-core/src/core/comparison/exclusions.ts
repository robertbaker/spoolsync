import type { ComparableField, SourceId } from "../model";
import type { PlannedChange } from "./types";

/** One individually selectable part of a planned change. */
export interface ChangePart {
  /** Stable for the same service, group and part; used to remember an exclusion. */
  key: string;
  kind: "field" | "links" | "create";
  field?: ComparableField;
}

function partKey(source: SourceId, groupId: string, part: string): string {
  return JSON.stringify([source, groupId, part]);
}

/**
 * The parts a user can leave out: each field of an update, the link IDs of an update, or a whole
 * creation. Excluding every part of an update drops the update.
 */
export function changeParts(change: PlannedChange): ChangePart[] {
  if (change.kind === "create")
    return [{ key: partKey(change.source, change.groupId, "create"), kind: "create" }];
  const parts: ChangePart[] = change.changes.map(({ field }) => ({
    key: partKey(change.source, change.groupId, `field:${field}`),
    kind: "field",
    field,
  }));
  if (Object.keys(change.links).length)
    parts.push({ key: partKey(change.source, change.groupId, "links"), kind: "links" });
  return parts;
}

/**
 * The plan without the excluded parts. A change with nothing left to write is removed. Pure;
 * neither input is modified.
 */
export function omitExcluded(
  plan: ReadonlyMap<SourceId, PlannedChange[]>,
  excluded: ReadonlySet<string>,
): Map<SourceId, PlannedChange[]> {
  const result = new Map<SourceId, PlannedChange[]>();
  for (const [source, changes] of plan) {
    if (excluded.size === 0) {
      result.set(source, changes);
      continue;
    }
    const kept: PlannedChange[] = [];
    for (const change of changes) {
      if (change.kind === "create") {
        if (!excluded.has(partKey(change.source, change.groupId, "create"))) kept.push(change);
        continue;
      }
      const fields = change.changes.filter(
        ({ field }) => !excluded.has(partKey(change.source, change.groupId, `field:${field}`)),
      );
      const links = excluded.has(partKey(change.source, change.groupId, "links"))
        ? {}
        : change.links;
      if (fields.length || Object.keys(links).length)
        kept.push({ ...change, changes: fields, links });
    }
    result.set(source, kept);
  }
  return result;
}
