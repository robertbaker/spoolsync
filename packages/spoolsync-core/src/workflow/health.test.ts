import { expect, test } from "bun:test";

import type { LoadResult } from "../core/model";
import { makeSpool } from "../core/testing";
import { checkInventoryHealth, spoolIssues } from "./health";

const complete = { location: "Shelf 1" };

test("a complete spool has no issues", () => {
  expect(spoolIssues(makeSpool("spoolman", "1", complete))).toEqual([]);
});

test("lists missing fields, treating blank text as missing", () => {
  const spool = makeSpool("spoolman", "1", {
    vendor: "  ",
    material: null,
    colors: [],
    remainingWeight: null,
    location: null,
  });
  expect(spoolIssues(spool)).toEqual([
    "missing-weight",
    "missing-color",
    "missing-vendor",
    "missing-material",
    "missing-location",
  ]);
});

test("flags impossible values but not zero or unknown", () => {
  const issues = (overrides: Parameters<typeof makeSpool>[2]) =>
    spoolIssues(makeSpool("spoolman", "1", { ...complete, ...overrides }));
  expect(issues({ remainingWeight: 1200 })).toEqual(["over-initial"]);
  expect(issues({ remainingWeight: -5 })).toEqual(["negative-weight"]);
  expect(issues({ remainingWeight: Number.NaN })).toEqual(["invalid-number"]);
  expect(issues({ initialWeight: Infinity })).toEqual(["invalid-number"]);
  expect(issues({ remainingWeight: 0 })).toEqual([]);
  expect(issues({ initialWeight: null })).toEqual([]);
});

test("counts each spool once per issue across services", () => {
  const results: LoadResult[] = [
    {
      source: "spoolman",
      warnings: [],
      loadedAt: "now",
      spools: [makeSpool("spoolman", "1"), makeSpool("spoolman", "2", complete)],
    },
    {
      source: "spoolio",
      warnings: [],
      loadedAt: "now",
      spools: [makeSpool("spoolio", "a", { location: null, remainingWeight: -1 })],
    },
  ];
  const report = checkInventoryHealth(results);
  expect(report.spools).toBe(3);
  expect(report.affected).toBe(2);
  expect(report.counts["missing-location"]).toBe(2);
  expect(report.counts["negative-weight"]).toBe(1);
  expect(report.byKey.get("spoolio:a")).toEqual(["missing-location", "negative-weight"]);
  expect(report.byKey.has("spoolman:2")).toBe(false);
});
