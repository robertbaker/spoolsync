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
      finish: null,
      td: null,
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
    expect((await loadSpoolmasterXlsx(bytes)).spools[0]).toMatchObject({
      vendor: "Sunlu",
    });
  });

  test("rejects workbooks without a stock table and non-workbooks", async () => {
    expect(
      loadSpoolmasterXlsx(buildXlsx([{ name: "Sheet1", rows: [["a", "b"]] }])),
    ).rejects.toThrow("SpoolMaster");
    expect(loadSpoolmasterXlsx(new TextEncoder().encode("Brand,Material"))).rejects.toThrow(
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
    expect(loadInventoryFile("spoolmaster", "Brand,Material")).rejects.toThrow("empty");
    expect(loadInventoryFile("spoolmaster", new Uint8Array())).rejects.toThrow("empty");
  });
});

describe("SpoolMaster price per kilo", () => {
  const row = (price: number | null, perKilo: number | null) => [
    "Prusa",
    "PLA",
    "red",
    null,
    500,
    null,
    null,
    price,
    perKilo,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ];

  test("derives price from Price / kg and the net weight only when price is empty", async () => {
    const result = await loadSpoolmasterXlsx(
      workbook([row(null, 30), row(12, 30), row(null, null)]),
    );
    expect(result.spools.map((spool) => spool.price)).toEqual([15, 12, null]);
  });
});

describe("SpoolMaster remaining percent and headers", () => {
  const row = (percent: number) => [
    "Prusa",
    "PLA",
    "red",
    null,
    1000,
    null,
    percent,
    ...Array<null>(11).fill(null),
  ];

  test("reads fractional Excel percent cells and warns that the value was ambiguous", async () => {
    const result = await loadSpoolmasterXlsx(workbook([row(0.4), row(40), row(1), row(0)]));
    expect(result.spools.map((spool) => spool.remainingWeight)).toEqual([400, 400, 1000, 0]);
    expect(result.warnings).toEqual([
      "Row 2: Remaining 0.4 is read as 40% (Excel stores percent cells as fractions); check this row if it meant 0.4%.",
      "Row 4: Remaining 1 is read as 100% (Excel stores percent cells as fractions); check this row if it meant 1%.",
    ]);
  });

  test("rejects headers that collide once units are dropped", async () => {
    const bytes = buildXlsx([
      {
        name: "Stock",
        rows: [
          ["Brand", "Material", "Remaining (g)", "Remaining (%)"],
          ["Prusa", "PLA", 400, 40],
        ],
      },
    ]);
    await expect(loadSpoolmasterXlsx(bytes)).rejects.toThrow(
      "duplicate column names (Remaining (g) and Remaining (%))",
    );
  });

  test("ignores duplicate columns the adapter does not read (first wins)", async () => {
    const bytes = buildXlsx([
      {
        name: "Stock",
        rows: [
          ["Brand", "Material", "Internal", "Internal (2)"],
          ["Prusa", "PLA", "a", "b"],
        ],
      },
    ]);
    const result = await loadSpoolmasterXlsx(bytes);
    expect(result.spools).toHaveLength(1);
  });

  test("keeps the first of two Notes columns without refusing the file", async () => {
    const bytes = buildXlsx([
      {
        name: "Stock",
        rows: [
          ["Brand", "Material", "Notes", "Notes"],
          ["Prusa", "PLA", "first", "second"],
        ],
      },
    ]);
    const result = await loadSpoolmasterXlsx(bytes);
    expect(result.spools[0]!.comment).toBe("first");
  });

  test("still refuses read columns that differ only by unit", async () => {
    const bytes = buildXlsx([
      {
        name: "Stock",
        rows: [
          ["Brand", "Material", "Price (CHF)", "Price (EUR)"],
          ["Prusa", "PLA", 20, 21],
        ],
      },
    ]);
    await expect(loadSpoolmasterXlsx(bytes)).rejects.toThrow("duplicate column names");
  });

  test("ignores the percent column when Remaining Weight is present", async () => {
    const bytes = buildXlsx([
      {
        name: "Stock",
        rows: [
          ["Brand", "Material", "Initial Weight (g)", "Remaining Weight (g)", "Remaining (%)"],
          ["Prusa", "PLA", 1000, 250, 90],
        ],
      },
    ]);
    const result = await loadSpoolmasterXlsx(bytes);
    expect(result.spools[0]!.remainingWeight).toBe(250);
    expect(result.warnings).toEqual([]);
  });

  test("a percent column mixing fractions and points reads each by magnitude", async () => {
    const bytes = buildXlsx([
      {
        name: "Stock",
        rows: [
          ["Brand", "Material", "Initial Weight (g)", "Remaining (%)"],
          ["Prusa", "PLA", 1000, 0.5],
          ["Prusa", "PLA", 1000, 50],
          ["Prusa", "PLA", 1000, 150],
        ],
      },
    ]);
    const result = await loadSpoolmasterXlsx(bytes);
    expect(result.spools.map((s) => s.remainingWeight)).toEqual([500, 500, 1000]);
  });
});
