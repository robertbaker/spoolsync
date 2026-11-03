import { beforeEach, expect, test } from "bun:test";

import {
  MAX_SNAPSHOT_SPOOLS,
  MAX_WATCHED,
  SNAPSHOTS_KEY,
  WATCHLIST_KEY,
  clearSnapshots,
  clearWatchlist,
  forgetSnapshot,
  readSnapshot,
  readSnapshots,
  readWatchlist,
  sanitizeSnapshots,
  saveSnapshot,
  toggleWatched,
} from "./insights";

beforeEach(() => localStorage.clear());

const snapshot = (spools: Array<[string, number | null, string | null]>) => ({
  savedAt: "2026-11-03T10:00:00.000Z",
  spools,
});

test("remembers a compact snapshot per service and can forget one or all", () => {
  expect(readSnapshot("spoolio")).toBeNull();
  expect(saveSnapshot("spoolio", snapshot([["1", 500, "Blue"]]))).toBe(true);
  expect(saveSnapshot("spoolkeep", snapshot([["k", null, null]]))).toBe(true);
  expect(saveSnapshot("spoolio", snapshot([["1", 450, "Blue"]]))).toBe(true);
  expect(readSnapshot("spoolio")?.spools).toEqual([["1", 450, "Blue"]]);
  forgetSnapshot("spoolio");
  expect(Object.keys(readSnapshots())).toEqual(["spoolkeep"]);
  clearSnapshots();
  expect(localStorage.getItem(SNAPSHOTS_KEY)).toBeNull();
});

test("drops damaged entries, duplicate ids, unknown services, and long names", () => {
  const clean = sanitizeSnapshots({
    spoolio: {
      savedAt: "2026-11-03T10:00:00Z",
      spools: [
        ["1", 10, "x".repeat(500)],
        ["1", 20, "duplicate id"],
        ["2", Number.POSITIVE_INFINITY, null],
        ["3", "heavy", null],
        ["", 1, null],
        [4, 1, null],
        ["5", 1],
        "nonsense",
      ],
    },
    spoolkeep: { savedAt: "not a date", spools: [] },
    spoolman: { savedAt: "2026-11-03T10:00:00Z", spools: "no" },
    notAService: { savedAt: "2026-11-03T10:00:00Z", spools: [] },
  });
  expect(Object.keys(clean)).toEqual(["spoolio"]);
  expect(clean.spoolio!.spools).toHaveLength(1);
  expect(clean.spoolio!.spools[0]![2]).toHaveLength(80);
  expect(sanitizeSnapshots("[]")).toEqual({});
  localStorage.setItem(SNAPSHOTS_KEY, "{broken");
  expect(readSnapshots()).toEqual({});
});

test("a snapshot over the size cap is refused and the older one is kept", () => {
  saveSnapshot("spoolio", snapshot([["1", 1, null]]));
  const tooMany = Array.from({ length: MAX_SNAPSHOT_SPOOLS + 1 }, (_, n) => [String(n), 1, null]);
  expect(saveSnapshot("spoolio", snapshot(tooMany as never))).toBe(false);
  expect(readSnapshot("spoolio")?.spools).toEqual([["1", 1, null]]);
  const heavy = Array.from({ length: MAX_SNAPSHOT_SPOOLS }, (_, n) => [
    `${"i".repeat(190)}${n}`,
    1,
    "n".repeat(80),
  ]);
  expect(saveSnapshot("spoolman", snapshot(heavy as never))).toBe(false);
  expect(readSnapshot("spoolman")).toBeNull();
});

test("watchlist pins and unpins, validates keys, and caps its size", () => {
  expect(toggleWatched("spoolio:1")).toEqual(["spoolio:1"]);
  expect(toggleWatched("spoolman:7")).toEqual(["spoolio:1", "spoolman:7"]);
  expect(toggleWatched("spoolio:1")).toEqual(["spoolman:7"]);
  localStorage.setItem(
    WATCHLIST_KEY,
    JSON.stringify(["spoolio:ok", "nowhere:1", "spoolio:", 5, "spoolio:ok", "nocolon"]),
  );
  expect(readWatchlist()).toEqual(["spoolio:ok"]);
  localStorage.setItem(
    WATCHLIST_KEY,
    JSON.stringify(Array.from({ length: MAX_WATCHED + 50 }, (_, n) => `spoolio:${n}`)),
  );
  expect(readWatchlist()).toHaveLength(MAX_WATCHED);
  expect(toggleWatched("spoolio:new")).not.toContain("spoolio:new");
  localStorage.setItem(WATCHLIST_KEY, "{broken");
  expect(readWatchlist()).toEqual([]);
  clearWatchlist();
  expect(localStorage.getItem(WATCHLIST_KEY)).toBeNull();
});
