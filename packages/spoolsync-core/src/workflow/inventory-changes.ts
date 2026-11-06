import type { CommonSpool } from "../core/model";

/** The few facts kept about a spool between visits: its id, remaining grams, and name. */
export type SpoolFingerprint = readonly [id: string, remaining: number | null, name: string | null];

/** A compact summary of one service's spools: enough to tell what changed, never the full record. */
export function fingerprintSpools(spools: readonly CommonSpool[]): SpoolFingerprint[] {
  return spools.map((spool) => [
    spool.sourceId,
    spool.remainingWeight !== null && Number.isFinite(spool.remainingWeight)
      ? spool.remainingWeight
      : null,
    spool.name,
  ]);
}

export interface WeightChange {
  id: string;
  name: string | null;
  before: number;
  after: number;
  /** Negative when the spool lost filament. */
  delta: number;
}

export interface InventoryChanges {
  added: Array<{ id: string; name: string | null }>;
  removed: Array<{ id: string; name: string | null }>;
  /** Spools with less filament than before, biggest drop first. */
  drops: WeightChange[];
  /** Spools with more filament than before (refilled, corrected, or re-weighed). */
  gains: WeightChange[];
  /** Spools present both times whose weight did not change or is unknown on either side. */
  unchanged: number;
}

const NUMERIC_COLLATOR = new Intl.Collator(undefined, { numeric: true });

const byId = (a: { id: string }, b: { id: string }) => NUMERIC_COLLATOR.compare(a.id, b.id);

/**
 * What happened between two loads of the same service, by spool id. Weights within half a gram
 * count as unchanged, since services round differently. Ordering is deterministic.
 */
export function diffFingerprints(
  previous: readonly SpoolFingerprint[],
  current: readonly SpoolFingerprint[],
): InventoryChanges {
  const before = new Map(previous.map(([id, remaining, name]) => [id, { remaining, name }]));
  const after = new Map(current.map(([id, remaining, name]) => [id, { remaining, name }]));
  const changes: InventoryChanges = { added: [], removed: [], drops: [], gains: [], unchanged: 0 };
  for (const [id, now] of after) {
    const was = before.get(id);
    if (!was) {
      changes.added.push({ id, name: now.name });
      continue;
    }
    if (was.remaining === null || now.remaining === null) {
      changes.unchanged += 1;
      continue;
    }
    const delta = Math.round((now.remaining - was.remaining) * 10) / 10;
    if (Math.abs(delta) < 0.5) {
      changes.unchanged += 1;
      continue;
    }
    const change = {
      id,
      name: now.name ?? was.name,
      before: was.remaining,
      after: now.remaining,
      delta,
    };
    (delta < 0 ? changes.drops : changes.gains).push(change);
  }
  for (const [id, was] of before) if (!after.has(id)) changes.removed.push({ id, name: was.name });
  changes.added.sort(byId);
  changes.removed.sort(byId);
  changes.drops.sort((a, b) => a.delta - b.delta || byId(a, b));
  changes.gains.sort((a, b) => b.delta - a.delta || byId(a, b));
  return changes;
}

export function hasChanges(changes: InventoryChanges): boolean {
  return Boolean(
    changes.added.length || changes.removed.length || changes.drops.length || changes.gains.length,
  );
}
