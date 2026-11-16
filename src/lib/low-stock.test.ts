import { beforeEach, expect, test } from "bun:test";

import {
  DEFAULT_LOW_STOCK_PERCENT,
  currentLowStockRule,
  loadLowStockPolicy,
  loadLowStockPercent,
  saveLowStockOverrides,
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

test("loads saved low-stock overrides and ignores malformed data", () => {
  localStorage.setItem(
    "spoolsync:low-stock-rules",
    '{"brands":{"prusament":40},"materials":{"petg":30},"spools":{"spoolio:one":50}}',
  );
  expect(loadLowStockPolicy()).toEqual({
    defaultPercent: 20,
    overrides: {
      brands: { prusament: 40 },
      materials: { petg: 30 },
      spools: { "spoolio:one": 50 },
    },
  });
  localStorage.setItem("spoolsync:low-stock-rules", "{");
  expect(loadLowStockPolicy().overrides).toEqual({ brands: {}, materials: {}, spools: {} });
});

test("saves only sanitized low-stock overrides and removes an empty set", () => {
  expect(
    saveLowStockOverrides({
      brands: { PRUSAMENT: 40 },
      materials: { petg: 30 },
      spools: { "spoolio:one": 50 },
    }),
  ).toBe(true);
  expect(loadLowStockPolicy().overrides.brands).toEqual({ prusament: 40 });
  expect(saveLowStockOverrides({ brands: {}, materials: {}, spools: {} })).toBe(true);
  expect(localStorage.getItem("spoolsync:low-stock-rules")).toBeNull();
});
