import { describe, expect, test } from "bun:test";

import { ColorIndex } from "./color-search";
import type { ReferenceFilament } from "./types";

const record = (id: string, overrides: Partial<ReferenceFilament> = {}): ReferenceFilament => ({
  id,
  providerId: "file",
  providerLabel: "Reference file",
  vendor: "Acme",
  name: null,
  material: "PLA",
  colorName: id,
  colorHex: null,
  colorHexes: [],
  diameter: null,
  density: null,
  nozzleTempMin: null,
  nozzleTempMax: null,
  bedTempMin: null,
  bedTempMax: null,
  initialWeight: null,
  emptySpoolWeight: null,
  price: null,
  barcode: null,
  url: null,
  attribution: "test",
  license: null,
  ...overrides,
});

const solid = (id: string, hex: string, overrides: Partial<ReferenceFilament> = {}) =>
  record(id, { colorHex: hex, colorHexes: [hex], ...overrides });

const catalog = [
  solid("red", "FF0000"),
  solid("dark-red", "CC0000"),
  solid("blue", "0000FF"),
  solid("petg-red", "FF1010", { material: "PETG" }),
  solid("other-brand-red", "FE0000", { vendor: "Zed" }),
  record("no-color"),
  record("silk", { colorHex: "FF0000", colorHexes: ["FF0000", "0000FF"] }),
];

describe("ColorIndex", () => {
  const index = new ColorIndex(catalog);

  test("indexes only single-color records that have a valid hex", () => {
    expect(index.size).toBe(5);
  });

  test("returns the closest colors first, with a verdict", () => {
    const found = index.nearest("#FF0000", { limit: 3 });
    expect(found.map((entry) => entry.reference.id)).toEqual([
      "red",
      "other-brand-red",
      "petg-red",
    ]);
    expect(found[0]).toMatchObject({ deltaE: 0, verdict: "match" });
    expect(found[1]!.deltaE).toBeLessThan(found[2]!.deltaE);
    expect(index.nearest("0000ff", { limit: 1 })[0]!.reference.id).toBe("blue");
  });

  test("can be limited to one material (spelling does not matter) or brand", () => {
    expect(index.nearest("FF0000", { material: "pet-g" }).map((e) => e.reference.id)).toEqual([
      "petg-red",
    ]);
    expect(index.nearest("FF0000", { vendor: "ZED" }).map((e) => e.reference.id)).toEqual([
      "other-brand-red",
    ]);
  });

  test("can skip a record and a distance, and orders ties by id", () => {
    expect(index.nearest("FF0000", { excludeId: "red", limit: 1 })[0]!.reference.id).toBe(
      "other-brand-red",
    );
    expect(index.nearest("FF0000", { maxDeltaE: 3 }).map((e) => e.reference.id)).toEqual([
      "red",
      "other-brand-red",
      "petg-red",
    ]);
    const twins = new ColorIndex([solid("b", "112233"), solid("a", "112233")]);
    expect(twins.nearest("112233").map((e) => e.reference.id)).toEqual(["a", "b"]);
  });

  test("finds nothing for an invalid color or a limit of zero", () => {
    expect(index.nearest("not a color")).toEqual([]);
    expect(index.nearest("FF0000", { limit: 0 })).toEqual([]);
    expect(new ColorIndex([]).nearest("FF0000")).toEqual([]);
  });
});
