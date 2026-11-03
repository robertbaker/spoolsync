import { expect, test } from "bun:test";

import { makeSpool } from "../core/testing";
import { diffFingerprints, fingerprintSpools, hasChanges } from "./inventory-changes";

test("fingerprints keep only id, remaining weight and name", () => {
  const prints = fingerprintSpools([
    makeSpool("spoolman", "1", { remainingWeight: 12.5, name: "Blue", comment: "secret" }),
    makeSpool("spoolman", "2", { remainingWeight: Number.NaN, name: null }),
  ]);
  expect(prints).toEqual([
    ["1", 12.5, "Blue"],
    ["2", null, null],
  ]);
});

test("reports added, removed, drops and gains in a deterministic order", () => {
  const changes = diffFingerprints(
    [
      ["1", 500, "A"],
      ["2", 300, "B"],
      ["3", 100, "C"],
      ["4", 100, "D"],
      ["5", null, "E"],
      ["10", 100, "F"],
    ],
    [
      ["1", 450, "A"],
      ["2", 100, "B"],
      ["3", 100.3, "C"],
      ["4", 150, "D"],
      ["5", 90, "E"],
      ["new", 10, "N"],
    ],
  );
  expect(changes.added).toEqual([{ id: "new", name: "N" }]);
  expect(changes.removed).toEqual([{ id: "10", name: "F" }]);
  expect(changes.drops.map((c) => [c.id, c.delta])).toEqual([
    ["2", -200],
    ["1", -50],
  ]);
  expect(changes.gains.map((c) => c.id)).toEqual(["4"]);
  // Within half a gram, and an unknown weight on either side, are not changes.
  expect(changes.unchanged).toBe(2);
  expect(hasChanges(changes)).toBe(true);
  expect(hasChanges(diffFingerprints([["1", 1, null]], [["1", 1, null]]))).toBe(false);
});
