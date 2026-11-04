import { pairKey } from "@spoolsync/core/core/match";
import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { SOURCE_IDS } from "@spoolsync/core/core/model";
import {
  checkInventoryHealth,
  diffFingerprints,
  duplicateKeys,
  findDuplicateSpools,
  fingerprintSpools,
  spoolKey,
  type DuplicateGroup,
  type HealthIssue,
  type HealthReport,
  type FingerprintChanges,
  type WeightChange,
} from "@spoolsync/core/workflow";

import type { InventorySnapshot } from "~/lib/browser/storage";
import { missingPriceKeys } from "~/lib/health-score";

/** The browser storage the insights need, injected so tests and pages can supply their own. */
export interface InsightsStorage {
  readSnapshot(source: SourceId): InventorySnapshot | null;
  saveSnapshot(source: SourceId, snapshot: InventorySnapshot): boolean;
  readWatchlist(): string[];
  toggleWatched(key: string): string[];
  /** Pairs (`pairKey` form) the person said are different spools; duplicates never include them. */
  readDifferentPairs?(): ReadonlySet<string>;
}

/** What a reloaded file looked like compared with the last one for the same service. */
export interface ServiceChanges {
  source: SourceId;
  /** The `loadedAt` of the inventory this describes; stale entries are dropped. */
  loadedAt: string;
  /** When the previous snapshot was taken, or `null` when there was none to compare with. */
  since: string | null;
  changes: FingerprintChanges | null;
  /** False when the inventory was too large to remember for next time. */
  remembered: boolean;
}

/** The narrowing the table offers: duplicates, watched spools, missing prices, or one health check. */
export type InsightFilter = "duplicates" | "watched" | "missing-price" | HealthIssue;

/** Derived reports for the loaded inventories, plus the per-visit change log and watchlist. */
export class LoadInsights {
  duplicates: DuplicateGroup[] = [];
  duplicateSpoolKeys: Set<string> = new Set();
  /** Spools with no usable price. Prices are not a health check in core, so the page tracks them. */
  missingPrice: Set<string> = new Set();
  /** Spools checked by the last refresh, for the data health score. */
  spoolCount = 0;
  health: HealthReport = checkInventoryHealth([]);
  readonly changes = new Map<SourceId, ServiceChanges>();
  watched: Set<string>;
  private filter: InsightFilter | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly results: ReadonlyMap<SourceId, LoadResult>,
    private readonly storage: InsightsStorage,
  ) {
    this.watched = new Set(storage.readWatchlist());
  }

  get activeFilter(): InsightFilter | null {
    return this.filter;
  }

  setFilter(filter: InsightFilter | null): void {
    this.filter = filter;
    for (const listener of this.listeners) listener();
  }

  onFilterChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  /** Recomputes reports from what is loaded now and forgets changes that no longer apply. */
  refresh(): void {
    const loaded = SOURCE_IDS.flatMap((source) => this.results.get(source) ?? []);
    const different = this.storage.readDifferentPairs?.();
    this.duplicates = findDuplicateSpools(
      loaded,
      different?.size
        ? { isDifferent: (a, b) => different.has(pairKey(spoolKey(a), spoolKey(b))) }
        : {},
    );
    this.duplicateSpoolKeys = duplicateKeys(this.duplicates);
    this.health = checkInventoryHealth(loaded);
    const spools = loaded.flatMap((result) => result.spools);
    this.spoolCount = spools.length;
    this.missingPrice = missingPriceKeys(spools, spoolKey);
    for (const [source, entry] of this.changes)
      if (this.results.get(source)?.loadedAt !== entry.loadedAt) this.changes.delete(source);
    // A filter whose spools are gone would show an empty table with no way to see why.
    if (this.filter && this.countFor(this.filter) === 0) this.filter = null;
  }

  countFor(filter: InsightFilter): number {
    if (filter === "duplicates") return this.duplicateSpoolKeys.size;
    if (filter === "watched") return this.loadedWatchedKeys().length;
    if (filter === "missing-price") return this.missingPrice.size;
    return this.health.counts[filter];
  }

  /** Whether a spool passes the active filter (everything does when none is set). */
  matches(spool: Parameters<typeof spoolKey>[0]): boolean {
    const key = spoolKey(spool);
    if (!this.filter) return true;
    if (this.filter === "duplicates") return this.duplicateSpoolKeys.has(key);
    if (this.filter === "watched") return this.watched.has(key);
    if (this.filter === "missing-price") return this.missingPrice.has(key);
    return this.health.byKey.get(key)?.includes(this.filter) ?? false;
  }

  /**
   * Compares a freshly loaded file with the snapshot remembered from last time, then remembers this
   * one. The comparison is made before the snapshot is replaced, and only files take part: an API
   * fetch reflects live state and is not a "reload of a file".
   */
  fileLoaded(result: LoadResult): void {
    const previous = this.storage.readSnapshot(result.source);
    const current = fingerprintSpools(result.spools);
    const remembered = this.storage.saveSnapshot(result.source, {
      savedAt: result.loadedAt,
      spools: current,
    });
    this.changes.set(result.source, {
      source: result.source,
      loadedAt: result.loadedAt,
      since: previous?.savedAt ?? null,
      changes: previous ? diffFingerprints(previous.spools, current) : null,
      remembered,
    });
  }

  /** Pinned spools that are currently loaded, in the order they were pinned. */
  loadedWatchedKeys(): string[] {
    const present = new Set(
      [...this.results.values()].flatMap((result) => result.spools.map(spoolKey)),
    );
    return [...this.watched].filter((key) => present.has(key));
  }

  /** Weight drops from the latest reload, by spool key. */
  drops(): Map<string, WeightChange> {
    const drops = new Map<string, WeightChange>();
    for (const [source, entry] of this.changes)
      for (const drop of entry.changes?.drops ?? []) drops.set(`${source}:${drop.id}`, drop);
    return drops;
  }

  /** Pinned spools whose weight dropped in the latest reload. */
  droppedWatched(): Map<string, WeightChange> {
    const drops = this.drops();
    return new Map([...drops].filter(([key]) => this.watched.has(key)));
  }

  toggleWatch(key: string): void {
    this.watched = new Set(this.storage.toggleWatched(key));
  }
}
