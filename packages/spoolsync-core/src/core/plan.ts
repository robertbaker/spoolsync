import type { PlannedChange } from "./compare";
import type { WritableSourceId } from "./model";

/** Validate an entire batch before performing writes or serializing an export. */
export function validateTargetChanges(
  source: WritableSourceId,
  changes: readonly PlannedChange[],
  existingIds?: ReadonlySet<string>,
): void {
  const updatedIds = new Set<string>();
  const createdGroups = new Set<string>();
  for (const change of changes) {
    if (change.source !== source)
      throw new Error(`Cannot apply ${change.source} changes to a ${source} target.`);
    if (change.kind === "create") {
      if (createdGroups.has(change.groupId))
        throw new Error(`Duplicate creation for group "${change.groupId}". Rebuild the sync plan.`);
      createdGroups.add(change.groupId);
    } else {
      const id = change.spool.sourceId;
      if (change.spool.source !== source)
        throw new Error(`Cannot apply a ${change.spool.source} spool to a ${source} target.`);
      if (existingIds && !existingIds.has(id))
        throw new Error(
          `${source} spool "${id}" is missing from the target inventory. Rebuild the sync plan.`,
        );
      if (updatedIds.has(id))
        throw new Error(`Duplicate update for ${source} spool "${id}". Rebuild the sync plan.`);
      updatedIds.add(id);
    }
  }
}
