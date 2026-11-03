import { expect, test } from "bun:test";

import type { LoadResult } from "@spoolsync/core/core/model";
import { makeSpool } from "@spoolsync/core/core/testing";

import { rankItems } from "./rank";
import { spoolItems, spoolKeyOf, spoolTitle } from "./items";

const result = (spools: LoadResult["spools"]): LoadResult => ({
  source: "spoolio",
  spools,
  warnings: [],
  loadedAt: "now",
});

test("builds one searchable entry per spool and opens it by key", () => {
  const opened: string[] = [];
  const items = spoolItems(
    [
      result([
        makeSpool("spoolio", "7", { vendor: "Polymaker", material: "PETG", name: "Teal", remainingWeight: 250 }),
        makeSpool("spoolio", "8", { vendor: null, material: null, name: null, remainingWeight: null }),
      ]),
    ],
    (key) => opened.push(key),
    "g",
  );
  expect(items.map((item) => item.title)).toEqual(["Polymaker PETG Teal", "8"]);
  expect(items[0]!.subtitle).toBe("Spoolio · 250 g left");
  expect(items[1]!.subtitle).toBe("Spoolio · weight unknown");
  expect(items[0]!.group).toBe("Spools");
  items[0]!.run();
  expect(opened).toEqual(["spoolio:7"]);
});

test("spools are found by brand, material, id, location or barcode", () => {
  const items = spoolItems(
    [
      result([
        makeSpool("spoolio", "7", { vendor: "Polymaker", material: "PETG", location: "Shelf B", upc: "12345" }),
        makeSpool("spoolio", "9", { vendor: "Prusament", material: "PLA", location: "Drawer" }),
      ]),
    ],
    () => {},
  );
  expect(rankItems(items, "petg").map((item) => item.id)).toEqual(["spool:spoolio:7"]);
  expect(rankItems(items, "shelf").map((item) => item.id)).toEqual(["spool:spoolio:7"]);
  expect(rankItems(items, "12345").map((item) => item.id)).toEqual(["spool:spoolio:7"]);
  expect(rankItems(items, "prusament pla")).toHaveLength(1);
});

test("an empty inventory gives no entries, and the key joins service and id", () => {
  expect(spoolItems([], () => {})).toEqual([]);
  expect(spoolKeyOf({ source: "spoolman", sourceId: "3" })).toBe("spoolman:3");
  expect(spoolTitle(makeSpool("spoolman", "3", { vendor: "A", material: null, name: "B" }))).toBe("A B");
});
