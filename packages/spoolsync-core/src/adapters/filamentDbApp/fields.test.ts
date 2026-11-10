import { expect, test } from "bun:test";

import type { PlannedChange } from "../../core/compare";
import { loadInventoryFile } from "../../workflow/load";
import { applyToFilamentDbApp } from "./apply";
import { exportFilamentDbApp } from "./export";
import { exportFilamentDbAppCsv } from "./export-csv";

const snapshot = () => ({
  version: 8,
  collections: {
    locations: [],
    filaments: [
      {
        _id: "tpl",
        name: "Template",
        vendor: "Prusament",
        type: "PLA",
        spoolWeight: 200,
        netFilamentWeight: 1000,
        diameter: 1.75,
        transmissionDistance: 1.4,
        totalWeight: 300,
        spools: [],
      },
      {
        _id: "var",
        name: "Template Red",
        colorName: "Red",
        color: "#ff0000",
        parentId: "tpl",
        spools: [{ _id: "s1", totalWeight: 700, lotNumber: "L7", retired: false }],
      },
      {
        _id: "old",
        name: "Legacy Blue",
        colorName: "Blue",
        vendor: "Acme",
        type: "PETG",
        color: "#0000ff",
        spoolWeight: 150,
        netFilamentWeight: 1000,
        totalWeight: 650,
        transmissionDistance: 0.6,
        spools: [],
      },
    ],
  },
});

async function load() {
  return loadInventoryFile("filamentDbApp", JSON.stringify(snapshot()));
}

function update(spool: object, fields: Array<[string, unknown, unknown]>) {
  return {
    kind: "update",
    source: "filamentDbApp",
    groupId: "g",
    spool,
    links: {},
    changes: fields.map(([field, from, to]) => ({ field, from, to })),
  } as unknown as PlannedChange;
}

const client = (calls: Array<[string, unknown]>) => ({
  snapshot: async () => snapshot(),
  locationIds: async () => new Map<string, string>(),
  updateFilament: async (id: string, patch: object) => void calls.push([`filament ${id}`, patch]),
  updateSpool: async (id: string, spoolId: string, patch: object) =>
    void calls.push([`spool ${id}/${spoolId}`, patch]),
  createSpool: async (id: string, body: object) => void calls.push([`create ${id}`, body]),
});

test("reads the lot and TD, inheriting TD from a template, and no finish", async () => {
  const loaded = await load();
  const red = loaded.spools.find((s) => s.sourceId === "s1")!;
  expect(red).toMatchObject({ lotNr: "L7", td: 1.4, finish: null });
});

test("loads a legacy single-roll filament as one flagged spool and warns", async () => {
  const loaded = await load();
  // The template holds no roll even though it has a stale filament-level weight.
  expect(loaded.spools.map((s) => s.sourceId)).toEqual(["s1", "legacy:old"]);
  const legacy = loaded.spools[1]!;
  expect(legacy).toMatchObject({
    vendor: "Acme",
    material: "PETG",
    name: "Blue",
    emptySpoolWeight: 150,
    remainingWeight: 500,
    initialWeight: 1000,
    td: 0.6,
    lotNr: null,
    archived: false,
  });
  expect(legacy.raw).toMatchObject({ filamentId: "old", legacyRoll: true });
  expect(loaded.warnings.join(" ")).toContain("one roll on the filament itself");
});

test("a legacy roll never goes negative", async () => {
  const doc = snapshot();
  (doc.collections.filaments[2] as Record<string, unknown>)["totalWeight"] = 100;
  const loaded = await loadInventoryFile("filamentDbApp", JSON.stringify(doc));
  expect(loaded.spools.find((s) => s.sourceId === "legacy:old")!.remainingWeight).toBe(0);
});

test("API writes put a legacy roll's weight on the filament and refuse other spool fields", async () => {
  const loaded = await load();
  const legacy = loaded.spools[1]!;
  const calls: Array<[string, unknown]> = [];
  const log = await applyToFilamentDbApp(client(calls), [
    update(legacy, [["remainingWeight", 500, 420]]),
  ]);
  expect(log[0]).toMatchObject({ ok: true });
  // 420 g of filament on a 150 g spool is 570 g on the scale.
  expect(calls).toEqual([["filament old", { totalWeight: 570 }]]);

  const refused: Array<[string, unknown]> = [];
  const failed = await applyToFilamentDbApp(client(refused), [
    update(legacy, [["comment", null, "Roll"]]),
  ]);
  expect(failed[0]!.ok).toBe(false);
  expect(failed[0]!.message).toContain("stored on the filament itself");
  expect(refused).toEqual([]);
});

