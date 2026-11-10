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

const newValues = (overrides: Record<string, unknown> = {}) => ({
  vendor: "Acme",
  material: "PETG",
  name: "Teal",
  colors: ["008080"],
  initialWeight: 1000,
  remainingWeight: 800,
  emptySpoolWeight: 200,
  location: null,
  archived: false,
  price: null,
  density: null,
  diameter: null,
  nozzleTempMin: null,
  nozzleTempMax: null,
  bedTempMin: null,
  bedTempMax: null,
  td: null,
  comment: null,
  lotNr: null,
  purchasedOn: null,
  ...overrides,
});

const createOf = (overrides: Record<string, unknown> = {}) =>
  ({
    kind: "create",
    source: "filamentDbApp",
    groupId: "n",
    links: {},
    groupIds: {},
    values: newValues(overrides),
  }) as unknown as PlannedChange;

/** A filament with no empty-spool weight of its own. */
const bareSnapshot = () => {
  const doc = snapshot();
  (doc.collections.filaments as object[]).push({
    _id: "bare",
    name: "Bare Teal",
    colorName: "Teal",
    vendor: "Acme",
    type: "PETG",
    color: "#008080",
    spools: [],
  });
  return doc;
};

test("a new spool on a filament without an empty-spool weight is written without a tare", async () => {
  const calls: Array<[string, unknown]> = [];
  const log = await applyToFilamentDbApp(
    { ...client(calls), snapshot: async () => bareSnapshot() },
    [createOf({ price: 25, density: 1.27, nozzleTempMin: 230 })],
  );
  expect(log[0]!.ok).toBe(true);
  // 800 g left, no tare on the filament: reloading must read 800 g again.
  expect(calls).toEqual([["create bare", { totalWeight: 800 }]]);
  const message = log[0]!.message;
  expect(message).toContain("no empty-spool weight");
  expect(message).toContain("price, density, temperatures");
});

test("a new spool with nothing meaningful to store fails early with a clear message", async () => {
  const calls: Array<[string, unknown]> = [];
  const log = await applyToFilamentDbApp(
    { ...client(calls), snapshot: async () => bareSnapshot() },
    [createOf({ initialWeight: null, remainingWeight: null })],
  );
  expect(log[0]!.ok).toBe(false);
  expect(log[0]!.message).toContain("at least a weight, label");
  expect(calls).toEqual([]);
});

test("a new empty-spool weight warns about sibling spools the plan does not update", async () => {
  const doc = snapshot();
  doc.collections.filaments[1]!.spools.push({ _id: "s2", totalWeight: 400 } as never);
  const loaded = await loadInventoryFile("filamentDbApp", JSON.stringify(doc));
  const s1 = loaded.spools.find((s) => s.sourceId === "s1")!;
  const calls: Array<[string, unknown]> = [];
  const log = await applyToFilamentDbApp({ ...client(calls), snapshot: async () => doc }, [
    update(s1, [["emptySpoolWeight", 200, 250]]),
  ]);
  expect(log[0]!.ok).toBe(true);
  expect(log[0]!.message).toContain("1 other spool");
  expect(calls).toContainEqual(["filament var", { spoolWeight: 250 }]);
});

test("clearing a nozzle range endpoint also clears the single nozzle value over the API", async () => {
  const doc = snapshot();
  Object.assign(doc.collections.filaments[1]!, {
    temperatures: { nozzle: 215, nozzleRangeMin: 205, nozzleRangeMax: 225 },
  });
  const loaded = await loadInventoryFile("filamentDbApp", JSON.stringify(doc));
  const s1 = loaded.spools.find((s) => s.sourceId === "s1")!;
  const calls: Array<[string, unknown]> = [];
  await applyToFilamentDbApp({ ...client(calls), snapshot: async () => doc }, [
    update(s1, [["nozzleTempMin", 205, null]]),
  ]);
  expect(calls).toEqual([
    ["filament var", { "temperatures.nozzleRangeMin": null, "temperatures.nozzle": null }],
  ]);
});

