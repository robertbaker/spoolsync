import { expect, test } from "bun:test";

import { lowStockRule } from "../core/stock";
import { makeSpool } from "../core/testing";
import { summarizeInventory } from "./summary";

test("summarizes counts, distinct brands and materials, and known weight", () => {
  const summary = summarizeInventory({
    source: "spoolio",
    spools: [
      makeSpool("spoolio", "a", { vendor: "Prusa", material: "PLA", remainingWeight: 400.4 }),
      makeSpool("spoolio", "b", { vendor: "prusa", material: "PETG", remainingWeight: 200.3 }),
      makeSpool("spoolio", "c", {
        vendor: null,
        material: null,
        remainingWeight: null,
        archived: true,
      }),
    ],
    warnings: ["one"],
    loadedAt: "now",
  });
  expect(summary).toEqual({
    source: "spoolio",
    spools: 3,
    archived: 1,
    brands: 1,
    materials: 2,
    remainingGrams: 601,
    unknownWeights: 1,
    runningLow: 0,
    warnings: 1,
  });
});

test("an empty inventory summarizes to zeros", () => {
  expect(
    summarizeInventory({ source: "spoolman", spools: [], warnings: [], loadedAt: "now" }),
  ).toMatchObject({ spools: 0, remainingGrams: 0, brands: 0 });
});

test("counts spools that are running low, leaving finished and unweighed ones out", () => {
  const summary = summarizeInventory({
    source: "spoolio",
    spools: [
      makeSpool("spoolio", "a", { remainingWeight: 150, initialWeight: 1000 }),
      makeSpool("spoolio", "b", { remainingWeight: 900, initialWeight: 1000 }),
      makeSpool("spoolio", "c", { remainingWeight: 10, initialWeight: 1000, archived: true }),
      makeSpool("spoolio", "d", { remainingWeight: null }),
    ],
    warnings: [],
    loadedAt: "now",
  });
  expect(summary.runningLow).toBe(1);
});

test("a custom low-stock rule changes what counts as running low", () => {
  const result = {
    source: "spoolio" as const,
    spools: [
      makeSpool("spoolio", "a", { remainingWeight: 250, initialWeight: 1000 }),
      makeSpool("spoolio", "b", { remainingWeight: 90, initialWeight: 1000 }),
    ],
    warnings: [],
    loadedAt: "now",
  };
  expect(summarizeInventory(result).runningLow).toBe(1);
  expect(summarizeInventory(result, lowStockRule(30)).runningLow).toBe(2);
  expect(summarizeInventory(result, lowStockRule(5)).runningLow).toBe(0);
});
