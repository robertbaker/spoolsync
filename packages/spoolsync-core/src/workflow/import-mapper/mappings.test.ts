import { expect, test } from "bun:test";

import { headerSignature } from "./fields";
import { sanitizeColumnMaps } from "./mappings";

test("damaged or hostile saved mappings are cleaned or dropped", () => {
  const good = headerSignature(["Brand"]);
  const clean = sanitizeColumnMaps({
    [good]: {
      mapping: { vendor: "Brand", bogus: "x", material: 7, name: "", price: "p".repeat(500) },
      unit: "stone",
      savedAt: "2026-01-01T00:00:00Z",
    },
    "1-zzzzzzzz": { mapping: { vendor: "x" }, savedAt: "2026-01-01T00:00:00Z" },
    [headerSignature(["Other"])]: { mapping: {}, savedAt: "2026-01-01T00:00:00Z" },
    [headerSignature(["Third"])]: { mapping: { vendor: "x" }, savedAt: "yesterday" },
  });
  expect(Object.keys(clean)).toEqual([good]);
  expect(clean[good]).toEqual({
    mapping: { vendor: "Brand" },
    unit: "g",
    savedAt: "2026-01-01T00:00:00.000Z",
  });
  expect(sanitizeColumnMaps("nope")).toEqual({});
  expect(sanitizeColumnMaps([1, 2])).toEqual({});
});
