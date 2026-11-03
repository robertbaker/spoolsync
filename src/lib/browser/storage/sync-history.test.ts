import { beforeEach, expect, test } from "bun:test";

import {
  MAX_SYNC_HISTORY,
  appendSyncHistory,
  clearSyncHistory,
  formatHistorySummary,
  readSyncHistory,
  recordSyncHistory,
  sanitizeSyncHistory,
  type SyncHistoryRecord,
} from "./sync-history";

beforeEach(() => localStorage.clear());

const record = (overrides: Partial<SyncHistoryRecord> = {}): SyncHistoryRecord => ({
  source: "spoolman",
  via: "api",
  updates: 2,
  creations: 1,
  succeeded: 3,
  failed: 0,
  ...overrides,
});
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 3, 12, minutes));

test("records entries in time order and clears them", () => {
  expect(readSyncHistory()).toEqual([]);
  recordSyncHistory(record(), at(0));
  recordSyncHistory(record({ via: "download", source: "tigertag" }), at(5));
  const history = readSyncHistory();
  expect(history.map((entry) => entry.source)).toEqual(["spoolman", "tigertag"]);
  expect(history[0]!.at).toBe("2026-11-03T12:00:00.000Z");
  clearSyncHistory();
  expect(localStorage.getItem("spoolsync:sync-history")).toBeNull();
});

test("keeps only the newest entries", () => {
  let history = appendSyncHistory([], record(), at(0));
  for (let i = 1; i < MAX_SYNC_HISTORY + 20; i++)
    history = appendSyncHistory(history, record({ updates: i }), at(i));
  expect(history).toHaveLength(MAX_SYNC_HISTORY);
  expect(history.at(-1)!.updates).toBe(MAX_SYNC_HISTORY + 19);
  expect(history[0]!.updates).toBe(20);
});

test("sanitizing drops damaged entries and clamps what it keeps", () => {
  const history = sanitizeSyncHistory([
    { ...record(), at: "2026-11-03T12:00:00Z", error: "bad\nthing\u0000" + "x".repeat(500) },
    { ...record(), at: "not a date" },
    { ...record({ source: "nope" as never }), at: "2026-11-03T12:00:00Z" },
    { ...record({ via: "carrier pigeon" as never }), at: "2026-11-03T12:00:00Z" },
    { ...record({ updates: -1 }), at: "2026-11-03T12:00:00Z" },
    { ...record({ failed: Number.NaN }), at: "2026-11-03T12:00:00Z" },
    { ...record({ updates: 1.6 }), at: "2026-11-03T11:00:00Z", extra: "ignored" },
    null,
    "text",
  ]);
  expect(history).toHaveLength(2);
  // Re-ordered by time, rounded counts, no unknown keys.
  expect(history[0]).toEqual({ ...record({ updates: 2 }), at: "2026-11-03T11:00:00.000Z" });
  expect(history[1]!.error).toHaveLength(200);
  expect(history[1]!.error).not.toContain("\n");
  expect(sanitizeSyncHistory({ not: "an array" })).toEqual([]);
});

test("damaged stored JSON reads as empty", () => {
  localStorage.setItem("spoolsync:sync-history", "{oops");
  expect(readSyncHistory()).toEqual([]);
});

test("the summary is plain text, newest first, with totals", () => {
  expect(formatHistorySummary([])).toBe("SpoolSync history: no applies or downloads recorded.");
  let history = appendSyncHistory([], record({ failed: 1, succeeded: 2 }), at(0));
  history = appendSyncHistory(
    history,
    record({ source: "filamentdb", via: "download", updates: 1, creations: 0, succeeded: 1 }),
    at(30),
  );
  expect(formatHistorySummary(history).split("\n")).toEqual([
    "SpoolSync history: 2 entries (1 API write, 1 download, 1 failure)",
    "- 2026-11-03 12:30 UTC FilamentDB downloaded as a file: 1 update, 0 new; file ready to import",
    "- 2026-11-03 12:00 UTC Spoolman applied through the API: 2 updates, 1 new; 2 succeeded, 1 failed",
  ]);
});
