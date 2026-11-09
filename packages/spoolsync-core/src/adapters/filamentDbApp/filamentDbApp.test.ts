import { expect, test } from "bun:test";

import { detectInventorySources } from "../../workflow/detect";
import { exportInventory } from "../../workflow/export";
import { loadInventoryFile } from "../../workflow/load";
import { loadFilamentDbApp } from "./api";
import { FilamentDbAppClient, normalizeFilamentDbAppUrl } from "./client";

const snapshot = {
  version: 8,
  collections: {
    locations: [
      { _id: "loc1", name: "Drybox A" },
      { _id: "loc2", name: "Gone", _deletedAt: "2026-01-01T00:00:00Z" },
    ],
    filaments: [
      {
        _id: "f1",
        name: "Prusament PLA",
        vendor: "Prusament",
        type: "PLA",
        color: "#112233",
        density: 1.24,
        diameter: 1.75,
        spoolWeight: 200,
        netFilamentWeight: 1000,
        temperatures: { nozzle: 215, nozzleRangeMin: 205, nozzleRangeMax: 225, bed: 60 },
        spools: [],
      },
      {
        _id: "f2",
        name: "Prusament PLA — Red",
        colorName: "Red",
        vendor: "",
        type: "",
        color: "#ff0000",
        parentId: "f1",
        spools: [
          {
            _id: "s1",
            instanceId: "abc123",
            totalWeight: 700,
            lotNumber: "L7",
            purchaseDate: "2025-03-04T00:00:00.000Z",
            locationId: "loc1",
            retired: false,
          },
          { _id: "s2", totalWeight: 100, retired: true },
          { label: "no id" },
        ],
      },
      {
        _id: "f3",
        name: "Trashed",
        vendor: "X",
        type: "PLA",
        _deletedAt: "2026-01-01",
        spools: [{ _id: "s9" }],
      },
    ],
  },
};

test("loads spools from a snapshot, resolving variants, tare and locations", async () => {
  const loaded = await loadInventoryFile("filamentDbApp", JSON.stringify(snapshot));
  expect(loaded.spools.map((s) => s.sourceId)).toEqual(["s1", "s2"]);
  const [first, second] = loaded.spools;
  expect(first).toMatchObject({
    vendor: "Prusament",
    material: "PLA",
    name: "Red",
    colors: ["FF0000"],
    density: 1.24,
    nozzleTempMin: 205,
    nozzleTempMax: 225,
    bedTempMin: 60,
    initialWeight: 1000,
    emptySpoolWeight: 200,
    remainingWeight: 500,
    location: "Drybox A",
    purchasedOn: "2025-03-04",
    lotNr: "L7",
    archived: false,
    crossIds: { filamentDbAppId: "s1" },
  });
  expect(second).toMatchObject({ remainingWeight: 0, archived: true, location: null });
  expect(loaded.warnings).toEqual(["1 spool has no id and was skipped."]);
});

test("detects a snapshot and a filament list", async () => {
  const json = `\uFEFF  \n${JSON.stringify(snapshot)}`;
  expect(await detectInventorySources("snap.json", json)).toEqual([
    { source: "filamentDbApp", spoolCount: 2 },
  ]);
  const list = JSON.stringify(snapshot.collections.filaments);
  expect((await detectInventorySources("list.json", list)).map((m) => m.source)).toEqual([
    "filamentDbApp",
  ]);
});

test("locationIds skips soft-deleted locations and normalizes ObjectId _id objects", async () => {
  const fetchImpl = async () =>
    Response.json([
      { _id: { $oid: "loc1" }, name: "Drybox A" },
      { _id: "loc2", name: "Deleted Box", _deletedAt: "2026-01-01T00:00:00Z" },
    ]);
  const client = new FilamentDbAppClient({ baseUrl: "http://x", fetchImpl });
  expect(await client.locationIds()).toEqual(new Map([["drybox a", "loc1"]]));
});

