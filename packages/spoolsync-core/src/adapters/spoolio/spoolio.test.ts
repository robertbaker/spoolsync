import { describe, expect, test } from "bun:test";

import { exportSpoolioJson, loadSpoolioJson } from ".";
import { buildPlan, type PlannedUpdate } from "../../core/compare";
import { matchSpools } from "../../core/match";
import { makeSpool } from "../../core/testing";

const text = JSON.stringify({
  version: 1,
  settings: { units: "g" },
  printLogs: [],
  filaments: [
    {
      id: "a887c461-2221-4f86-b7d3-ecce1f088619",
      type: "PLA-Silk",
      brand: "Mika 3D",
      price: 0,
      colorHex: "#FF9753",
      colorName: "Black/Orange",
      extraColors: ["#000000"],
      nozzleTempMin: 180,
      bedTempMin: 0,
      spoolmanId: 51,
      batchNumber: "spoolstock:spool:422070b7",
      weightTotal: 250,
      weightRemaining: 250,
      purchaseDate: "2026-09-30",
      notes: "Supplier note",
    },
  ],
});

describe("loadSpoolioJson", () => {
  test("reads a Spoolio export with Spoolman and Spoolstock cross-ids", () => {
    const result = loadSpoolioJson(text);
    expect(result.warnings).toEqual([]);
    expect(result.spools).toHaveLength(1);
    const dual = result.spools.find((s) => s.sourceId === "a887c461-2221-4f86-b7d3-ecce1f088619")!;
    expect(dual).toMatchObject({
      crossIds: {
        spoolioId: dual.sourceId,
        spoolmanId: 51,
        spoolstockShortId: "422070b7",
      },
      vendor: "Mika 3D",
      material: "PLA-Silk",
      name: "Black/Orange",
      colors: ["FF9753", "000000"],
      nozzleTempMin: 180,
      bedTempMin: null,
      initialWeight: 250,
      remainingWeight: 250,
      price: null,
      purchasedOn: "2026-09-30",
    });
  });

  test("rejects files that are not Spoolio exports", () => {
    expect(() => loadSpoolioJson("not json")).toThrow(/valid JSON/);
    expect(() => loadSpoolioJson('{"version":1}')).toThrow(/Spoolio export/);
  });
});

describe("exportSpoolioJson", () => {
  test("unknown remaining weights and prices are written as numeric zero like real exports", () => {
    const empty = loadSpoolioJson('{"version":1,"filaments":[]}');
    for (const value of [null, 0]) {
      const group = matchSpools([
        makeSpool("spoolman", "1", { remainingWeight: value, price: value }),
      ]).groups[0]!;
      const changes = buildPlan(
        [group],
        new Map([[group.id, { values: {}, createIn: ["spoolio"] }]]),
      ).get("spoolio")!;
      const output = exportSpoolioJson(empty, changes);
      const written = JSON.parse(output.json).filaments[0];
      expect(written.weightRemaining).toBe(0);
      expect(written.price).toBe(0);
      expect(loadSpoolioJson(output.json).spools[0]).toMatchObject({
        remainingWeight: 0,
        price: null,
      });
      if (value === null) expect(output.warnings.join(" ")).toContain("unknown remaining weight");
    }
    const loaded = loadSpoolioJson(
      '{"version":1,"filaments":[{"id":"a","weightRemaining":100,"price":20}]}',
    );
    const cleared = exportSpoolioJson(loaded, [
      {
        kind: "update",
        source: "spoolio",
        groupId: "group",
        spool: loaded.spools[0]!,
        links: {},
        changes: [
          { field: "remainingWeight", from: 100, to: null },
          { field: "price", from: 20, to: null },
        ],
      },
    ]);
    expect(loadSpoolioJson(cleared.json).spools[0]).toMatchObject({
      remainingWeight: 0,
      price: null,
    });
    expect(cleared.warnings.join(" ")).toContain("unknown remaining weight");
  });
  test("preserves richer material names through Spoolio's canonical types and later note edits", () => {
    const loaded = loadSpoolioJson('{"version":1,"filaments":[]}');
    const { groups } = matchSpools([
      makeSpool("spoolman", "900", {
        material: "PLA-Glow",
        comment: "Keep dry",
        price: 0,
      }),
    ]);
    const changes = buildPlan(
      groups,
      new Map([[groups[0]!.id, { values: {}, createIn: ["spoolio"] }]]),
    ).get("spoolio")!;
    const output = exportSpoolioJson(loaded, changes);
    expect(JSON.parse(output.json).filaments[0]).toMatchObject({
      type: "PLA",
      notes: "[Original material: PLA-Glow]\nKeep dry",
    });
    const reloaded = loadSpoolioJson(output.json);
    expect(reloaded.spools[0]).toMatchObject({
      material: "PLA-Glow",
      comment: "Keep dry",
      price: null,
    });
    const updated = exportSpoolioJson(reloaded, [
      {
        kind: "update",
        source: "spoolio",
        groupId: "x",
        spool: reloaded.spools[0]!,
        links: {},
        changes: [{ field: "comment", from: "Keep dry", to: "New note" }],
      },
    ]);
    expect(loadSpoolioJson(updated.json).spools[0]).toMatchObject({
      material: "PLA-Glow",
      comment: "New note",
    });
  });
  test("applies updates, adds new filaments and keeps the rest of the export", () => {
    const loaded = loadSpoolioJson(text);
    const target = loaded.spools.find((s) => s.crossIds.spoolmanId === 51)!;
    const spoolman = makeSpool("spoolman", "51", {
      crossIds: { spoolmanId: 51 },
      vendor: "Mika 3D",
      material: "PLA-Silk",
      name: "Black/Orange",
      colors: ["FF9753", "000000"],
      remainingWeight: 120,
    });
    const extra = makeSpool("spoolman", "900", {
      crossIds: { spoolmanId: 900, spoolstockShortId: "zz11" },
      vendor: "Elegoo",
      colors: ["FF0000"],
      nozzleTempMin: 200,
    });
    const { groups } = matchSpools([...loaded.spools, spoolman, extra]);
    const linked = groups.find((g) => g.members.spoolio === target)!;
    const single = groups.find((g) => g.members.spoolman === extra)!;
    const plan = buildPlan(
      groups,
      new Map([
        [linked.id, { values: { remainingWeight: 120 }, createIn: [] }],
        [single.id, { values: {}, createIn: ["spoolio"] }],
      ]),
    );
    const result = exportSpoolioJson(loaded, plan.get("spoolio")!);
    expect(result).toMatchObject({ updated: 1, created: 1, total: 2 });

    const file = JSON.parse(result.json);
    expect(file.settings).toEqual(JSON.parse(text).settings);
    expect(file.printLogs).toEqual([]);
    expect(
      file.filaments.find((f: { id: string }) => f.id === target.sourceId).weightRemaining,
    ).toBe(120);
    const added = file.filaments.at(-1);
    expect(added).toMatchObject({
      brand: "Elegoo",
      colorHex: "#FF0000",
      nozzleTempMin: 200,
      bedTempMin: 0,
      spoolmanId: 900,
      batchNumber: "spoolstock:spool:zz11",
    });

    // Round trip: the new filament links back to Spoolman on the next run.
    const reloaded = loadSpoolioJson(result.json);
    expect(reloaded.spools.at(-1)?.crossIds).toMatchObject({
      spoolmanId: 900,
      spoolstockShortId: "zz11",
    });
  });
});

