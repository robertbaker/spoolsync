import { expect, test } from "bun:test";

import { diffFingerprints } from "./inventory-changes";
import {
  MAX_LISTED,
  currentVisits,
  sanitizeVisits,
  summarizeVisit,
  visitHasChanges,
  visitText,
  visitTotals,
} from "./since-visit";

const grams = (value: number) => `${Math.round(value)} g`;

const before = [
  ["1", 800, "Teal PLA"],
  ["2", 300, "Red PETG"],
  ["3", 100, "Gone"],
  ["5", 400, "Same"],
] as const;
const after = [
  ["1", 500, "Teal PLA"],
  ["2", 350, "Red PETG"],
  ["4", 1000, "New one"],
  ["5", 400, "Same"],
] as const;

function visit() {
  return summarizeVisit({
    source: "spoolman",
    loadedAt: "2026-11-03T10:00:00.000Z",
    since: "2026-10-01T10:00:00.000Z",
    changes: diffFingerprints(before, after),
  })!;
}

test("summarizes what was used, refilled, added and removed", () => {
  const summary = visit();
  expect(summary.counts).toEqual({ added: 1, removed: 1, drops: 1, gains: 1 });
  expect(summary.unchanged).toBe(1);
  expect(summary.netGrams).toBe(-250);
  expect(summary.drops[0]).toMatchObject({ id: "1", delta: -300 });
  expect(visitHasChanges(summary)).toBe(true);
  expect(visitTotals([summary])).toEqual({ usedGrams: 300, refilledGrams: 50, spoolsChanged: 2 });
});

test("nothing to compare with gives no summary, and identical files give no changes", () => {
  expect(
    summarizeVisit({
      source: "spoolman",
      loadedAt: "x",
      since: null,
      changes: diffFingerprints(before, after),
    }),
  ).toBeNull();
  expect(
    summarizeVisit({
      source: "spoolman",
      loadedAt: "x",
      since: "2026-10-01T00:00:00Z",
      changes: null,
    }),
  ).toBeNull();
  const same = summarizeVisit({
    source: "spoolman",
    loadedAt: "x",
    since: "2026-10-01T00:00:00Z",
    changes: diffFingerprints(before, before),
  })!;
  expect(visitHasChanges(same)).toBe(false);
});

test("lists are capped but the counts stay true", () => {
  const many = Array.from(
    { length: MAX_LISTED + 10 },
    (_, index) => [`id${index}`, 100, `S${index}`] as const,
  );
  const summary = summarizeVisit({
    source: "spoolio",
    loadedAt: "x",
    since: "2026-10-01T00:00:00Z",
    changes: diffFingerprints([], many),
  })!;
  expect(summary.added).toHaveLength(MAX_LISTED);
  expect(summary.counts.added).toBe(MAX_LISTED + 10);
  expect(visitText([summary], grams)).toContain("...and 10 more added");
});

test("totals include changed spools beyond the displayed list cap", () => {
  const before = [
    ...Array.from({ length: MAX_LISTED + 10 }, (_, index) => [`drop${index}`, 500, null] as const),
    ...Array.from({ length: MAX_LISTED + 10 }, (_, index) => [`gain${index}`, 300, null] as const),
  ];
  const after = [
    ...Array.from({ length: MAX_LISTED + 10 }, (_, index) => [`drop${index}`, 300, null] as const),
    ...Array.from({ length: MAX_LISTED + 10 }, (_, index) => [`gain${index}`, 500, null] as const),
  ];
  const summary = summarizeVisit({
    source: "spoolman",
    loadedAt: "now",
    since: "before",
    changes: diffFingerprints(before, after),
  })!;
  expect(summary.drops).toHaveLength(MAX_LISTED);
  expect(summary.gains).toHaveLength(MAX_LISTED);
  expect(visitTotals([summary])).toEqual({
    usedGrams: (MAX_LISTED + 10) * 200,
    refilledGrams: (MAX_LISTED + 10) * 200,
    spoolsChanged: (MAX_LISTED + 10) * 2,
  });
});

test("sanitizing trims names and ignores junk lists", () => {
  const raw = {
    spoolman: {
      ...visit(),
      added: [{ id: "a", name: "x".repeat(500) }, { id: "", name: "bad" }, 5],
      drops: [
        { id: "1", name: null, before: 1, after: 0, delta: -1 },
        { id: "2", before: "x" },
      ],
    },
  };
  const clean = sanitizeVisits(raw).spoolman!;
  expect(clean.added).toHaveLength(1);
  expect(clean.added[0]!.name).toHaveLength(80);
  expect(clean.drops).toHaveLength(1);
});

test("sanitizing drops summaries whose counts contradict their listed changes", () => {
  const summary = visit();
  expect(
    sanitizeVisits({
      spoolman: {
        ...summary,
        counts: { ...summary.counts, drops: 0 },
      },
    }),
  ).toEqual({});
});

test("sanitizing drops weight changes whose delta disagrees with before and after", () => {
  const summary = visit();
  summary.drops[0]!.delta = -200;
  expect(sanitizeVisits({ spoolman: summary })).toEqual({});
});

test("stored summaries show only while their inventory is still the one loaded", () => {
  const stored = { spoolman: visit() };
  const loaded = new Map([["spoolman" as const, "2026-11-03T10:00:00.000Z"]]);
  expect(currentVisits(stored, [], loaded)).toHaveLength(1);
  // An API fetch replaced the file, so the old comparison no longer describes what is on screen.
  expect(
    currentVisits(stored, [], new Map([["spoolman" as const, "2026-11-04T09:00:00.000Z"]])),
  ).toEqual([]);
  expect(currentVisits(stored, [], new Map())).toEqual([]);
  const fresh = { ...visit(), loadedAt: "2026-11-04T09:00:00.000Z" };
  expect(
    currentVisits(stored, [fresh], new Map([["spoolman" as const, "2026-11-04T09:00:00.000Z"]])),
  ).toEqual([fresh]);
});

test("the copied text names each change and says when there is nothing", () => {
  const text = visitText([visit()], grams, () => "Oct 1");
  expect(text).toContain("Spoolman (compared with Oct 1)");
  expect(text).toContain("- Used 300 g: Teal PLA (ID 1) (800 g to 500 g)");
  expect(text).toContain("- Gained 50 g: Red PETG (ID 2) (300 g to 350 g)");
  expect(text).toContain("- Added: New one (ID 4)");
  expect(text).toContain("- Removed: Gone (ID 3)");
  expect(visitText([], grams)).toContain("no earlier file");
});