test("rejects files that are not Filament DB exports", () => {
  expect(loadInventoryFile("filamentDbApp", "{}")).rejects.toThrow(/Filament DB export/);
  expect(loadInventoryFile("filamentDbApp", "nope")).rejects.toThrow(/spool export/);
  expect(loadInventoryFile("filamentDbApp", "[nope")).rejects.toThrow(/valid JSON/);
});

test("reads the snapshot over the API with an optional bearer key", async () => {
  let seen: { url: string; auth: string | null } | undefined;
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    seen = {
      url: String(input),
      auth: new Headers(init?.headers).get("authorization"),
    };
    return Response.json(snapshot);
  };
  const loaded = await loadFilamentDbApp({
    baseUrl: "192.168.1.5:3456/api",
    token: " key ",
    fetchImpl,
  });
  expect(seen).toEqual({ url: "http://192.168.1.5:3456/api/snapshot", auth: "Bearer key" });
  expect(loaded).toMatchObject({ origin: "api", connectionId: "http://192.168.1.5:3456" });
  expect(loaded.spools).toHaveLength(2);
});

test("explains refused and unreachable servers", () => {
  const refuse = (status: number) => async () => new Response("", { status });
  expect(
    new FilamentDbAppClient({ baseUrl: "http://x", fetchImpl: refuse(401) }).snapshot(),
  ).rejects.toThrow(/API key/);
  expect(
    new FilamentDbAppClient({
      baseUrl: "http://x",
      fetchImpl: async () => {
        throw new Error("down");
      },
    }).snapshot(),
  ).rejects.toThrow(/Could not reach Filament DB/);
  expect(() => normalizeFilamentDbAppUrl("http://u:p@x")).toThrow(/credentials/);
});

import type { PlannedChange } from "../../core/compare";
import { applyToFilamentDbApp } from "./apply";
import { exportFilamentDbApp } from "./export";

async function planUpdate(
  fields: Array<[string, unknown, unknown]>,
): Promise<{ loaded: Awaited<ReturnType<typeof loadInventoryFile>>; change: PlannedChange }> {
  const loaded = await loadInventoryFile("filamentDbApp", JSON.stringify(snapshot));
  const spool = loaded.spools.find((s) => s.sourceId === "s1")!;
  const change = {
    kind: "update",
    source: "filamentDbApp",
    groupId: "g1",
    spool,
    links: {},
    changes: fields.map(([field, from, to]) => ({ field, from, to })),
  } as unknown as PlannedChange;
  return { loaded, change };
}

test("API writes send only spool fields and resolve locations by name", async () => {
  const { change } = await planUpdate([
    ["remainingWeight", 500, 420],
    ["location", "Drybox A", "shelf b"],
    ["archived", false, true],
    ["purchasedOn", "2025-03-04", null],
  ]);
  const sent: unknown[] = [];
  const log = await applyToFilamentDbApp(
    {
      snapshot: async () => snapshot,
      updateFilament: async () => {},
      createSpool: async () => {},
      locationIds: async () => new Map([["shelf b", "loc9"]]),
      updateSpool: async (filamentId, spoolId, patch) => {
        sent.push([filamentId, spoolId, patch]);
      },
    },
    [change],
  );
  expect(log).toEqual([expect.objectContaining({ ok: true })]);
  expect(sent).toEqual([
    ["f2", "s1", { remainingWeight: 420, locationId: "loc9", retired: true, purchaseDate: null }],
  ]);
});

