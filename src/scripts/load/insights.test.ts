import { expect, test } from "bun:test";

import type { LoadResult, SourceId } from "@spoolsync/core/core/model";
import { makeSpool } from "@spoolsync/core/core/testing";

import type { InventorySnapshot } from "~/lib/browser/storage";

import { LoadInsights, type InsightsStorage } from "./insights";

function fakeStorage(watched: string[] = []) {
  const snapshots = new Map<SourceId, InventorySnapshot>();
  let list = [...watched];
  const storage: InsightsStorage = {
    readSnapshot: (source) => snapshots.get(source) ?? null,
    saveSnapshot: (source, snapshot) => {
      snapshots.set(source, snapshot);
      return true;
    },
    readWatchlist: () => list,
    toggleWatched: (key) =>
      (list = list.includes(key) ? list.filter((k) => k !== key) : [...list, key]),
  };
  return { storage, snapshots };
}

const load = (loadedAt: string, weights: Record<string, number>): LoadResult => ({
  source: "spoolio",
  spools: Object.entries(weights).map(([id, remainingWeight]) =>
    makeSpool("spoolio", id, { remainingWeight, name: `Spool ${id}`, location: "Shelf" }),
  ),
  warnings: [],
  loadedAt,
  origin: "file",
});

test("a first file has nothing to compare with, a reload reports changes, and both are remembered", () => {
  const results = new Map<SourceId, LoadResult>();
  const { storage, snapshots } = fakeStorage();
  const insights = new LoadInsights(results, storage);

  const first = load("2026-11-01T10:00:00.000Z", { a: 500, b: 300 });
  results.set("spoolio", first);
  insights.fileLoaded(first);
  expect(insights.changes.get("spoolio")).toMatchObject({ since: null, changes: null });
  expect(snapshots.get("spoolio")?.spools).toHaveLength(2);

  const second = load("2026-11-03T10:00:00.000Z", { a: 450, c: 100 });
  results.set("spoolio", second);
  insights.fileLoaded(second);
  const entry = insights.changes.get("spoolio")!;
  expect(entry.since).toBe("2026-11-01T10:00:00.000Z");
  expect(entry.changes?.added.map((s) => s.id)).toEqual(["c"]);
  expect(entry.changes?.removed.map((s) => s.id)).toEqual(["b"]);
  expect(entry.changes?.drops.map((s) => s.id)).toEqual(["a"]);
});

test("changes disappear when the service is unloaded or replaced by a newer inventory", () => {
  const results = new Map<SourceId, LoadResult>();
  const insights = new LoadInsights(results, fakeStorage().storage);
  const file = load("2026-11-01T10:00:00.000Z", { a: 500 });
  results.set("spoolio", file);
  insights.fileLoaded(file);
  insights.refresh();
  expect(insights.changes.size).toBe(1);
  results.set("spoolio", { ...file, loadedAt: "2026-11-02T10:00:00.000Z", origin: "api" });
  insights.refresh();
  expect(insights.changes.size).toBe(0);
});

test("pinned spools that lost weight are reported, and unpinned ones are not", () => {
  const results = new Map<SourceId, LoadResult>();
  const { storage } = fakeStorage(["spoolio:a"]);
  const insights = new LoadInsights(results, storage);
  for (const [loadedAt, weights] of [
    ["2026-11-01T10:00:00.000Z", { a: 500, b: 500 }],
    ["2026-11-03T10:00:00.000Z", { a: 400, b: 400 }],
  ] as const) {
    const result = load(loadedAt, weights);
    results.set("spoolio", result);
    insights.fileLoaded(result);
  }
  insights.refresh();
  expect([...insights.droppedWatched().keys()]).toEqual(["spoolio:a"]);
  expect(insights.loadedWatchedKeys()).toEqual(["spoolio:a"]);
  insights.toggleWatch("spoolio:b");
  expect([...insights.droppedWatched().keys()].sort()).toEqual(["spoolio:a", "spoolio:b"]);
});

test("filters narrow to duplicates, watched spools, or one health check, and reset when empty", () => {
  const results = new Map<SourceId, LoadResult>();
  const insights = new LoadInsights(results, fakeStorage(["spoolio:1"]).storage);
  const dup = { purchasedOn: "2026-01-01", remainingWeight: 500, location: "Shelf" };
  results.set("spoolio", {
    source: "spoolio",
    warnings: [],
    loadedAt: "now",
    spools: [
      makeSpool("spoolio", "1", dup),
      makeSpool("spoolio", "2", dup),
      makeSpool("spoolio", "3", { ...dup, material: "PETG", location: null }),
    ],
  });
  insights.refresh();
  const spools = results.get("spoolio")!.spools;
  const ids = () =>
    spools.filter((spool) => insights.matches(spool)).map((spool) => spool.sourceId);
  expect(ids()).toEqual(["1", "2", "3"]);
  insights.setFilter("duplicates");
  expect(ids()).toEqual(["1", "2"]);
  insights.setFilter("watched");
  expect(ids()).toEqual(["1"]);
  insights.setFilter("missing-location");
  expect(ids()).toEqual(["3"]);
  results.set("spoolio", { ...results.get("spoolio")!, spools: spools.slice(0, 2) });
  insights.refresh();
  expect(insights.activeFilter).toBeNull();
});
