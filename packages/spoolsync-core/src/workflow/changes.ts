import type { CommonSpool } from "../core/model";

/** What a watcher remembers about one spool between runs. */
export interface SnapshotSpool {
  /** Stable record key, `source:id`. */
  key: string;
  /** A short human label, such as `Prusament PLA Galaxy Black`. */
  label: string;
  /** Remaining filament in grams, or `null` when unknown. */
  remainingGrams: number | null;
}

/** The parts of a run worth comparing with the next one. Plain data, safe to keep or serialize. */
export interface InventorySnapshot {
  /** Sorted by key. */
  spools: SnapshotSpool[];
  /** Pending possible matches as `key,key`, sorted. Empty when the run did not look for matches. */
  pendingMatches: string[];
}

export interface RemainingWeightChange {
  key: string;
  label: string;
  fromGrams: number | null;
  toGrams: number | null;
}

/** What changed from one snapshot to the next. Every list is sorted by key. */
export interface InventoryChanges {
  added: SnapshotSpool[];
  removed: SnapshotSpool[];
  remainingWeight: RemainingWeightChange[];
  /** Possible matches that were not pending in the previous run. */
  newPendingMatches: string[];
}

// Code-unit order, so the result does not depend on the machine's locale.
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const labelOf = (spool: CommonSpool) =>
  [spool.vendor, spool.material, spool.name].filter(Boolean).join(" ") || spool.sourceId;

/** Reduces spools and pending match pairs to a snapshot. Duplicate record keys keep the first. */
export function snapshotInventory(
  spools: readonly CommonSpool[],
  pendingMatches: readonly string[] = [],
): InventorySnapshot {
  const byKey = new Map<string, SnapshotSpool>();
  for (const spool of spools) {
    const key = `${spool.source}:${spool.sourceId}`;
    if (!byKey.has(key))
      byKey.set(key, { key, label: labelOf(spool), remainingGrams: spool.remainingWeight });
  }
  return {
    spools: [...byKey.values()].sort((a, b) => byText(a.key, b.key)),
    pendingMatches: [...new Set(pendingMatches)].sort(byText),
  };
}

/** The differences between two consecutive runs. A spool that is only relabelled is not a change. */
export function diffSnapshots(
  previous: InventorySnapshot,
  next: InventorySnapshot,
): InventoryChanges {
  const before = new Map(previous.spools.map((spool) => [spool.key, spool]));
  const after = new Map(next.spools.map((spool) => [spool.key, spool]));
  const remainingWeight: RemainingWeightChange[] = [];
  for (const spool of next.spools) {
    const old = before.get(spool.key);
    if (old && old.remainingGrams !== spool.remainingGrams)
      remainingWeight.push({
        key: spool.key,
        label: spool.label,
        fromGrams: old.remainingGrams,
        toGrams: spool.remainingGrams,
      });
  }
  const known = new Set(previous.pendingMatches);
  return {
    added: next.spools.filter((spool) => !before.has(spool.key)),
    removed: previous.spools.filter((spool) => !after.has(spool.key)),
    remainingWeight,
    newPendingMatches: next.pendingMatches.filter((pair) => !known.has(pair)),
  };
}

export function hasChanges(changes: InventoryChanges): boolean {
  return (
    changes.added.length > 0 ||
    changes.removed.length > 0 ||
    changes.remainingWeight.length > 0 ||
    changes.newPendingMatches.length > 0
  );
}

const grams = (value: number | null) => (value === null ? "unknown" : `${Math.round(value)} g`);

/** Plain-text lines for the changes, or an empty list when nothing changed. */
export function formatChanges(changes: InventoryChanges): string[] {
  if (!hasChanges(changes)) return [];
  return [
    "Changes since the last run:",
    ...changes.added.map((spool) => `  + added ${spool.key} (${spool.label})`),
    ...changes.removed.map((spool) => `  - removed ${spool.key} (${spool.label})`),
    ...changes.remainingWeight.map(
      (change) =>
        `  ~ ${change.key} (${change.label}): ${grams(change.fromGrams)} -> ${grams(change.toGrams)} remaining`,
    ),
    ...changes.newPendingMatches.map((pair) => `  ? new possible match ${pair}`),
  ];
}
