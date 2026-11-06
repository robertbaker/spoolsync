import { SOURCE_LABELS, type CommonSpool, type SourceId } from "../model";
import type { Groups } from "./groups";
import { recordKey, SOURCE_INDEX } from "./keys";
import type { RecordKey } from "./types";

/** The cross-id keys a record answers to, including its own native id. */
function identityKeys(spool: CommonSpool): string[] {
  const native = `${spool.source}:${spool.sourceId}`;
  const keys: string[] = [native];
  const add = (key: string) => {
    if (key !== native && !keys.includes(key)) keys.push(key);
  };
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
    filamentDbAppId,
    spoolmasterId,
    spoolhoarderId,
    spoolappId,
    spoolkeepId,
  } = spool.crossIds;
  if (spoolmanId !== undefined) add(`spoolman:${spoolmanId}`);
  if (spoolstockShortId) add(`spoolstock:${spoolstockShortId}`);
  if (spoolioId) add(`spoolio:${spoolioId}`);
  if (tigertagUid) add(`tigertag:${tigertagUid}`);
  if (threeDfpId) add(`threeDfp:${threeDfpId}`);
  if (bambuddyId !== undefined) add(`bambuddy:${bambuddyId}`);
  if (filameterId) add(`filameter:${filameterId}`);
  if (filadexId) add(`filadex:${filadexId}`);
  if (filamentdbSerial) add(`filamentdb:${filamentdbSerial}`);
  if (filamentDbAppId) add(`filamentDbApp:${filamentDbAppId}`);
  if (spoolmasterId) add(`spoolmaster:${spoolmasterId}`);
  if (spoolhoarderId) add(`spoolhoarder:${spoolhoarderId}`);
  if (spoolappId) add(`spoolapp:${spoolappId}`);
  if (spoolkeepId) add(`spoolkeep:${spoolkeepId}`);
  return keys;
}

export function linkIdentityClaims(
  spools: CommonSpool[],
  byKey: ReadonlyMap<RecordKey, CommonSpool>,
  groups: Groups,
): string[] {
  const problems: string[] = [];
  const claims = new Map<string, RecordKey[]>();
  for (const spool of spools) {
    const key = recordKey(spool);
    for (const identity of identityKeys(spool)) {
      const keys = claims.get(identity);
      if (keys) keys.push(key);
      else claims.set(identity, [key]);
    }
  }
  // Prefer identities backed by a loaded native record, then use the stable source order.
  // Ambiguous cross-ID claims must not produce different links when inputs are reordered.
  const orderedClaims = [...claims].sort(([a], [b]) => {
    const native = Number(byKey.has(b)) - Number(byKey.has(a));
    if (native) return native;
    const sourceA = SOURCE_INDEX.get(a.slice(0, a.indexOf(":"))) ?? -1;
    const sourceB = SOURCE_INDEX.get(b.slice(0, b.indexOf(":"))) ?? -1;
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
