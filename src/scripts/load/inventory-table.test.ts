import { expect, test } from "bun:test";

import { makeSpool } from "@spoolsync/core/core/testing";

import { nextSort, sortSpools } from "./inventory-table";

test("clicking a column cycles ascending, descending, then back to the loaded order", () => {
  const first = nextSort(null, "vendor");
  expect(first).toEqual({ key: "vendor", direction: "asc" });
  const second = nextSort(first, "vendor");
  expect(second).toEqual({ key: "vendor", direction: "desc" });
  expect(nextSort(second, "vendor")).toBeNull();
  // Choosing another column starts over at ascending.
  expect(nextSort(second, "name")).toEqual({ key: "name", direction: "asc" });
});

test("sorting is a copy, numeric for weights, natural for text, and keeps blanks last", () => {
  const spools = [
    makeSpool("spoolio", "1", { name: "Color 10", remainingWeight: 500 }),
    makeSpool("spoolio", "2", { name: "Color 2", remainingWeight: null }),
    makeSpool("spoolio", "3", { name: null, remainingWeight: 50 }),
    makeSpool("spoolman", "4", { name: "color 1", remainingWeight: 1500 }),
  ];
  const ids = (list: typeof spools) => list.map((spool) => spool.sourceId);
  expect(sortSpools(spools, null)).toBe(spools);

  expect(ids(sortSpools(spools, { key: "remaining", direction: "asc" }))).toEqual([
    "3",
    "1",
    "4",
    "2",
  ]);
  expect(ids(sortSpools(spools, { key: "remaining", direction: "desc" }))).toEqual([
    "4",
    "1",
    "3",
    "2",
  ]);
  // "Color 2" sorts before "Color 10", case does not matter, and the missing name is last both ways.
  expect(ids(sortSpools(spools, { key: "name", direction: "asc" }))).toEqual(["4", "2", "1", "3"]);
  expect(ids(sortSpools(spools, { key: "name", direction: "desc" }))).toEqual(["1", "2", "4", "3"]);
  expect(ids(sortSpools(spools, { key: "source", direction: "asc" }))).toEqual([
    "1",
    "2",
    "3",
    "4",
  ]);
  expect(ids(spools)).toEqual(["1", "2", "3", "4"]);
});