test("a new empty-spool weight leaves the spool's remaining weight where it was", async () => {
  const { change } = await planUpdate([["emptySpoolWeight", 200, 250]]);
  const sent: unknown[] = [];
  const log = await applyToFilamentDbApp(
    {
      snapshot: async () => snapshot,
      createSpool: async () => {},
      locationIds: async () => new Map(),
      updateFilament: async (_id, patch) => {
        sent.push(["filament", patch]);
      },
      updateSpool: async (_filamentId, _spoolId, patch) => {
        sent.push(["spool", patch]);
      },
    },
    [change],
  );
  expect(log).toEqual([expect.objectContaining({ ok: true })]);
  const { remainingWeight } = (change as Extract<PlannedChange, { kind: "update" }>).spool;
  expect(remainingWeight).not.toBeNull();
  expect(sent).toEqual([
    ["filament", { spoolWeight: 250 }],
    ["spool", { remainingWeight }],
  ]);
});

function createChange(values: Record<string, unknown>): PlannedChange {
  return {
    kind: "create",
    source: "filamentDbApp",
    groupId: `g-${String(values["name"] ?? "")}${String(values["vendor"] ?? "")}`,
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
      location: "drybox a",
      purchasedOn: "2026-01-02",
      archived: false,
      ...values,
    },
  } as unknown as PlannedChange;
}

test("API writes fail one change for an unknown location", async () => {
  const { change } = await planUpdate([["location", "Drybox A", "Nowhere"]]);
  const sent: unknown[] = [];
  const log = await applyToFilamentDbApp(
    {
      snapshot: async () => snapshot,
      updateFilament: async () => {},
      locationIds: async () => new Map(),
      updateSpool: async (...args) => {
        sent.push(args);
      },
      createSpool: async () => {},
    },
    [change],
  );
  expect(log.map((entry) => entry.ok)).toEqual([false]);
  expect(log[0]!.message).toContain('Location "Nowhere" does not exist');
  expect(sent).toEqual([]);
});

test("a new spool goes on the one matching variant, never a template", async () => {
  const created: unknown[] = [];
  const client = {
    snapshot: async () => snapshot,
    updateFilament: async () => {},
    locationIds: async () => new Map([["drybox a", "loc1"]]),
    updateSpool: async () => {},
    createSpool: async (id: string, body: object) => {
      created.push([id, body]);
    },
  };
  const log = await applyToFilamentDbApp(client, [
    createChange({}),
    createChange({ name: "Prusament PLA", colors: ["112233"] }),
    createChange({ vendor: "Nobody" }),
  ]);
  expect(log.map((entry) => entry.ok)).toEqual([true, false, false]);
  expect(created).toEqual([
    ["f2", { totalWeight: 1000, purchaseDate: "2026-01-02", locationId: "loc1" }],
  ]);
  expect(log[1]!.message).toContain("No filament in Filament DB matches");
});

test("file export changes the spool in place and keeps the rest of the snapshot", async () => {
  const { loaded, change } = await planUpdate([
    ["remainingWeight", 500, 420],
    ["location", "Drybox A", "Missing"],
    ["archived", false, true],
  ]);
  const result = exportFilamentDbApp(loaded as never, [change]);
  const out = JSON.parse(result.json) as typeof snapshot;
  const spool = out.collections.filaments[1]!.spools![0] as Record<string, unknown>;
  expect(spool).toMatchObject({ totalWeight: 620, retired: true, locationId: "loc1" });
  // The trashed filament and locations survive the round trip.
  expect(out.collections.filaments).toHaveLength(3);
  expect(out.collections.locations).toHaveLength(2);
  expect(result).toMatchObject({ updated: 1, created: 0 });
  expect(result.warnings.join(" ")).toContain('Location "Missing" does not exist');
});

