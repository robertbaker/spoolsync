import { beforeEach, expect, test } from "bun:test";

import { headerSignature, type ColumnMapping } from "./fields";
import {
  COLUMN_MAPS_KEY,
  MAX_SAVED_MAPS,
  forgetColumnMapping,
  readColumnMaps,
  readSavedMapping,
  saveColumnMapping,
} from "./store";

beforeEach(() => localStorage.clear());

test("mappings are remembered per layout, validated, and capped", () => {
  const signature = headerSignature(["Brand", "Type"]);
  const mapping: ColumnMapping = { vendor: "Brand", material: "Type" };
  expect(readSavedMapping(signature)).toBeNull();
  expect(saveColumnMapping(signature, mapping, "oz")).toBe(true);
  expect(readSavedMapping(signature)).toMatchObject({ mapping, unit: "oz" });
  forgetColumnMapping(signature);
  expect(readSavedMapping(signature)).toBeNull();
  expect(localStorage.getItem(COLUMN_MAPS_KEY)).toBeNull();
  expect(saveColumnMapping("not-a-signature", { vendor: "Brand" }, "g")).toBe(false);

  for (let index = 0; index < MAX_SAVED_MAPS + 5; index++)
    saveColumnMapping(
      headerSignature([`Column ${index}`]),
      { vendor: `Column ${index}` },
      "g",
      new Date(Date.UTC(2026, 0, 1) + index * 1000),
    );
  const maps = readColumnMaps();
  expect(Object.keys(maps)).toHaveLength(MAX_SAVED_MAPS);
  expect(maps[headerSignature(["Column 0"])]).toBeUndefined();
  expect(maps[headerSignature([`Column ${MAX_SAVED_MAPS + 4}`])]).toBeDefined();
});
