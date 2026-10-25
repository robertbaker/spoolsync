import { SOURCE_IDS, SOURCE_LABELS, type CommonSpool, type SourceId } from "../model";
import type { Groups } from "./groups";
import { recordKey } from "./keys";
import type { RecordKey } from "./types";

/** The cross-id keys a record answers to, including its own native id. */
function identityKeys(spool: CommonSpool): string[] {
  const keys = new Set<string>([`${spool.source}:${spool.sourceId}`]);
  const {
    spoolmanId,
    spoolstockShortId,
    spoolioId,
    tigertagUid,
    threeDfpId,
    bambuddyId,
    filameterId,
    filadexId,
    filamentdbSerial,
  } = spool.crossIds;
  if (spoolmanId !== undefined) keys.add(`spoolman:${spoolmanId}`);
  if (spoolstockShortId) keys.add(`spoolstock:${spoolstockShortId}`);
  if (spoolioId) keys.add(`spoolio:${spoolioId}`);
  if (tigertagUid) keys.add(`tigertag:${tigertagUid}`);
  if (threeDfpId) keys.add(`threeDfp:${threeDfpId}`);
  if (bambuddyId !== undefined) keys.add(`bambuddy:${bambuddyId}`);
  if (filameterId) keys.add(`filameter:${filameterId}`);
  if (filadexId) keys.add(`filadex:${filadexId}`);
  if (filamentdbSerial) keys.add(`filamentdb:${filamentdbSerial}`);
  return [...keys];
}

export function linkIdentityClaims(
  spools: CommonSpool[],
  byKey: ReadonlyMap<RecordKey, CommonSpool>,
  groups: Groups,
): string[] {
  const problems: string[] = [];
  const claims = new Map<string, RecordKey[]>();
  for (const spool of spools) {
    for (const identity of identityKeys(spool)) {
      const keys = claims.get(identity);
      if (keys) keys.push(recordKey(spool));
      else claims.set(identity, [recordKey(spool)]);
    }
  }
  // Prefer identities backed by a loaded native record, then use the stable source order.
  // Ambiguous cross-ID claims must not produce different links when inputs are reordered.
  const orderedClaims = [...claims].sort(([a], [b]) => {
    const native = Number(byKey.has(b)) - Number(byKey.has(a));
    if (native) return native;
    const sourceA = SOURCE_IDS.indexOf(a.slice(0, a.indexOf(":")) as SourceId);
    const sourceB = SOURCE_IDS.indexOf(b.slice(0, b.indexOf(":")) as SourceId);
    return sourceA - sourceB || a.localeCompare(b);
  });
  for (const [identity, keys] of orderedClaims) {
    if (keys.length < 2) continue;
    // All or nothing: a partial link would quietly attach some claimants and not others.
    if (!groups.canUnionAll(keys)) {
      const [source, id] = identity.split(/:(.*)/s);
      problems.push(
        `${SOURCE_LABELS[source as SourceId] ?? source} ID ${id} is claimed by records that cannot all be the same spool: ${keys.join(", ")}. This ID was skipped for linking; check those records.`,
      );
      continue;
    }
    for (const other of keys.slice(1)) groups.union(keys[0]!, other);
  }

  return problems;
}
