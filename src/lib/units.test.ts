import { beforeEach, expect, test } from "bun:test";

import {
  DISPLAY_CHANGED,
  formatMoney,
  formatWeight,
  gramsToUnit,
  readDisplaySettings,
  sanitizeDisplaySettings,
  unitToGrams,
  updateDisplaySettings,
} from "./units";

beforeEach(() => localStorage.clear());

test("defaults to grams and no currency symbol", () => {
  expect(readDisplaySettings()).toEqual({ weightUnit: "g", currency: "" });
});

test("ignores damaged or invalid stored values", () => {
  expect(sanitizeDisplaySettings(null)).toEqual({ weightUnit: "g", currency: "" });
  expect(sanitizeDisplaySettings([])).toEqual({ weightUnit: "g", currency: "" });
  expect(sanitizeDisplaySettings({ weightUnit: "lb", currency: "XXX" })).toEqual({
    weightUnit: "g",
    currency: "",
  });
  localStorage.setItem("spoolsync:display", "{nope");
  expect(readDisplaySettings()).toEqual({ weightUnit: "g", currency: "" });
});

test("saves changes, announces them, and forgets the defaults", () => {
  const seen: unknown[] = [];
  const listener = (event: Event) => seen.push((event as CustomEvent).detail);
  document.addEventListener(DISPLAY_CHANGED, listener);
  updateDisplaySettings({ weightUnit: "oz" });
  updateDisplaySettings({ currency: "EUR" });
  expect(readDisplaySettings()).toEqual({ weightUnit: "oz", currency: "EUR" });
  updateDisplaySettings({ weightUnit: "g", currency: "" });
  expect(localStorage.getItem("spoolsync:display")).toBeNull();
  document.removeEventListener(DISPLAY_CHANGED, listener);
  expect(seen).toHaveLength(3);
});

test("converts weights both ways", () => {
  expect(gramsToUnit(1000, "g")).toBe(1000);
  expect(gramsToUnit(28.349523125, "oz")).toBeCloseTo(1, 9);
  expect(unitToGrams(gramsToUnit(750, "oz"), "oz")).toBeCloseTo(750, 9);
});

test("formats weights and tolerates missing values", () => {
  expect(formatWeight(250, "g")).toBe("250 g");
  expect(formatWeight(1000, "oz")).toContain("oz");
  expect(formatWeight(null, "g")).toBe("–");
  expect(formatWeight(undefined, "oz")).toBe("–");
  expect(formatWeight(Number.NaN, "g")).toBe("–");
  updateDisplaySettings({ weightUnit: "oz" });
  expect(formatWeight(28.349523125)).toBe("1 oz");
});

test("formats money with or without a symbol", () => {
  expect(formatMoney(12.5, "")).toBe("12.5");
  expect(formatMoney(12.5, "USD")).toContain("12.50");
  expect(formatMoney(Number.POSITIVE_INFINITY, "USD")).toBe("–");
  expect(formatMoney(3, "bogus" as never)).toContain("3");
});
