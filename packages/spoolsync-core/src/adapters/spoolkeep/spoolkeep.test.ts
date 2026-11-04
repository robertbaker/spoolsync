import { describe, expect, test } from "bun:test";

import { loadSpoolKeepJson } from ".";

const record = (overrides: Record<string, unknown>) => ({
  id: "R",
  brand: "Creality",
  family: "PLA",
  color: "blue",
  ...overrides,
});

describe("loadSpoolKeepJson", () => {
  test("keeps a single-quantity entry's ID and maps its fields", () => {
    const result = loadSpoolKeepJson(
      JSON.stringify([
        record({
          exactType: "PLA+",
          reference: "SKU9",
          price: 22,
          note: "n",
          diameter: 1.75,
          nozzleTempMin: 200,
          nozzleTempMax: 220,
          bedTempMin: 50,
          bedTempMax: 60,
          newQuantity: 1,
          usedQuantity: 0,
        }),
      ]),
    );
    expect(result.warnings).toEqual([]);
    expect(result.spools).toHaveLength(1);
    expect(result.spools[0]).toMatchObject({
      sourceId: "R",
      crossIds: { spoolkeepId: "R" },
      vendor: "Creality",
      material: "PLA+",
      name: "blue",
      colors: [],
      upc: "SKU9",
      price: 22,
      comment: "n\nFamily: PLA",
      nozzleTempMin: 200,
      bedTempMax: 60,
      initialWeight: null,
      remainingWeight: null,
      archived: false,
    });
  });

  test("expands counted spools with unique IDs and warns", () => {
    const result = loadSpoolKeepJson(
      JSON.stringify([record({ newQuantity: 2, usedQuantity: 1, color: "#aabbcc" })]),
    );
    expect(result.spools.map((spool) => spool.sourceId)).toEqual([
      "R:new-1",
      "R:new-2",
      "R:used-1",
    ]);
    expect(result.spools[0]?.colors).toEqual(["AABBCC"]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("3 spools");
  });

  test("represents an out-of-stock entry as one archived spool", () => {
    const result = loadSpoolKeepJson(
      JSON.stringify([
        record({ newQuantity: 0, usedQuantity: 0 }),
        record({ id: "S", material: undefined }),
      ]),
    );
    expect(result.spools[0]).toMatchObject({ sourceId: "R", archived: true });
    expect(result.spools[1]).toMatchObject({
      sourceId: "S",
      archived: true,
      material: "PLA",
    });
  });

  test("reports duplicate and malformed entries and rejects non-lists", () => {
    const result = loadSpoolKeepJson(
      JSON.stringify([record({}), record({ brand: "Dup" }), { brand: "x" }, 5]),
    );
    expect(result.spools).toHaveLength(1);
    expect(result.warnings).toHaveLength(3);
    expect(() => loadSpoolKeepJson("nope")).toThrow("not valid JSON");
    expect(() => loadSpoolKeepJson("{}")).toThrow("SpoolKeep backup");
  });
});

describe("SpoolKeep family, condition and fractional quantities", () => {
  test("keeps family beside exactType and marks new versus used", () => {
    const result = loadSpoolKeepJson(
      JSON.stringify([
        record({
          exactType: "PLA+",
          note: "n",
          newQuantity: 1,
          usedQuantity: 1,
        }),
        record({ id: "S", exactType: "PLA", usedQuantity: 1 }),
        record({ id: "T" }),
      ]),
    );
    expect(result.spools.map((spool) => spool.comment)).toEqual([
      "n\nFamily: PLA",
      "n\nFamily: PLA",
      null,
      null,
    ]);
    expect(result.spools.map((spool) => spool.sourceId)).toEqual(["R:new-1", "R:used-1", "S", "T"]);
  });

  test("warns when a fractional quantity is floored", () => {
    const result = loadSpoolKeepJson(
      JSON.stringify([record({ newQuantity: 1.5, usedQuantity: 0.5 })]),
    );
    expect(result.spools).toHaveLength(1);
    expect(result.warnings).toEqual([
      "Creality blue: new quantity 1.5 is fractional; loaded as 1.",
      "Creality blue: used quantity 0.5 is fractional; loaded as 0.",
    ]);
  });
});
