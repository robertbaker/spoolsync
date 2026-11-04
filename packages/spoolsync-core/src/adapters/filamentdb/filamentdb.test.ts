import { expect, test } from "bun:test";

import type { PlannedChange } from "../../core/compare";
import { detectInventorySources } from "../../workflow/detect";
import { exportInventory } from "../../workflow/export";
import { loadInventoryFile } from "../../workflow/load";
import { buildZip } from "../shared/xlsx-fixture";
import { listZipEntries, readZipEntry } from "../shared/zip";
import { applyToFilamentDb } from "./apply";
import { spoolFileName } from "./files";

const red = {
  serial: "A1B2",
  brand: "Prusa™ Research",
  series: "Prusament",
  type: "PLA",
  color: "Galaxy Black",
  colorHex: "#000000",
  weightTotal: 1000,
  weightRemaining: 400,
  weightSpool: 200,
  diameter: 1.75,
  density: 1.24,
  temperatureNozzleMin: 200,
  temperatureNozzleMax: 220,
  temperatureBedMin: 50,
  temperatureBedMax: 60,
  batchNumber: "LOT-7",
  finish: "plain",
  transmissionDistance: 1.4,
  lastUpdated: 1,
};
const blue = { ...red, serial: "C3D4", color: "Blue", finish: "silk", batchNumber: undefined };

const zipOf = (...spools: object[]) =>
  buildZip(
    spools.map((spool, index) => ({
      name: `${(spool as { serial: string }).serial}-${index}.json`,
      content: JSON.stringify(spool),
    })),
  );

function update(serial: string, spool: object, fields: Array<[string, unknown, unknown]>) {
  return {
    kind: "update",
    source: "filamentdb",
    groupId: "g1",
    spool: { sourceId: serial, ...spool },
    links: {},
    changes: fields.map(([field, from, to]) => ({ field, from, to })),
  } as unknown as PlannedChange;
}

async function entries(zip: Uint8Array) {
  const out: Record<string, Record<string, unknown>> = {};
  for (const entry of listZipEntries(zip))
    out[entry.name] = JSON.parse(new TextDecoder().decode(await readZipEntry(zip, entry)));
  return out;
}

test("reads FilamentDB's ZIP export and keeps JSON support", async () => {
  const zip = buildZip([
    { name: "PLA-Prusa-GalaxyBlack-A1B2.json", content: JSON.stringify(red) },
    { name: "PLA-Prusa-Blue-C3D4.json", content: JSON.stringify(blue), stored: true },
    { name: "notes.txt", content: "ignored" },
    { name: "PLA-Broken-X-Z9.json", content: "{ nope" },
  ]);
  const fromZip = await loadInventoryFile("filamentdb", zip);
  expect(fromZip.spools.map((s) => s.sourceId)).toEqual(["A1B2", "C3D4"]);
  expect(fromZip.warnings).toEqual(["PLA-Broken-X-Z9.json: not valid JSON, so it was skipped."]);
  expect(fromZip.spools[0]).toMatchObject({ lotNr: "LOT-7", finish: "Basic", td: 1.4 });
  expect(fromZip.spools[1]).toMatchObject({ lotNr: null, finish: "Silk" });

  const json = JSON.stringify([red, blue]);
  const fromText = await loadInventoryFile("filamentdb", json);
  const fromBytes = await loadInventoryFile("filamentdb", new TextEncoder().encode(json));
  expect(fromText.spools.map((s) => s.sourceId)).toEqual(["A1B2", "C3D4"]);
  expect(fromBytes.spools).toEqual(fromText.spools);
});

test("rejects a ZIP without spool files", async () => {
  await expect(
    loadInventoryFile("filamentdb", buildZip([{ name: "readme.txt", content: "x" }])),
  ).rejects.toThrow("no spool files");
  await expect(
    loadInventoryFile("filamentdb", buildZip([{ name: "a-b-c-d.json", content: '{"x":1}' }])),
  ).rejects.toThrow("no spool file has a serial");
});

test("detects a FilamentDB ZIP and its JSON among the candidates", async () => {
  const zipMatches = await detectInventorySources("filamentdb-spools-1.zip", zipOf(red));
  expect(zipMatches).toEqual([{ source: "filamentdb", spoolCount: 1 }]);
  const jsonMatches = await detectInventorySources("spools.json", JSON.stringify([red]));
  expect(jsonMatches.map((match) => match.source)).toContain("filamentdb");
});

test("unknown finishes survive loading and n/a is blank", async () => {
  const loaded = await loadInventoryFile(
    "filamentdb",
    JSON.stringify([
      { ...red, finish: "n/a" },
      { ...blue, finish: "Pearl" },
      { ...blue, serial: "E5", finish: undefined, transmissionDistance: -1 },
    ]),
  );
  expect(loaded.spools.map((s) => s.finish)).toEqual([null, "Pearl", null]);
  expect(loaded.spools[2]!.td).toBeNull();
});

test("file names follow FilamentDB's getSpoolFileName", () => {
  expect(spoolFileName(red)).toBe("PLA-PrusaResearch-GalaxyBlack-A1B2.json");
  expect(spoolFileName({ serial: "x/y", type: "", brand: "", color: "" })).toBe(
    "Unknown-Unknown-NoColor-xy.json",
  );
  // /api/spools/import needs at least four hyphen-separated parts.
  expect(
    spoolFileName({ serial: "1", type: "PLA", brand: "A", color: "B" }).split("-").length,
  ).toBe(4);
});