test("the CSV load undoes the export's formula guard and shares one variant name with JSON", async () => {
  const csv = [
    "filament,vendor,type,totalWeight,spoolWeight,lotNumber,label,location,spoolId,filamentId,Parent",
    "'=Odd - Red,'+Acme,PLA,700,200,'-L7,'@note,'=Shelf,s1,var,'=Odd",
  ].join("\n");
  const loaded = await loadInventoryFile("filamentDbApp", csv);
  expect(loaded.spools[0]).toMatchObject({
    vendor: "+Acme",
    name: "Red",
    lotNr: "-L7",
    comment: "@note",
    location: "=Shelf",
  });
  // An unchanged column goes back exactly as the export wrote it; a changed one is guarded again.
  const file = exportFilamentDbAppCsv(loaded as never, [
    update(loaded.spools[0]!, [["comment", "@note", "=new"]]),
  ]);
  const row = (await import("../shared/tabular")).parseRows(file.csv)[0]!;
  expect(row).toMatchObject({ lotnumber: "'-L7", label: "'=new", location: "'=Shelf" });

  // The same variant with no colorName reads as "Red" from JSON as from CSV.
  const doc = snapshot();
  delete (doc.collections.filaments[1] as Record<string, unknown>)["colorName"];
  doc.collections.filaments[1]!.name = "Template - Red";
  doc.collections.filaments[0]!.name = "Template";
  const json = await loadInventoryFile("filamentDbApp", JSON.stringify(doc));
  expect(json.spools.find((s) => s.sourceId === "s1")!.name).toBe("Red");
});

test("a spool known only by its instance id is not updated through the API", async () => {
  const doc = snapshot();
  doc.collections.filaments[1]!.spools = [{ instanceId: "abc123", totalWeight: 700 } as never];
  const loaded = await loadInventoryFile("filamentDbApp", JSON.stringify(doc));
  const spool = loaded.spools.find((s) => s.sourceId === "abc123")!;
  const calls: Array<[string, unknown]> = [];
  const log = await applyToFilamentDbApp({ ...client(calls), snapshot: async () => doc }, [
    update(spool, [["remainingWeight", 500, 400]]),
  ]);
  expect(log[0]!.ok).toBe(false);
  expect(log[0]!.message).toContain("only an instance id");
  expect(calls).toEqual([]);
});

test("a CSV create with no tare known writes the weight without one and warns", async () => {
  const loaded = await load();
  const file = exportFilamentDbAppCsv(loaded as never, [createOf({ price: 20, name: "Nothing" })]);
  const row = (await import("../shared/tabular")).parseRows(file.csv)[0]!;
  expect(row["totalweight"]).toBe("800");
  expect(file.warnings.join(" ")).toContain("no empty-spool weight");
  expect(file.warnings.join(" ")).toContain("price");
});

test("a snapshot export gives every planned spool of a filament its new empty-spool weight, in any order", async () => {
  const doc = snapshot();
  doc.collections.filaments[1]!.spools.push({
    _id: "s2",
    totalWeight: 600,
    lotNumber: "L8",
    retired: false,
  } as never);
  const loaded = await loadInventoryFile("filamentDbApp", JSON.stringify(doc));
  const first = loaded.spools.find((s) => s.sourceId === "s1")!;
  const sibling = loaded.spools.find((s) => s.sourceId === "s2")!;
  expect(first.remainingWeight).toBe(500);
  expect(sibling.remainingWeight).toBe(400);
  // The sibling is listed first and carries no tare change of its own.
  const result = exportFilamentDbApp(loaded as never, [
    update(sibling, [["lotNr", "L8", "L9"]]),
    update(first, [["emptySpoolWeight", 200, 250]]),
  ]);
  const out = JSON.parse(result.json) as ReturnType<typeof snapshot>;
  const spools = out.collections.filaments[1]!.spools as Array<{
    _id: string;
    totalWeight: number;
  }>;
  // Both keep their remaining weight (500 g and 400 g) on top of the new 250 g tare.
  expect(spools.find((s) => s._id === "s1")!.totalWeight).toBe(750);
  expect(spools.find((s) => s._id === "s2")!.totalWeight).toBe(650);
});
