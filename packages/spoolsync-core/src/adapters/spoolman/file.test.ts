import { describe, expect, test } from "bun:test";

import { buildPlan } from "../../core/compare";
import { matchSpools } from "../../core/match";
import { makeSpool } from "../../core/testing";
import { exportSpoolmanJson, loadSpoolmanFile, unflatten } from "./file";

const apiSpool = {
  id: 51,
  registered: "2026-01-01T00:00:00Z",
  filament: {
    id: 10,
    name: "Black",
    material: "PLA",
    density: 1.25,
    diameter: 1.75,
    color_hex: "000000",
    vendor: { id: 1, name: "Anycubic" },
  },
  initial_weight: 1000,
  remaining_weight: 860,
  used_weight: 140,
  lot_nr: "spoolstock:spool:410e5312",
  location: "Shelf A",
  archived: false,
  extra: { spoolstock_purchased_on: JSON.stringify("2025-05-06") },
};

// The shape of GET /api/v1/export/spools?fmt=json: flat, dotted keys, no remaining_weight.
const flatSpool = {
  id: 52,
  registered: "2026-01-02 10:00:00",
  filament_id: 11,
  "filament.id": 11,
  "filament.name": "Galaxy Purple",
  "filament.material": "PLA-Silk",
  "filament.density": 1.24,
  "filament.diameter": 1.75,
  "filament.multi_color_hexes": "5B2A86,000000",
  "filament.vendor.id": 2,
  "filament.vendor.name": "Mika 3D",
  initial_weight: 1000,
  used_weight: 750,
  archived: false,
  "extra.spoolstock_short_id": JSON.stringify("dup00001"),
};

test("unflatten does not mutate nested objects supplied by the caller", () => {
  const row = { filament: { id: 10 }, "filament.name": "Blue" };
  expect(unflatten(row)).toMatchObject({ filament: { id: 10, name: "Blue" } });
  expect(row.filament).toEqual({ id: 10 });
});

test("conflicting nested and flat export columns are rejected in either order", () => {
  const row = { filament: { id: 10 }, "filament.id": 20 };
  expect(() => unflatten(row)).toThrow("Conflicting Spoolman export columns");
  expect(() => unflatten(Object.fromEntries(Object.entries(row).reverse()))).toThrow(
    "Conflicting Spoolman export columns",
  );
});

test("compatible nested and flat export columns merge regardless of column order", () => {
  const row = {
    filament: { id: 10, vendor: { id: 3, name: "Example" } },
    "filament.name": "Blue",
    "filament.vendor.id": 3,
  };
  for (const entries of [Object.entries(row), Object.entries(row).reverse()]) {
    const input = Object.fromEntries(entries);
    const before = structuredClone(input);
    expect(unflatten(input)).toMatchObject({
      filament: { id: 10, name: "Blue", vendor: { id: 3, name: "Example" } },
    });
    expect(input).toEqual(before);
  }
});

test("mixed flat exports preserve nested extras and literal dots in extra names", () => {
  const row = {
    id: 1,
    "filament.id": 10,
    extra: { spoolstock_short_id: '"abc"', "custom.field": '"original"' },
    "extra.other": '"value"',
  };
  const loaded = loadSpoolmanFile(JSON.stringify([row]));
  expect(loaded.warnings).toEqual([]);
  expect(loaded.spools[0]!.crossIds.spoolstockShortId).toBe("abc");
  expect((loaded.spools[0]!.raw as { extra: unknown }).extra).toEqual({
    spoolstock_short_id: '"abc"',
    "custom.field": '"original"',
    other: '"value"',
  });
});

test("mixed nested and flat extras reject conflicting values in either order", () => {
  const row = { extra: { id: '"a"' }, "extra.id": '"b"' };
  expect(() => unflatten(row)).toThrow("Conflicting Spoolman export columns");
  expect(() => unflatten(Object.fromEntries(Object.entries(row).reverse()))).toThrow(
    "Conflicting Spoolman export columns",
  );
});

