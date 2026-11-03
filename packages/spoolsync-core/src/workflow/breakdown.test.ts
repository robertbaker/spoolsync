import { expect, test } from "bun:test";

import type { LoadResult } from "../core/model";
import { makeSpool } from "../core/testing";
import { remainingBy, remainingByMaterial } from "./breakdown";

const none = { confirmed: [], rejected: [] };
const result = (source: "spoolman" | "spoolio", spools: LoadResult["spools"]): LoadResult => ({
  source,
  spools,
  warnings: [],
  loadedAt: "now",
});

test("groups remaining weight by material, case-insensitively, largest first", () => {
  const { rows, totalGrams } = remainingByMaterial(
    [
      result("spoolman", [
        makeSpool("spoolman", "1", { material: "PLA", name: "A", remainingWeight: 300 }),
        makeSpool("spoolman", "2", { material: "pla", name: "B", remainingWeight: 200 }),
        makeSpool("spoolman", "3", { material: "PETG", name: "C", remainingWeight: 700 }),
        makeSpool("spoolman", "4", { material: null, name: "D", remainingWeight: null }),
      ]),
    ],
    none,
  );
  expect(rows).toEqual([
    { material: "PETG", grams: 700, spools: 1 },
    { material: "PLA", grams: 500, spools: 2 },
    { material: "Unknown material", grams: 0, spools: 1 },
  ]);
  expect(totalGrams).toBe(1200);
});

test("a spool linked across services is counted once", () => {
  const breakdown = remainingByMaterial(
    [
      result("spoolman", [makeSpool("spoolman", "1", { material: "PLA", remainingWeight: 400 })]),
      result("spoolio", [
        makeSpool("spoolio", "a", {
          material: "PLA",
          remainingWeight: 380,
          crossIds: { spoolmanId: 1 },
        }),
      ]),
    ],
    none,
  );
  expect(breakdown.rows).toEqual([{ material: "PLA", grams: 400, spools: 1 }]);
  expect(breakdown.duplicatesRemoved).toBe(1);
  expect(breakdown.totalGrams).toBe(400);
});

test("only suggested look-alikes are not merged, and the tail folds into Other", () => {
  const spools = ["PLA", "PETG", "ABS", "ASA", "TPU"].map((material, index) =>
    makeSpool("spoolman", String(index + 1), {
      material,
      name: `Unique ${material}`,
      vendor: `Brand ${material}`,
      remainingWeight: 100 * (5 - index),
    }),
  );
  const { rows, duplicatesRemoved } = remainingByMaterial([result("spoolman", spools)], none, 3);
  expect(rows.map((row) => row.material)).toEqual(["PLA", "PETG", "ABS", "Other"]);
  expect(rows.at(-1)).toEqual({ material: "Other", grams: 300, spools: 2 });
  expect(duplicatesRemoved).toBe(0);
});

test("groups by brand, ignoring case and folding missing brands", () => {
  const { rows } = remainingBy(
    "vendor",
    [
      result("spoolman", [
        makeSpool("spoolman", "1", { vendor: "Prusament", name: "A", remainingWeight: 300 }),
        makeSpool("spoolman", "2", { vendor: "prusament", name: "B", remainingWeight: 200 }),
        makeSpool("spoolman", "3", { vendor: "Polymaker", name: "C", remainingWeight: 100 }),
        makeSpool("spoolman", "4", { vendor: null, name: "D", remainingWeight: 50 }),
      ]),
    ],
    none,
  );
  expect(rows).toEqual([
    { material: "Prusament", grams: 500, spools: 2 },
    { material: "Polymaker", grams: 100, spools: 1 },
    { material: "Unknown brand", grams: 50, spools: 1 },
  ]);
});

test("groups by color family using each spool's first color", () => {
  const { rows } = remainingBy(
    "color",
    [
      result("spoolman", [
        makeSpool("spoolman", "1", { colors: ["E53935"], name: "A", remainingWeight: 300 }),
        makeSpool("spoolman", "2", {
          colors: ["D62828", "000000"],
          name: "B",
          remainingWeight: 200,
        }),
        makeSpool("spoolman", "3", { colors: ["2244CC"], name: "C", remainingWeight: 100 }),
        makeSpool("spoolman", "4", { colors: [], name: "D", remainingWeight: 40 }),
      ]),
    ],
    none,
  );
  expect(rows).toEqual([
    { material: "Red", grams: 500, spools: 2 },
    { material: "Blue", grams: 100, spools: 1 },
    { material: "Unknown color", grams: 40, spools: 1 },
  ]);
});

test("groups by storage location and folds spools without one", () => {
  const { rows } = remainingBy(
    "location",
    [
      result("spoolman", [
        makeSpool("spoolman", "1", { location: "Shelf A", name: "A", remainingWeight: 300 }),
        makeSpool("spoolman", "2", { location: "shelf a ", name: "B", remainingWeight: 200 }),
        makeSpool("spoolman", "3", { location: "Dry box", name: "C", remainingWeight: 800 }),
        makeSpool("spoolman", "4", { location: null, name: "D", remainingWeight: 50 }),
      ]),
    ],
    none,
  );
  expect(rows).toEqual([
    { material: "Dry box", grams: 800, spools: 1 },
    { material: "Shelf A", grams: 500, spools: 2 },
    { material: "No location", grams: 50, spools: 1 },
  ]);
});
