import { beforeEach, expect, test } from "bun:test";

import {
  DEFAULT_LOW_STOCK_PERCENT,
  currentLowStockRule,
  loadLowStockPercent,
  saveLowStockPercent,
} from "./low-stock";

beforeEach(() => localStorage.clear());

test("defaults to 20 percent and remembers a saved choice", () => {
  expect(DEFAULT_LOW_STOCK_PERCENT).toBe(20);
  expect(loadLowStockPercent()).toBe(20);
  saveLowStockPercent(30);
  expect(loadLowStockPercent()).toBe(30);
  expect(currentLowStockRule()).toEqual({ fraction: 0.3, fallbackGrams: 150 });
});

test("unusable saved values fall back to the default, and bad saves are ignored", () => {
  for (const bad of ["abc", "0", "95", "12.5", ""]) {
    localStorage.setItem("spoolsync:low-stock-percent", bad);
    expect(loadLowStockPercent()).toBe(20);
  }
  saveLowStockPercent(30);
  saveLowStockPercent(1000);
  expect(loadLowStockPercent()).toBe(20);
});
