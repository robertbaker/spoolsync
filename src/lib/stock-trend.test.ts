import { expect, test } from "bun:test";

import { combinedTrend, trendChange } from "./stock-trend";

const at = (day: number) => new Date(Date.UTC(2026, 10, day)).toISOString();

test("each moment sums the latest point of every service loaded by then", () => {
  const trend = combinedTrend({
    spoolman: [
      { at: at(1), totalGrams: 1000, spoolCount: 4 },
      { at: at(3), totalGrams: 700, spoolCount: 4 },
    ],
    spoolio: [{ at: at(2), totalGrams: 300, spoolCount: 2 }],
  });
  expect(trend).toEqual([
    { at: at(1), totalGrams: 1000, spoolCount: 4 },
    { at: at(2), totalGrams: 1300, spoolCount: 6 },
    { at: at(3), totalGrams: 1000, spoolCount: 6 },
  ]);
  expect(trendChange(trend)).toBe(0);
  expect(trendChange(trend.slice(1))).toBe(-300);
});

test("no history gives no trend and one point gives no change", () => {
  expect(combinedTrend({})).toEqual([]);
  expect(trendChange([])).toBeNull();
  expect(trendChange([{ at: at(1), totalGrams: 5, spoolCount: 1 }])).toBeNull();
});