test("a snapshot export updates a legacy roll in place and warns about unsupported fields", async () => {
  const loaded = await load();
  const legacy = loaded.spools[1]!;
  const result = exportFilamentDbApp(loaded as never, [
    update(legacy, [
      ["remainingWeight", 500, 400],
      ["lotNr", null, "X"],
    ]),
  ]);
  const out = JSON.parse(result.json) as ReturnType<typeof snapshot>;
  expect(out.collections.filaments[2]).toMatchObject({ totalWeight: 550, spools: [] });
  expect(result.updated).toBe(1);
  expect(result.warnings.join(" ")).toContain("stored on the filament itself");
});

test("lot and TD are written through the API as a spool and a filament field", async () => {
  const loaded = await load();
  const red = loaded.spools.find((s) => s.sourceId === "s1")!;
  const calls: Array<[string, unknown]> = [];
  const log = await applyToFilamentDbApp(client(calls), [
    update({ ...red, raw: { filamentId: "var", spool: {} } }, [
      ["lotNr", "L7", "L8"],
      ["td", 1.4, 2],
    ]),
  ]);
  expect(log[0]).toMatchObject({ ok: true });
  expect(calls).toEqual([
    ["filament var", { transmissionDistance: 2 }],
    ["spool var/s1", { lotNumber: "L8" }],
  ]);
  const cleared: Array<[string, unknown]> = [];
  await applyToFilamentDbApp(client(cleared), [
    update({ ...red, raw: { filamentId: "var", spool: {} } }, [["lotNr", "L7", null]]),
  ]);
  expect(cleared).toEqual([["spool var/s1", { lotNumber: null }]]);
});

test("lot and TD are written into a snapshot and a new spool carries its lot", async () => {
  const loaded = await load();
  const red = loaded.spools.find((s) => s.sourceId === "s1")!;
  const result = exportFilamentDbApp(loaded as never, [
    update(red, [
      ["lotNr", "L7", "L8"],
      ["td", 1.4, 2],
    ]),
    {
      kind: "create",
      source: "filamentDbApp",
      groupId: "n",
      links: {},
      groupIds: {},
      values: {
        vendor: "Prusament",
        material: "PLA",
        name: "Red",
        colors: ["FF0000"],
        initialWeight: 1000,
        remainingWeight: 800,
        emptySpoolWeight: null,
        location: null,
        lotNr: "NEW",
        archived: false,
      },
    } as unknown as PlannedChange,
  ]);
  const out = JSON.parse(result.json) as ReturnType<typeof snapshot>;
  const variant = out.collections.filaments[1] as Record<string, unknown>;
  expect(variant["transmissionDistance"]).toBe(2);
  const spools = variant["spools"] as Array<Record<string, unknown>>;
  expect(spools[0]).toMatchObject({ lotNumber: "L8" });
  expect(spools[1]).toMatchObject({ lotNumber: "NEW" });
});

test("a null or tiny diameter is refused instead of being sent", async () => {
  const loaded = await load();
  const red = loaded.spools.find((s) => s.sourceId === "s1")!;
  for (const to of [null, 0, 0.001]) {
    const calls: Array<[string, unknown]> = [];
    const log = await applyToFilamentDbApp(client(calls), [
      update({ ...red, raw: { filamentId: "var", spool: {} } }, [["diameter", 1.75, to]]),
    ]);
    expect(log[0]!.ok).toBe(false);
    expect(log[0]!.message).toContain("at least 0.01 mm");
    expect(calls).toEqual([]);
  }
  const file = exportFilamentDbApp(loaded as never, [update(red, [["diameter", 1.75, null]])]);
  expect(file.warnings.join(" ")).toContain("at least 0.01 mm");
  expect(JSON.parse(file.json).collections.filaments[1]).not.toHaveProperty("diameter");
});

test("the spool CSV writes the lot number column and skips a legacy roll with a warning", async () => {
  const csv = [
    "filament,vendor,type,totalWeight,spoolWeight,lotNumber,spoolId,filamentId",
    "Red,Prusament,PLA,700,200,L7,s1,var",
    "Blue,Acme,PETG,650,150,,,old",
  ].join("\n");
  const loaded = await loadInventoryFile("filamentDbApp", csv);
  const result = exportFilamentDbAppCsv(loaded as never, [
    update(loaded.spools[0]!, [["lotNr", "L7", "L9"]]),
    update(loaded.spools[1]!, [["remainingWeight", 500, 400]]),
  ]);
  expect(result.csv).toContain("L9");
  expect(result.updated).toBe(1);
  expect(result.warnings.join(" ")).toContain("no spool record");
});

