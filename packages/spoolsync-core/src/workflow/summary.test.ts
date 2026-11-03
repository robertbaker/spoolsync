import { expect, test } from "bun:test";

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
    warnings: 1,
  });
});

test("an empty inventory summarizes to zeros", () => {
  expect(
    summarizeInventory({ source: "spoolman", spools: [], warnings: [], loadedAt: "now" }),
  ).toMatchObject({ spools: 0, remainingGrams: 0, brands: 0 });
});
