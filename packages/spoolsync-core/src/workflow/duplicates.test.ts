import { expect, test } from "bun:test";

import type { CommonSpool, LoadResult, SourceId } from "../core/model";
import { makeSpool } from "../core/testing";
import { duplicateKeys, findDuplicateSpools } from "./duplicates";

const result = (source: SourceId, spools: CommonSpool[]): LoadResult => ({
  source,
  spools,
  warnings: [],
  loadedAt: "now",
});
const dup = { purchasedOn: "2026-01-02", remainingWeight: 640 };

test("groups near-identical spools in one service with reasons, ordered by id", () => {
  const groups = findDuplicateSpools([
    result("spoolman", [
      makeSpool("spoolman", "10", { ...dup, remainingWeight: 642 }),
      makeSpool("spoolman", "2", dup),
      makeSpool("spoolman", "3", { ...dup, remainingWeight: 300 }),
      makeSpool("spoolman", "4", { material: "PETG", ...dup }),
    ]),
  ]);
  expect(groups).toHaveLength(1);
  expect(groups[0]!.id).toBe("spoolman:2");
  expect(groups[0]!.spools.map((spool) => spool.sourceId)).toEqual(["2", "10"]);
  expect(groups[0]!.reasons).toContain("same brand (Prusament)");
  expect(groups[0]!.reasons).toContain("same purchase date (2026-01-02)");
  expect(groups[0]!.reasons).toContain("near-identical remaining weight");
  expect([...duplicateKeys(groups)]).toEqual(["spoolman:2", "spoolman:10"]);
});

test("never compares across services and never changes the input", () => {
  const spools = [makeSpool("spoolman", "1", dup)];
  const other = [makeSpool("spoolio", "a", dup)];
  const before = JSON.stringify([spools, other]);
  expect(findDuplicateSpools([result("spoolman", spools), result("spoolio", other)])).toEqual([]);
  expect(JSON.stringify([spools, other])).toBe(before);
});

test("needs matching evidence beyond weight, and ignores unknown weights and archived mismatches", () => {
  const distinct = [
    makeSpool("spoolman", "1", { remainingWeight: 640, name: "A" }),
    makeSpool("spoolman", "2", { remainingWeight: 640, name: "B" }),
  ];
  expect(findDuplicateSpools([result("spoolman", distinct)])).toEqual([]);
  const unknown = [
    makeSpool("spoolman", "1", { ...dup, remainingWeight: null }),
    makeSpool("spoolman", "2", { ...dup, remainingWeight: null }),
  ];
  expect(findDuplicateSpools([result("spoolman", unknown)])).toEqual([]);
  const archived = [
    makeSpool("spoolman", "1", dup),
    makeSpool("spoolman", "2", { ...dup, archived: true }),
  ];
  expect(findDuplicateSpools([result("spoolman", archived)])).toEqual([]);
});

test("different color families or brands are not duplicates, similar shades are", () => {
  const spools = [
    makeSpool("spoolio", "1", { ...dup, colors: ["FF0000"] }),
    makeSpool("spoolio", "2", { ...dup, colors: ["EE1111"] }),
    makeSpool("spoolio", "3", { ...dup, colors: ["0000FF"] }),
    makeSpool("spoolio", "4", { ...dup, colors: ["FF0000"], vendor: "Other" }),
  ];
  const groups = findDuplicateSpools([result("spoolio", spools)]);
  expect(groups.map((group) => group.spools.map((spool) => spool.sourceId))).toEqual([["1", "2"]]);
});

test("chains of matches form one group, and services keep their fixed order", () => {
  const chained = [1, 2, 3].map((n) =>
    makeSpool("spoolstock", String(n), { ...dup, remainingWeight: 640 + n * 10 }),
  );
  const groups = findDuplicateSpools([
    result("spoolstock", chained),
    result("spoolman", [makeSpool("spoolman", "9", dup), makeSpool("spoolman", "8", dup)]),
  ]);
  expect(groups.map((group) => group.id)).toEqual(["spoolman:8", "spoolstock:1"]);
  expect(groups[1]!.spools).toHaveLength(3);
});