test("a variant's CSV row leaves the inherited vendor blank and shares one name with the JSON load", async () => {
  const csv = [
    "filament,vendor,type,totalWeight,spoolWeight,lotNumber,spoolId,filamentId,Parent",
    "Prusament PLA - Red,Prusament,PLA,700,200,L7,s1,var,Prusament PLA",
    "Solo,Acme,PETG,650,150,,s2,solo,",
  ].join("\n");
  const loaded = await loadInventoryFile("filamentDbApp", csv);
  expect(loaded.spools.map((s) => s.name)).toEqual(["Red", "Solo"]);
  const result = exportFilamentDbAppCsv(loaded as never, [
    update(loaded.spools[0]!, [["lotNr", "L7", "L8"]]),
    update(loaded.spools[1]!, [["lotNr", null, "L1"]]),
    {
      kind: "create",
      source: "filamentDbApp",
      groupId: "g",
      values: { ...loaded.spools[0]!, name: "Red", comment: null, lotNr: null },
    } as unknown as PlannedChange,
  ]);
  const rows = (await import("../shared/tabular")).parseRows(result.csv);
  expect(rows[0]).toMatchObject({ filament: "Prusament PLA - Red", vendor: "" });
  expect(rows[1]).toMatchObject({ filament: "Solo", vendor: "Acme" });
  expect(rows[2]).toMatchObject({ filament: "Prusament PLA - Red", vendor: "" });
});

test("a label or lot number over 200 characters is left unchanged with a warning", async () => {
  const loaded = await load();
  const red = loaded.spools.find((s) => s.sourceId === "s1")!;
  const long = "x".repeat(201);
  const file = exportFilamentDbApp(loaded as never, [
    update(red, [
      ["lotNr", null, long],
      ["comment", null, long],
    ]),
  ]);
  expect(file.warnings.join(" ")).toContain("200 characters");
  expect(file.json).not.toContain(long);
});

test("CSV names keep a parent prefix only when a separator follows it", async () => {
  const csv = [
    "filament,vendor,type,totalWeight,spoolWeight,spoolId,filamentId,Parent",
    "PLA+ Red,Acme,PLA,700,200,s1,a,PLA",
    "Basics Red,Acme,PLA,700,200,s2,b,Basic",
    "Basic - Red,Acme,PLA,700,200,s3,c,Basic",
    "Basic Red,Acme,PLA,700,200,s4,d,Basic",
    "Basic,Acme,PLA,700,200,s5,e,Basic",
  ].join("\n");
  const loaded = await loadInventoryFile("filamentDbApp", csv);
  expect(loaded.spools.map((s) => s.name)).toEqual([
    "PLA+ Red",
    "Basics Red",
    "Red",
    "Red",
    "Basic",
  ]);
});

const longText = "x".repeat(201);

test("API updates leave an over-long label or lot number unchanged and still write the rest", async () => {
  const loaded = await load();
  const red = loaded.spools.find((s) => s.sourceId === "s1")!;
  const calls: Array<[string, unknown]> = [];
  const log = await applyToFilamentDbApp(client(calls), [
    update(red, [
      ["lotNr", "L7", longText],
      ["comment", null, longText],
      ["remainingWeight", 500, 400],
    ]),
  ]);
  expect(log[0]!.message).toContain("200 characters");
  expect(log[0]!.ok).toBe(true);
  expect(log[0]!.message).toContain("200 characters");
  expect(JSON.stringify(calls)).not.toContain(longText);
  expect(calls).toEqual([["spool var/s1", { remainingWeight: 400 }]]);
});

test("a new spool with an over-long label omits it with a warning on API and CSV paths", async () => {
  const loaded = await load();
  const values = {
    vendor: "Prusament",
    material: "PLA",
    name: "Red",
    colors: ["FF0000"],
    initialWeight: 1000,
    remainingWeight: 800,
    emptySpoolWeight: null,
    location: null,
    comment: longText,
    lotNr: "OK",
    archived: false,
  };
  const create = {
    kind: "create",
    source: "filamentDbApp",
    groupId: "n",
    links: {},
    groupIds: {},
    values,
  } as unknown as PlannedChange;
  const calls: Array<[string, unknown]> = [];
  const log = await applyToFilamentDbApp(client(calls), [create]);
  expect(log[0]!.ok).toBe(true);
  expect(log[0]!.message).toContain("200 characters");
  expect(calls[0]![1]).not.toHaveProperty("label");
  expect(calls[0]![1]).toMatchObject({ lotNumber: "OK" });

  const file = exportFilamentDbAppCsv(loaded as never, [create]);
  expect(file.created).toBe(1);
  expect(file.csv).not.toContain(longText);
  expect(file.warnings.join(" ")).toContain("200 characters");
});