describe("loadSpoolmanFile", () => {
  test("reads API-shaped arrays and {spools: [...]}", () => {
    expect(loadSpoolmanFile(JSON.stringify([apiSpool])).spools[0]).toMatchObject({
      sourceId: "51",
      crossIds: { spoolmanId: 51, spoolstockShortId: "410e5312" },
      remainingWeight: 860,
      purchasedOn: "2025-05-06",
    });
    expect(loadSpoolmanFile(JSON.stringify({ spools: [apiSpool] })).spools).toHaveLength(1);
  });

  test("reads Spoolman's flattened JSON export and derives the remaining weight", () => {
    const result = loadSpoolmanFile(JSON.stringify([flatSpool]));
    expect(result).toMatchObject({ origin: "file", warnings: [] });
    expect(result.spools[0]).toMatchObject({
      vendor: "Mika 3D",
      colors: ["5B2A86", "000000"],
      remainingWeight: 250,
      crossIds: { spoolmanId: 52, spoolstockShortId: "dup00001" },
    });
  });

  test("reads Spoolman's CSV export, undoing its formula escaping", () => {
    const csv = [
      "archived,extra.spoolstock_short_id,filament.id,filament.material,filament.name,filament.vendor.id,filament.vendor.name,id,initial_weight,location,used_weight",
      `False,"""abc""",10,PLA,'-Minus Black,1,Anycubic,7,1000,Shelf,100`,
    ].join("\n");
    const [spool] = loadSpoolmanFile(csv).spools;
    expect(spool).toMatchObject({
      sourceId: "7",
      name: "-Minus Black",
      remainingWeight: 900,
      archived: false,
      crossIds: { spoolstockShortId: "abc" },
    });
  });

  test("rejects files that are not Spoolman exports", () => {
    expect(() => loadSpoolmanFile("name,weight\nx,1")).toThrow(/Spoolman export/);
    expect(() => loadSpoolmanFile('{"filaments": []}')).toThrow(/list of spools/);
  });

  test("unflatten builds nested extras", () => {
    expect(unflatten({ "filament.extra.k": '"v"', "filament.name": "N" })).toEqual({
      filament: { extra: { k: '"v"' }, name: "N" },
    });
  });
});

describe("exportSpoolmanJson", () => {
  test("keeps weight arithmetic consistent regardless of field order and never reuses negative ids", () => {
    const loaded = loadSpoolmanFile(JSON.stringify([apiSpool]));
    const change = {
      kind: "update" as const,
      source: "spoolman" as const,
      groupId: "x",
      spool: loaded.spools[0]!,
      links: {},
      changes: [
        { field: "remainingWeight" as const, from: 860, to: 800 },
        { field: "initialWeight" as const, from: 1000, to: 1200 },
      ],
    };
    const updated = JSON.parse(exportSpoolmanJson(loaded, [change]).json)[0];
    expect(updated).toMatchObject({
      initial_weight: 1200,
      remaining_weight: 800,
      used_weight: 400,
    });
    const { groups } = matchSpools([makeSpool("spoolstock", "new")]);
    const creates = buildPlan(
      groups,
      new Map([[groups[0]!.id, { values: {}, createIn: ["spoolman"] }]]),
    ).get("spoolman")!;
    const first = loadSpoolmanFile(exportSpoolmanJson(loaded, creates).json);
    const second = JSON.parse(exportSpoolmanJson(first, creates).json);
    expect(second.map((s: { id: number }) => s.id)).toEqual([51, -1, -2]);
  });
  test("applies changes, adds new spools with negative ids, and reloads", () => {
    const loaded = loadSpoolmanFile(JSON.stringify([apiSpool]));
    const spoolstock = makeSpool("spoolstock", "410e5312", {
      vendor: "Anycubic",
      material: "PLA",
      name: "Black",
      colors: ["000000"],
      remainingWeight: 800,
    });
    const extra = makeSpool("spoolstock", "new1", {
      vendor: "Elegoo",
      colors: ["FF0000", "00FF00"],
      nozzleTempMin: 200,
      nozzleTempMax: 220,
    });
    const { groups } = matchSpools([...loaded.spools, spoolstock, extra]);
    const linked = groups.find((g) => g.members.spoolman)!;
    const single = groups.find((g) => g.members.spoolstock === extra)!;
    const plan = buildPlan(
      groups,
      new Map([
        [linked.id, { values: { remainingWeight: 800, vendor: "Anycubic Inc" }, createIn: [] }],
        [single.id, { values: {}, createIn: ["spoolman"] }],
      ]),
    );
    const result = exportSpoolmanJson(loaded, plan.get("spoolman")!);
    expect(result).toMatchObject({ updated: 1, created: 1, total: 2 });

    const spools = JSON.parse(result.json);
    expect(spools[0]).toMatchObject({
      id: 51,
      remaining_weight: 800,
      used_weight: 200,
      filament: { vendor: { id: 1, name: "Anycubic Inc" } },
    });
    expect(spools[1]).toMatchObject({
      id: -1,
      lot_nr: "spoolstock:spool:new1",
      filament: {
        multi_color_hexes: "FF0000,00FF00",
        settings_extruder_temp: 210,
        vendor: { name: "Elegoo" },
      },
      extra: { spoolstock_short_id: JSON.stringify("new1") },
    });
    // Loaded is untouched, and the download reads back.
    expect((loaded.spools[0]!.raw as typeof apiSpool).remaining_weight).toBe(860);
    expect(loadSpoolmanFile(result.json).spools).toHaveLength(2);
  });
});
