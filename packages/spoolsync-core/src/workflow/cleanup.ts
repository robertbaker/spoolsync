import { toRecordEdits, type AcceptedCleanup } from "../core/cleanup/engine";
import type { CommonSpool, LoadResult } from "../core/model";
import { findDuplicateSpools, type DuplicateGroup } from "./duplicates";
import { spoolKey } from "./spool-key";

type Accepted = Pick<AcceptedCleanup, "spoolKey" | "field" | "after">;

/**
 * The loaded inventories as they would look with the given cleanups applied. Pure: the inputs are
 * not modified, and the copies are only for looking at (they keep the original `raw` record).
 */
export function applyCleanupToResults(
  results: readonly LoadResult[],
  accepted: Iterable<Accepted>,
): LoadResult[] {
  const edits = toRecordEdits(accepted);
  return results.map((result) => ({
    ...result,
    spools: result.spools.map((spool): CommonSpool => {
      const edit = edits.get(spoolKey(spool));
      return edit ? ({ ...spool, ...edit } as CommonSpool) : spool;
    }),
  }));
}

const groupSignature = (group: DuplicateGroup) => group.spools.map(spoolKey).sort().join("|");

/**
 * Duplicate groups that only appear once the accepted cleanups are applied: spools that differ in
 * spelling today (`Prusament Inc` and `Prusament`, `PLA Plus` and `PLA+`) but would then look like
 * one spool entered twice. Uses the same detection as the Load page, so it reports and never
 * merges.
 */
export function duplicatesAfterCleanup(
  results: readonly LoadResult[],
  accepted: Iterable<Accepted>,
): DuplicateGroup[] {
  const list = [...accepted];
  if (!list.length) return [];
  const known = new Set(findDuplicateSpools(results).map(groupSignature));
  return findDuplicateSpools(applyCleanupToResults(results, list)).filter(
    (group) => !known.has(groupSignature(group)),
  );
}
