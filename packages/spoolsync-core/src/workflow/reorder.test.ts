import { expect, test } from "bun:test";

import type { LoadResult } from "../core/model";
import { lowStockRule } from "../core/stock";
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

test("a stricter or looser rule changes who is listed", () => {
  const results = [
    result("spoolman", [
      makeSpool("spoolman", "1", { name: "Quarter", initialWeight: 1000, remainingWeight: 250 }),
      makeSpool("spoolman", "2", { name: "Tenth", initialWeight: 1000, remainingWeight: 100 }),
    ]),
  ];
  const names = (percent: number) =>
    reorderItems(results, none, lowStockRule(percent)).map((item) => item.spool.name);
  expect(names(20)).toEqual(["Tenth"]);
  expect(names(30)).toEqual(["Tenth", "Quarter"]);
  expect(names(5)).toEqual([]);
});

test("uses the running-low member's weight when the first group member is not low", () => {
  const items = reorderItems(
    [
      result("spoolman", [
        makeSpool("spoolman", "1", {
          vendor: "Prusa",
          material: "PLA",
          name: "Blue",
          initialWeight: 1000,
          remainingWeight: 800,
        }),
      ]),
      result("spoolio", [
        makeSpool("spoolio", "a", {
          vendor: "Prusa",
          material: "PLA",
          name: "Blue",
          initialWeight: 1000,
          remainingWeight: 100,
          crossIds: { spoolmanId: 1 },
        }),
      ]),
    ],
    none,
  );
  expect(items).toHaveLength(1);
  expect(items[0]!.spool.remainingWeight).toBe(100);
  expect(items[0]!.fraction).toBe(0.1);
});
