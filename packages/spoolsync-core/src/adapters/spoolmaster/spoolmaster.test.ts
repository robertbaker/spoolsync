import { describe, expect, test } from "bun:test";

import { loadSpoolmasterXlsx } from ".";
import { loadInventoryFile } from "../../workflow";
import { buildXlsx } from "../shared/xlsx-fixture";

const HEADERS = [
  "Brand",
  "Material",
  "Color",
  "Color code",
  "Initial Weight (g)",
  "Remaining Weight (g)",
  "Remaining (%)",
  "Price (CHF)",
  "Price / kg (CHF)",
  "Location",
  "Notes",
  "Date added",
  "Extruder min (°C)",
  "Extruder max (°C)",
  "Bed min (°C)",
  "Bed max (°C)",
  "Diameter (mm)",
  "Batch / SKU",
];

function workbook(rows: Array<Array<string | number | null>>) {
  return buildXlsx([
    { name: "Stock", rows: [HEADERS, ...rows] },
    {
      name: "Shopping List",
      rows: [["Brand", "Material", "Color", "Color code", "Remaining (%)", "Ordered"]],
    },
  ]);
}

describe("loadSpoolmasterXlsx", () => {
  test("maps the Stock sheet and ignores the Shopping List", async () => {
    const result = await loadSpoolmasterXlsx(
      workbook([
        [
          "Elegoo",
          "PETG Carbon Fiber",
          "blue",
          "#00FFFF",
          678,
          234,
          35,
          22,
          32.45,
          "Shelf 1",
          "note",
          46328,
          230,
          250,
          60,
          80,
          1.75,
          "SKU-1",
        ],
      ]),
    );
    expect(result.warnings).toEqual([]);
    expect(result.spools).toHaveLength(1);
    const { raw: _raw, ...spool } = result.spools[0]!;
    expect(spool).toEqual({
      source: "spoolmaster",
      sourceId: "row-2",
      crossIds: { spoolmasterId: "row-2" },
      vendor: "Elegoo",
      material: "PETG Carbon Fiber",
      name: "blue",
      colors: ["00FFFF"],
      diameter: 1.75,
      density: null,
      nozzleTempMin: 230,
      nozzleTempMax: 250,
      bedTempMin: 60,
      bedTempMax: 80,
      upc: null,
      initialWeight: 678,
      remainingWeight: 234,
      emptySpoolWeight: null,
      location: "Shelf 1",
      price: 22,
      purchasedOn: "2026-11-02",
      lotNr: "SKU-1",
      comment: "note",
      archived: false,
    });
  });

  test("derives remaining weight from the percentage and skips blank or unidentified rows", async () => {
    const result = await loadSpoolmasterXlsx(
      workbook([
        [
          "Prusa",
          "PLA",
          "red",
          null,
          1000,
          null,
          40,
          null,
          null,
          null,
          null,
          "2026-05-01",
          null,
          null,
          null,
          null,
          null,
          null,
        ],
        [
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
        ],
        [
          null,
          null,
          null,
          null,
          500,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
        ],
      ]),
    );
    expect(result.spools.map((spool) => spool.sourceId)).toEqual(["row-2"]);
    expect(result.spools[0]).toMatchObject({
      remainingWeight: 400,
      purchasedOn: "2026-05-01",
      colors: [],
    });
    expect(result.warnings).toEqual(["Row 4: no brand, material, or color; skipped."]);
  });

  test("falls back to the first sheet with SpoolMaster columns", async () => {
    const bytes = buildXlsx([
      { name: "Notes", rows: [["hello"]] },
      {
        name: "Inventory",
        rows: [
          ["Brand", "Material"],
          ["Sunlu", "PLA"],
        ],
      },
    ]);
    expect((await loadSpoolmasterXlsx(bytes)).spools[0]).toMatchObject({ vendor: "Sunlu" });
  });

  test("rejects workbooks without a stock table and non-workbooks", async () => {
    await expect(
      loadSpoolmasterXlsx(buildXlsx([{ name: "Sheet1", rows: [["a", "b"]] }])),
    ).rejects.toThrow("SpoolMaster");
    await expect(loadSpoolmasterXlsx(new TextEncoder().encode("Brand,Material"))).rejects.toThrow(
      "Export your stock from SpoolMaster",
    );
  });

  test("the workflow reads it as bytes only", async () => {
    const bytes = workbook([
      [
        "Elegoo",
        "PLA",
        "blue",
        "#0000FF",
        1000,
        500,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
    ]);
    expect((await loadInventoryFile("spoolmaster", bytes)).spools).toHaveLength(1);
    await expect(loadInventoryFile("spoolmaster", "Brand,Material")).rejects.toThrow("empty");
    await expect(loadInventoryFile("spoolmaster", new Uint8Array())).rejects.toThrow("empty");
  });
});