test("file export adds a new spool to the matching filament in the snapshot", async () => {
  const loaded = await loadInventoryFile("filamentDbApp", JSON.stringify(snapshot));
  const result = exportFilamentDbApp(loaded as never, [createChange({})], {
    now: () => Date.UTC(2026, 0, 3),
    randomUUID: () => "0123456789abcdef0123456789abcdef",
  });
  const out = JSON.parse(result.json) as typeof snapshot;
  const added = out.collections.filaments[1]!.spools!.at(-1) as Record<string, unknown>;
  expect(added).toMatchObject({
    _id: "0123456789abcdef01234567",
    instanceId: "6789abcdef",
    totalWeight: 1000,
    locationId: "loc1",
    purchaseDate: "2026-01-02",
    retired: false,
  });
  expect(result).toMatchObject({ created: 1, updated: 0 });
  const reloaded = await loadInventoryFile("filamentDbApp", result.json);
  expect(reloaded.spools.map((s) => s.sourceId)).toContain("0123456789abcdef01234567");
});

const spoolCsv = [
  "filament,vendor,label,totalWeight,lotNumber,purchaseDate,openedDate,location,type,color,spoolWeight,netFilamentWeight,retired,instanceId,filamentId,spoolId,legacyRoll",
  "Prusament PLA Red,Prusament,,700,L7,2025-03-04,,Drybox A,PLA,#ff0000,200,1000,false,abc123,f2,s1,false",
  "Old Roll,Acme,,500,,,,,PETG,#00ff00,,,false,zzz999,f9,,true",
].join("\n");

test("reads the spool CSV export, keying a legacy roll by its filament", async () => {
  const loaded = await loadInventoryFile("filamentDbApp", spoolCsv);
  expect(loaded.spools.map((s) => s.sourceId)).toEqual(["s1", "legacy:f9"]);
  expect(loaded.spools[0]).toMatchObject({
    vendor: "Prusament",
    material: "PLA",
    name: "Prusament PLA Red",
    colors: ["FF0000"],
    remainingWeight: 500,
    emptySpoolWeight: 200,
    initialWeight: 1000,
    location: "Drybox A",
    purchasedOn: "2025-03-04",
    lotNr: "L7",
  });
  expect(loaded.spools[1]).toMatchObject({ remainingWeight: 500, vendor: "Acme" });
  expect((await detectInventorySources("spools.csv", spoolCsv)).map((m) => m.source)).toEqual([
    "filamentDbApp",
  ]);
  expect(loadInventoryFile("filamentDbApp", "a,b\n1,2")).rejects.toThrow(/spool export/);
});

test("a CSV-loaded inventory is written back as an import CSV of the changed spools", async () => {
  const loaded = await loadInventoryFile("filamentDbApp", spoolCsv);
  const mk = (id: string, fields: Array<[string, unknown, unknown]>) =>
    ({
      kind: "update",
      source: "filamentDbApp",
      groupId: `g-${id}`,
      spool: loaded.spools.find((s) => s.sourceId === id)!,
      links: {},
      changes: fields.map(([field, from, to]) => ({ field, from, to })),
    }) as unknown as PlannedChange;
  const exported = await exportInventory("filamentDbApp", loaded, [
    mk("s1", [
      ["remainingWeight", 500, 450],
      ["location", "Drybox A", "Shelf"],
      ["comment", null, "Roll 2"],
      ["vendor", "Prusament", "Acme"],
      ["archived", false, true],
    ]),
    mk("legacy:f9", [["remainingWeight", 500, 300]]),
  ]);
  expect(exported.mediaType).toBe("text/csv");
  const rows = (await import("../shared/tabular")).parseRows(exported.text);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    spoolid: "s1",
    totalweight: "650",
    location: "Shelf",
    label: "Roll 2",
    lotnumber: "L7",
    filament: "Prusament PLA Red",
  });
  expect(exported).toMatchObject({ updated: 1, created: 0 });
  expect(exported.warnings.join(" ")).toMatch(/filament fields/);
  expect(exported.warnings.join(" ")).toMatch(/ignores the retired flag/);
  expect(exported.warnings.join(" ")).toMatch(/stored on the filament itself/);
});

