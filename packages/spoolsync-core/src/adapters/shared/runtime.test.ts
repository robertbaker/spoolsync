import { expect, test } from "bun:test";

import { buildPlan } from "../../core/compare";
import { matchSpools } from "../../core/match";
import type { WritableSourceId } from "../../core/model";
import { makeSpool } from "../../core/testing";
import { exportFilamentDb, loadFilamentDbFile } from "../filamentdb";
import { exportFilameter, loadFilameterFile } from "../filameter";
import { exportSpoolioJson, loadSpoolioJson } from "../spoolio";
import { exportThreeDfp, loadThreeDfpFile } from "../threeDfp";
import { exportTtag, loadTtag } from "../tigertag";
import type { AdapterRuntime } from "./runtime";

const runtime: AdapterRuntime = {
  now: () => Date.UTC(2026, 0, 2, 3, 4, 5),
  randomUUID: () => "12345678-abcd-4000-8000-123456789abc",
};

function creationPlan(source: WritableSourceId) {
  const group = matchSpools([makeSpool("spoolman", "1", { name: "Blue", colors: ["0011FF"] })])
    .groups[0]!;
  return buildPlan([group], new Map([[group.id, { values: {}, createIn: [source] }]])).get(source)!;
}

test("TigerTag uses the injected clock and ID generator for complete reproducible exports", () => {
  const loaded = loadTtag("{}");
  const changes = creationPlan("tigertag");
  const result = exportTtag(loaded, changes, runtime);
  expect(exportTtag(loaded, changes, runtime)).toEqual(result);
  const file = JSON.parse(result.json);
  expect(file.exportedAt).toBe("2026-01-02T03:04:05.000Z");
  expect(file.records[0].uid).toBe("TigerData_12345678abcd40008000123456789abc");
  expect(file.records[0].timestamp).toBe(Math.floor(runtime.now() / 1000) - 946_684_800);
  expect(loadTtag(result.json).spools[0]!.colors).toEqual(["0011FF"]);
  expect(loaded.file.records).toEqual([]);
});

test("3DFilamentProfiles uses the injected ID generator consistently in JSON and CSV", () => {
  const loaded = loadThreeDfpFile("[]");
  const changes = creationPlan("threeDfp");
  const result = exportThreeDfp(loaded, changes, runtime);
  expect(exportThreeDfp(loaded, changes, runtime)).toEqual(result);
  const record = JSON.parse(result.json)[0];
  expect(record.short_code).toBe("12345678a");
  expect(record.spool_url).toBe("https://spooldb.com/s/12345678a");
  expect(loadThreeDfpFile(result.csv).spools[0]!.sourceId).toBe(record.short_code);
  expect(loaded.file).toEqual([]);
});

test("Spoolio uses the injected clock and IDs while preserving unrelated backup data", () => {
  const file = {
    version: 1,
    filaments: [{ id: "existing", type: "PLA", colorName: "Original" }, { unknown: true }],
    printLogs: [{ id: "print-one", grams: 12 }],
    settings: { theme: "dark" },
  };
  const loaded = loadSpoolioJson(JSON.stringify(file));
  const changes = creationPlan("spoolio");
  const result = exportSpoolioJson(loaded, changes, runtime);
  expect(exportSpoolioJson(loaded, changes, runtime)).toEqual(result);
  const output = JSON.parse(result.json);
  expect(output.exportedAt).toBe("2026-01-02T03:04:05.000Z");
  expect(output.filaments[2].id).toBe(runtime.randomUUID());
  expect(output.filaments.slice(0, 2)).toEqual(file.filaments);
  expect(output.printLogs).toEqual(file.printLogs);
  expect(output.settings).toEqual(file.settings);
  expect(loaded.file).toEqual(file);
  expect(result.total).toBe(2);
  expect(result.warnings[0]).toContain("unrecognized filament record");
});

test("FilamentDB exports use injected record IDs and timestamps without changing the input", () => {
  const loaded = loadFilamentDbFile("[]");
  const changes = creationPlan("filamentdb");
  const result = exportFilamentDb(loaded, changes, runtime);
  expect(exportFilamentDb(loaded, changes, runtime)).toEqual(result);
  const record = JSON.parse(result.json)[0];
  expect(record.serial).toBe(runtime.randomUUID());
  expect(record.createdAt).toBe(runtime.now());
  expect(record.lastUpdated).toBe(runtime.now());
  expect(loadFilamentDbFile(result.json).spools[0]!.colors).toEqual(["0011FF"]);
  expect(loaded.file).toEqual([]);
});

test("FilaMeter exports use injected IDs while preserving non-filament documents and metadata", () => {
  const backup = {
    regular: [{ _id: "settings", configuration: true }],
    local: [{ keep: true }],
    version: 7,
  };
  const loaded = loadFilameterFile(JSON.stringify(backup));
  const changes = creationPlan("filameter");
  const result = exportFilameter(loaded, changes, runtime);
  expect(exportFilameter(loaded, changes, runtime)).toEqual(result);
  const output = JSON.parse(result.json);
  expect(output.regular[1]._id).toBe(runtime.randomUUID());
  expect(output.regular[0]).toEqual(backup.regular[0]);
  expect(output.local).toEqual(backup.local);
  expect(output.version).toBe(7);
  expect(loadFilameterFile(result.csv).spools[0]!.colors).toEqual(["0011FF"]);
  expect(loaded.file).toEqual(backup);
});
