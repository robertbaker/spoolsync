import {
  NATIVE_CROSS_ID,
  SOURCE_IDS,
  SOURCE_LABELS,
  type CommonSpool,
  type SourceId,
} from "../model";
import type { Groups } from "./groups";
import { recordKey, SOURCE_INDEX } from "./keys";
import type { RecordKey } from "./types";

/** Same ordering as `a.localeCompare(b)` (default locale, no options), minus the per-call setup. */
const IDENTITY_COLLATOR = new Intl.Collator();

/** The cross-id keys a record answers to, including its own native id. */
function identityKeys(spool: CommonSpool): string[] {
  const native = `${spool.source}:${spool.sourceId}`;
  const keys: string[] = [native];
  for (const source of SOURCE_IDS) {
    const id = spool.crossIds[NATIVE_CROSS_ID[source]];
    // A numeric id of zero is an id; an empty string is not.
    if (typeof id !== "number" && !id) continue;
    const key = `${source}:${id}`;
    if (key !== native && !keys.includes(key)) keys.push(key);
  }
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
  // Sort keys are computed once per claim, not once per comparison.
  const orderedClaims = [...claims]
    .map((claim) => ({
      claim,
      native: byKey.has(claim[0]) ? 1 : 0,
      source: SOURCE_INDEX.get(claim[0].slice(0, claim[0].indexOf(":"))) ?? -1,
    }))
    .sort(
      (a, b) =>
        b.native - a.native ||
        a.source - b.source ||
        IDENTITY_COLLATOR.compare(a.claim[0], b.claim[0]),
    )
    .map(({ claim }) => claim);
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