test("reads price per spool from the per-kilogram cost, and the spool label as notes", async () => {
  const withCost = structuredClone(snapshot);
  const parent = withCost.collections.filaments[0] as Record<string, unknown>;
  parent["cost"] = 25;
  (withCost.collections.filaments[1]!.spools![0] as Record<string, unknown>)["label"] = "Roll 3";
  const loaded = await loadInventoryFile("filamentDbApp", JSON.stringify(withCost));
  expect(loaded.spools[0]).toMatchObject({ price: 25, comment: "Roll 3", bedTempMin: 60 });
});

test("every compared field has a destination in Filament DB", async () => {
  const { change } = await planUpdate([
    ["vendor", "Prusament", "Acme"],
    ["material", "PLA", "PETG"],
    ["name", "Red", "Crimson"],
    ["colors", ["FF0000"], ["00FF00", "0000FF"]],
    ["diameter", 1.75, 2.85],
    ["density", 1.24, 1.27],
    ["nozzleTempMin", 205, 230],
    ["nozzleTempMax", 225, 250],
    ["bedTempMin", 60, 80],
    ["initialWeight", 1000, 750],
    ["emptySpoolWeight", 200, 180],
    ["price", 25, 30],
    ["remainingWeight", 500, 400],
    ["purchasedOn", "2025-03-04", "2026-01-01"],
    ["archived", false, true],
    ["comment", null, "Roll 9"],
    ["location", "Drybox A", null],
  ]);
  const calls: Array<[string, unknown]> = [];
  const log = await applyToFilamentDbApp(
    {
      snapshot: async () => snapshot,
      locationIds: async () => new Map(),
      updateFilament: async (id, patch) => void calls.push([`filament ${id}`, patch]),
      updateSpool: async (id, spool, patch) => void calls.push([`spool ${id}/${spool}`, patch]),
      createSpool: async () => {},
    },
    [change],
  );
  expect(log[0]).toMatchObject({ ok: true });
  expect(calls).toEqual([
    [
      "filament f2",
      {
        vendor: "Acme",
        type: "PETG",
        colorName: "Crimson",
        color: "#00FF00",
        secondaryColors: ["#0000FF"],
        diameter: 2.85,
        density: 1.27,
        "temperatures.nozzleRangeMin": 230,
        "temperatures.nozzleRangeMax": 250,
        "temperatures.bed": 80,
        netFilamentWeight: 750,
        spoolWeight: 180,
        cost: 40,
      },
    ],
    [
      "spool f2/s1",
      {
        remainingWeight: 400,
        purchaseDate: "2026-01-01",
        retired: true,
        label: "Roll 9",
        locationId: null,
      },
    ],
  ]);
});

test("a snapshot export applies filament fields and uses the new empty-spool weight", async () => {
  const { loaded, change } = await planUpdate([
    ["colors", ["FF0000"], ["00FF00"]],
    ["emptySpoolWeight", 200, 100],
    ["remainingWeight", 500, 400],
    ["nozzleTempMin", 205, 230],
  ]);
  const result = exportFilamentDbApp(loaded as never, [change]);
  const out = JSON.parse(result.json) as typeof snapshot;
  const variant = out.collections.filaments[1] as Record<string, unknown>;
  expect(variant).toMatchObject({
    color: "#00FF00",
    spoolWeight: 100,
    temperatures: { nozzleRangeMin: 230 },
  });
  // 400 g of filament on a spool that now weighs 100 g.
  expect((variant["spools"] as Array<Record<string, unknown>>)[0]).toMatchObject({
    totalWeight: 500,
  });
});

test("changing emptySpoolWeight alone adjusts totalWeight in snapshot export so remainingWeight is preserved", async () => {
  const { loaded, change } = await planUpdate([["emptySpoolWeight", 200, 120]]);
  const result = exportFilamentDbApp(loaded as never, [change]);
  const reloaded = await loadInventoryFile("filamentDbApp", result.json);
  expect(reloaded.spools[0]).toMatchObject({
    emptySpoolWeight: 120,
    remainingWeight: 500,
  });
});
