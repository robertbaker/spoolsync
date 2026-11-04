import { beforeEach, expect, test } from "bun:test";

import {
  TABLE_COLUMNS,
  TABLE_COLUMNS_KEY,
  isDefaultColumns,
  readColumns,
  sanitizeColumns,
  saveColumns,
} from "./table-columns";

beforeEach(() => localStorage.clear());

test("every column shows by default and damaged values give the full set", () => {
  expect(readColumns()).toEqual([...TABLE_COLUMNS]);
  for (const raw of [null, undefined, "name", 42, {}, "{"])
    expect(sanitizeColumns(raw)).toEqual([...TABLE_COLUMNS]);
  localStorage.setItem(TABLE_COLUMNS_KEY, "{broken");
  expect(readColumns()).toEqual([...TABLE_COLUMNS]);
});

test("unknown and repeated columns are dropped, order follows the table, and name stays", () => {
  expect(sanitizeColumns(["location", "bogus", "vendor", "vendor", 7])).toEqual([
    "vendor",
    "name",
    "location",
  ]);
  expect(sanitizeColumns([])).toEqual(["name"]);
});

test("a choice is remembered, and showing everything forgets it", () => {
  expect(saveColumns(["vendor", "remaining"])).toEqual(["vendor", "name", "remaining"]);
  expect(readColumns()).toEqual(["vendor", "name", "remaining"]);
  expect(isDefaultColumns(readColumns())).toBe(false);
  expect(saveColumns(TABLE_COLUMNS)).toEqual([...TABLE_COLUMNS]);
  expect(localStorage.getItem(TABLE_COLUMNS_KEY)).toBeNull();
});
