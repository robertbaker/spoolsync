import { expect, test } from "bun:test";

import type { PlannedChange } from "../../core/compare";
import { createEmptyInventory, exportInventory, loadInventoryFile } from "../../workflow";
import { exportFilamentDb, loadFilamentDbFile } from "../filamentdb";
import { exportFiladex, loadFiladexFile } from "./index";

const filadex = JSON.stringify([
  {
    id: 7,
    name: "Prusament PLA Galaxy Black",
    manufacturer: "Prusament",
    material: "PLA",
    colorName: "Galaxy Black",
    colorCode: "#1A1A1A",
    diameter: "1.75",
    printTemp: "200-220",
    totalWeight: "1",
    remainingPercentage: "40",
    purchaseDate: "2026-03-01",
    purchasePrice: "24.99",
    storageLocation: "Shelf A",
    barcode: "123",
  },
]);

test("Filadex loads kilograms and percentages as grams", () => {
  const [spool] = loadFiladexFile(filadex).spools;
  expect(spool).toMatchObject({
    sourceId: "7",
    vendor: "Prusament",
    name: "Galaxy Black",
    colors: ["1A1A1A"],
    nozzleTempMin: 200,
    nozzleTempMax: 220,
    initialWeight: 1000,
    remainingWeight: 400,
    location: "Shelf A",
    price: 24.99,
    purchasedOn: "2026-03-01",
  });
});

test("Filadex update writes weights back as kilograms and a percentage", () => {
  const loaded = loadFiladexFile(filadex);
  const spool = loaded.spools[0]!;
  const change = {
    kind: "update",
    source: "filadex",
    spool,
    links: {},
    changes: [
      { field: "remainingWeight", from: 400, to: 250 },
      { field: "nozzleTempMax", from: 220, to: 230 },
    ],
  } as unknown as PlannedChange;
  const out = exportFiladex(loaded, [change]);
  const [record] = JSON.parse(out.json);
  expect(record).toMatchObject({
    totalWeight: "1",
    remainingPercentage: "25",
    printTemp: "200-230",
  });
  expect(record.id).toBe(7);
  expect(out.updated).toBe(1);
});

test("Filadex loads its CSV export", () => {
  const csv =
    "name,manufacturer,material,colorName,colorCode,totalWeight,remainingPercentage\nA,Bambu,PETG,Red,#FF0000,1,100\n";
  const loaded = loadFiladexFile(csv);
  expect(loaded.spools[0]).toMatchObject({
    vendor: "Bambu",
    material: "PETG",
    initialWeight: 1000,
  });
});

test("FilamentDB loads spools and exports changes", () => {
  const spool = {
    serial: "abc-123",
    brand: "Polymaker",
    type: "PLA",
    color: "Teal",
    colorHex: "#00AAAA",
    weightTotal: 1000,
    weightRemaining: 800,
    weightSpool: 200,
    diameter: 1.75,
    density: 1.24,
    temperatureNozzleMin: 190,
    temperatureNozzleMax: 220,
    temperatureBedMin: 50,
    temperatureBedMax: 60,
    lastUpdated: 1,
  };
  const loaded = loadFilamentDbFile(JSON.stringify([spool]));
  expect(loaded.spools[0]).toMatchObject({
    sourceId: "abc-123",
    colors: ["00AAAA"],
    emptySpoolWeight: 200,
    remainingWeight: 800,
  });
  const change = {
    kind: "update",
    source: "filamentdb",
    spool: loaded.spools[0]!,
    links: {},
    changes: [{ field: "remainingWeight", from: 800, to: 500 }],
  } as unknown as PlannedChange;
  const [record] = JSON.parse(exportFilamentDb(loaded, [change]).json);
  expect(record).toMatchObject({ serial: "abc-123", weightRemaining: 500, weightSpool: 200 });
  expect(record.lastUpdated).toBeGreaterThan(1);
});

test("FilamentDB rejects ZIP archives and non-spool JSON", () => {
  expect(() => loadFilamentDbFile("PK\u0003\u0004")).toThrow(/ZIP/);
  expect(() => loadFilamentDbFile('[{"foo":1}]')).toThrow(/serial/);
});

test("both load and export through the workflow entry points", async () => {
  for (const [source, text] of [
    ["filadex", filadex],
    ["filamentdb", '[{"serial":"s1","brand":"A","type":"PLA","color":"Red"}]'],
  ] as const) {
    const loaded = await loadInventoryFile(source, text);
    expect(loaded.spools).toHaveLength(1);
    expect((await createEmptyInventory(source)).spools).toHaveLength(0);
    const out = await exportInventory(source, loaded, []);
    expect(out.total).toBe(1);
  }
});