test("exports a ZIP of per-spool JSON files that updates lot, finish and TD", async () => {
  const loaded = await loadInventoryFile("filamentdb", zipOf(red, blue));
  const result = await exportInventory("filamentdb", loaded, [
    update("A1B2", loaded.spools[0]!, [
      ["lotNr", "LOT-7", "LOT-8"],
      ["finish", "Basic", "Matte"],
      ["td", 1.4, 2.5],
    ]),
    update("C3D4", loaded.spools[1]!, [
      ["lotNr", null, "NEW"],
      ["finish", "Silk", null],
      ["td", 1.4, null],
    ]),
  ]);
  expect(result.mediaType).toBe("application/zip");
  expect(result.extension).toBe("zip");
  expect(JSON.parse(result.text)).toHaveLength(2);
  expect(result.updated).toBe(2);
  const files = await entries(result.bytes!);
  expect(Object.keys(files)).toEqual([
    "PLA-PrusaResearch-GalaxyBlack-A1B2.json",
    "PLA-PrusaResearch-Blue-C3D4.json",
  ]);
  expect(files["PLA-PrusaResearch-GalaxyBlack-A1B2.json"]).toMatchObject({
    batchNumber: "LOT-8",
    finish: "matte",
    transmissionDistance: 2.5,
    series: "Prusament",
  });
  const second = files["PLA-PrusaResearch-Blue-C3D4.json"]!;
  expect(second["batchNumber"]).toBe("NEW");
  expect(second).not.toHaveProperty("finish");
  expect(second).not.toHaveProperty("transmissionDistance");
  expect(result.warnings.join(" ")).toContain("/api/spools/import");
  // The JSON list stays available, and the ZIP reads back to the same spools.
  const json = JSON.parse(result.alternateFiles![0]!.text) as unknown[];
  expect(json).toHaveLength(2);
  const reloaded = await loadInventoryFile("filamentdb", result.bytes!);
  expect(reloaded.spools.map((s) => [s.lotNr, s.finish, s.td])).toEqual([
    ["LOT-8", "Matte", 2.5],
    ["NEW", null, null],
  ]);
});

test("warns when a rename changes a file name, a finish has no FilamentDB value, or a type is missing", async () => {
  const loaded = await loadInventoryFile(
    "filamentdb",
    JSON.stringify([red, { ...blue, type: "" }]),
  );
  const result = await exportInventory("filamentdb", loaded, [
    update("A1B2", loaded.spools[0]!, [
      ["name", "Galaxy Black", "Jet Black"],
      ["finish", "Basic", "Pearl"],
    ]),
  ]);
  expect(result.warnings.some((w) => w.includes("file name changed"))).toBe(true);
  expect(result.warnings.some((w) => w.includes('finish "Pearl"'))).toBe(true);
  expect(result.warnings.some((w) => w.includes("no type"))).toBe(true);
  const files = await entries(result.bytes!);
  expect(files["PLA-PrusaResearch-JetBlack-A1B2.json"]).toMatchObject({ finish: "plain" });
});

test("a new spool carries lot, finish and TD and warns about defaulted values", async () => {
  const loaded = await loadInventoryFile("filamentdb", "[]");
  const change = {
    kind: "create",
    source: "filamentdb",
    groupId: "g",
    links: {},
    groupIds: {},
    values: {
      vendor: "Acme",
      material: null,
      name: "Red",
      colors: ["FF0000"],
      diameter: null,
      density: null,
      nozzleTempMin: null,
      nozzleTempMax: null,
      bedTempMin: null,
      bedTempMax: null,
      upc: null,
      initialWeight: 1000,
      remainingWeight: 800,
      emptySpoolWeight: null,
      location: null,
      price: null,
      purchasedOn: null,
      lotNr: "L1",
      finish: "Silk",
      td: 0.8,
      comment: null,
      archived: false,
    },
  } as unknown as PlannedChange;
  const result = await exportInventory("filamentdb", loaded, [change]);
  const [file] = Object.values(await entries(result.bytes!));
  expect(file).toMatchObject({
    brand: "Acme",
    type: "PLA",
    batchNumber: "L1",
    finish: "silk",
    transmissionDistance: 0.8,
  });
  expect(result.warnings.filter((w) => w.includes("defaults"))).toHaveLength(3);
});

test("API writes send the lot, finish and TD to POST /api/spools", async () => {
  const loaded = await loadInventoryFile("filamentdb", JSON.stringify([red]));
  const saved: Array<Record<string, unknown>> = [];
  const log = await applyToFilamentDb(
    {
      listSpools: async () => [structuredClone(red)],
      saveSpool: async (spool) => void saved.push(spool),
    },
    [
      update("A1B2", loaded.spools[0]!, [
        ["lotNr", "LOT-7", null],
        ["finish", "Basic", "Glossy"],
        ["td", 1.4, 3],
      ]),
    ],
  );
  expect(log[0]).toMatchObject({ ok: true });
  expect(saved[0]).toMatchObject({ finish: "glossy", transmissionDistance: 3 });
  expect(saved[0]).not.toHaveProperty("batchNumber");
});
