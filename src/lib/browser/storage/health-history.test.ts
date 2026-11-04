import { beforeEach, expect, test } from "bun:test";

import {
  MAX_HEALTH_POINTS,
  appendHealthPoint,
  clearHealthHistory,
  healthTrend,
  readHealthHistory,
  recordHealthPoint,
  sanitizeHealthHistory,
  type HealthPoint,
} from "./health-history";

beforeEach(() => localStorage.clear());

const point = (at: string, score: number, spools = 10): HealthPoint => ({ at, score, spools });

test("drops malformed points and sorts by time", () => {
  const clean = sanitizeHealthHistory([
    point("2026-02-01T00:00:00Z", 80),
    point("2026-01-01T00:00:00Z", 60.4),
    { at: "nope", score: 50, spools: 1 },
    { at: "2026-03-01T00:00:00Z", score: 101, spools: 1 },
    { at: "2026-03-01T00:00:00Z", score: -1, spools: 1 },
    { at: "2026-03-01T00:00:00Z", score: Number.NaN, spools: 1 },
    { at: "2026-03-01T00:00:00Z", score: 50 },
    null,
    "text",
  ]);
  expect(clean.map((entry) => entry.score)).toEqual([60, 80]);
  expect(sanitizeHealthHistory("not a list")).toEqual([]);
  expect(sanitizeHealthHistory(null)).toEqual([]);
});

test("an unchanged score is not recorded again within six hours", () => {
  const first = appendHealthPoint([], point("2026-01-01T00:00:00Z", 70));
  expect(appendHealthPoint(first, point("2026-01-01T03:00:00Z", 70))).toBe(first);
  expect(appendHealthPoint(first, point("2026-01-01T07:00:00Z", 70))).toHaveLength(2);
  // A different score or spool count is always recorded.
  expect(appendHealthPoint(first, point("2026-01-01T01:00:00Z", 71))).toHaveLength(2);
  expect(appendHealthPoint(first, point("2026-01-01T01:00:00Z", 70, 11))).toHaveLength(2);
  // A malformed point changes nothing.
  expect(appendHealthPoint(first, { at: "x", score: 1, spools: 1 })).toBe(first);
});

test("the history is capped, keeping the newest points", () => {
  let history: HealthPoint[] = [];
  for (let index = 0; index < MAX_HEALTH_POINTS + 15; index++)
    history = appendHealthPoint(
      history,
      point(new Date(Date.UTC(2026, 0, 1) + index * 86_400_000).toISOString(), index % 100),
    );
  expect(history).toHaveLength(MAX_HEALTH_POINTS);
  expect(history.at(-1)!.score).toBe((MAX_HEALTH_POINTS + 14) % 100);
});

test("the trend needs two points and reports the change", () => {
  expect(healthTrend([])).toBeNull();
  expect(healthTrend([point("2026-01-01T00:00:00Z", 50)])).toBeNull();
  const trend = healthTrend([
    point("2026-01-01T00:00:00Z", 50),
    point("2026-01-05T00:00:00Z", 40),
    point("2026-02-01T00:00:00Z", 65),
  ]);
  expect(trend).toMatchObject({ delta: 15, count: 3 });
  expect(trend!.first.score).toBe(50);
  expect(trend!.last.score).toBe(65);
});

test("records, reads back, survives damaged storage, and clears", () => {
  recordHealthPoint(point("2026-01-01T00:00:00Z", 55));
  recordHealthPoint(point("2026-01-02T00:00:00Z", 60));
  expect(readHealthHistory().map((entry) => entry.score)).toEqual([55, 60]);
  localStorage.setItem("spoolsync:health-history", "{not json");
  expect(readHealthHistory()).toEqual([]);
  recordHealthPoint(point("2026-01-03T00:00:00Z", 61));
  expect(readHealthHistory()).toHaveLength(1);
  clearHealthHistory();
  expect(readHealthHistory()).toEqual([]);
});
