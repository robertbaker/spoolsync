import { expect, test } from "bun:test";

import { DEFAULT_LOW_STOCK, isLowStockPercent, isRunningLow, lowStockRule } from "./stock";

const spool = (remainingWeight: number | null, initialWeight: number | null, archived = false) => ({
  remainingWeight,
  initialWeight,
  archived,
});

test("a spool at or under a fifth of its full weight is running low", () => {
  expect(isRunningLow(spool(200, 1000))).toBe(true);
  expect(isRunningLow(spool(201, 1000))).toBe(false);
  expect(isRunningLow(spool(0, 1000))).toBe(true);
  expect(isRunningLow(spool(120, 500))).toBe(false);
  expect(isRunningLow(spool(100, 500))).toBe(true);
});

test("without a full weight the fallback grams apply", () => {
  expect(isRunningLow(spool(100, null))).toBe(true);
  expect(isRunningLow(spool(101, null))).toBe(false);
  expect(isRunningLow(spool(50, 0))).toBe(true);
});

test("finished and unweighed spools are never reported as low", () => {
  expect(isRunningLow(spool(10, 1000, true))).toBe(false);
  expect(isRunningLow(spool(null, 1000))).toBe(false);
});

test("a custom threshold moves both the share and the fallback grams", () => {
  const tenPercent = lowStockRule(10);
  expect(tenPercent).toEqual({ fraction: 0.1, fallbackGrams: 50 });
  expect(isRunningLow(spool(150, 1000), tenPercent)).toBe(false);
  expect(isRunningLow(spool(100, 1000), tenPercent)).toBe(true);
  expect(isRunningLow(spool(60, null), tenPercent)).toBe(false);
  expect(lowStockRule(30).fallbackGrams).toBe(150);
  // The default rule is the 20 percent rule.
  expect(lowStockRule(20)).toEqual(DEFAULT_LOW_STOCK);
});

test("only whole percentages from 1 to 90 are accepted", () => {
  for (const good of [1, 20, 90]) expect(isLowStockPercent(good)).toBe(true);
  for (const bad of [0, 91, 12.5, -5, Number.NaN, "20", null])
    expect(isLowStockPercent(bad)).toBe(false);
  expect(() => lowStockRule(0)).toThrow("whole number from 1 to 90");
});
