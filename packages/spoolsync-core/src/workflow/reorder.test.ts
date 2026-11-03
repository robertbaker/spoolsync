import { expect, test } from "bun:test";

import type { LoadResult } from "../core/model";
import { makeSpool } from "../core/testing";
import { formatReorderList, reorderItems } from "./reorder";

const none = { confirmed: [], rejected: [] };
const result = (source: "spoolman" | "spoolio", spools: LoadResult["spools"]): LoadResult => ({
  source,
  spools,
  warnings: [],
  loadedAt: "now",
});

test("lists low spools once each, emptiest first, with a plain-text format", () => {
  const items = reorderItems(
    [
      result("spoolman", [
        makeSpool("spoolman", "1", {
          vendor: "Prusa",
          material: "PLA",
          name: "Blue",
          initialWeight: 1000,
          remainingWeight: 150,
        }),
        makeSpool("spoolman", "2", {
          vendor: "Polymaker",
          material: "PETG",
          name: "Teal",
          initialWeight: 1000,
          remainingWeight: 40,
        }),
        makeSpool("spoolman", "3", {
          vendor: "eSun",
          material: "ABS",
          name: "Plenty",
          initialWeight: 1000,
          remainingWeight: 900,
        }),
        makeSpool("spoolman", "4", {
          vendor: "Old",
          material: "PLA",
          name: "Done",
          initialWeight: 1000,
          remainingWeight: 0,
          archived: true,
        }),
      ]),
      // The same Prusa spool in a second service must not be listed twice.
      result("spoolio", [
        makeSpool("spoolio", "a", {
          vendor: "Prusa",
          material: "PLA",
          name: "Blue",
          initialWeight: 1000,
          remainingWeight: 140,
          crossIds: { spoolmanId: 1 },
        }),
      ]),
    ],
    none,
  );
  expect(items.map((item) => item.spool.name)).toEqual(["Teal", "Blue"]);
  expect(formatReorderList(items)).toBe(
    [
      "Running low (2):",
      "- Polymaker PETG Teal: 40 g left (4%)",
      "- Prusa PLA Blue: 150 g left (15%)",
    ].join("\n"),
  );
});

test("an empty list says so", () => {
  expect(formatReorderList([])).toBe("Nothing is running low.");
  expect(reorderItems([], none)).toEqual([]);
});