describe("finish and lot number", () => {
  const source =
    '{"version":1,"filaments":[{"id":"a","finish":"Silk","abrasive":true,"batchNumber":"LOT-1","notes":"n"}]}';
  const update = (loaded: ReturnType<typeof loadSpoolioJson>, changes: PlannedUpdate["changes"]) =>
    exportSpoolioJson(loaded, [
      {
        kind: "update",
        source: "spoolio",
        groupId: "group",
        spool: loaded.spools[0]!,
        links: {},
        changes,
      },
    ]);

  test("reads finish and batch number", () => {
    expect(loadSpoolioJson(source).spools[0]).toMatchObject({
      finish: "Silk",
      lotNr: "LOT-1",
    });
  });

  test("reads Spoolio's default Standard finish as no finish", () => {
    const standard = '{"version":1,"filaments":[{"id":"a","finish":"Standard"}]}';
    expect(loadSpoolioJson(standard).spools[0]!.finish).toBeNull();
  });

  test("writes finish and lot number and keeps abrasive", () => {
    const loaded = loadSpoolioJson(source);
    const output = update(loaded, [
      { field: "finish", from: "Silk", to: "Matte" },
      { field: "lotNr", from: "LOT-1", to: "LOT-2" },
    ]);
    const filament = JSON.parse(output.json).filaments[0];
    expect(filament).toMatchObject({
      finish: "Matte",
      batchNumber: "LOT-2",
      abrasive: true,
    });
    expect(loadSpoolioJson(output.json).spools[0]).toMatchObject({
      finish: "Matte",
      lotNr: "LOT-2",
    });
    const cleared = update(loaded, [{ field: "lotNr", from: "LOT-1", to: null }]);
    expect(loadSpoolioJson(cleared.json).spools[0]!.lotNr).toBeNull();
  });

  test("creates filaments with finish and lot number", () => {
    const empty = loadSpoolioJson('{"version":1,"filaments":[]}');
    const { groups } = matchSpools([makeSpool("spoolman", "1", { finish: "Glossy", lotNr: "B7" })]);
    const changes = buildPlan(
      groups,
      new Map([[groups[0]!.id, { values: {}, createIn: ["spoolio"] }]]),
    ).get("spoolio")!;
    const created = loadSpoolioJson(exportSpoolioJson(empty, changes).json).spools[0]!;
    expect(created).toMatchObject({ finish: "Glossy", lotNr: "B7" });
    const plain = matchSpools([makeSpool("spoolman", "2")]).groups;
    const plainChanges = buildPlan(
      plain,
      new Map([[plain[0]!.id, { values: {}, createIn: ["spoolio"] }]]),
    ).get("spoolio")!;
    const plainSpool = loadSpoolioJson(exportSpoolioJson(empty, plainChanges).json).spools[0]!;
    expect(plainSpool.finish).toBeNull();
    expect(JSON.parse(exportSpoolioJson(empty, plainChanges).json).filaments[0].finish).toBe(
      "Standard",
    );
    expect(JSON.parse(exportSpoolioJson(empty, plainChanges).json).filaments[0].abrasive).toBe(
      false,
    );
  });
});

describe("loadSpoolioJson BOM and duplicates", () => {
  test("reads an export that starts with a byte order mark", () => {
    expect(loadSpoolioJson(`﻿${text}`).spools).toHaveLength(1);
  });

  test("warns about a repeated ID at load", () => {
    const result = loadSpoolioJson(
      JSON.stringify({
        version: 1,
        filaments: [
          { id: "a", brand: "First" },
          { id: "a", brand: "Second" },
        ],
      }),
    );
    expect(result.spools).toHaveLength(2);
    expect(result.warnings).toEqual([
      "Filament a appears more than once; each spool needs a unique ID.",
    ]);
  });
});
