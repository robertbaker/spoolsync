import { describe, expect, test } from "bun:test";

import type { PlannedChange, PlannedCreate } from "../../core/compare";
import { makeSpool } from "../../core/testing";
import { applyToSpoolman } from "./apply";
import { SpoolmanClient } from "./client";
import { createFakeSpoolman } from "./fake-server";
import { FilamentCatalog } from "./filament-catalog";
import { exportSpoolmanJson, loadSpoolmanFile } from "./file";
import { spoolmanToCommon } from "./map";
import type { SpoolmanFilament, SpoolmanSpool } from "./schema";

const vendor = { id: 1, name: "Prusament" };
const base: SpoolmanFilament = {
  id: 10,
  name: "Galaxy Black",
  material: "PLA",
  density: 1.24,
  diameter: 1.75,
  color_hex: "1A1A1A",
  vendor,
};
const ng: SpoolmanFilament = {
  ...base,
  settings_extruder_temp: null,
  settings_extruder_temp_min: null,
  settings_extruder_temp_max: null,
  settings_bed_temp: null,
  settings_bed_temp_min: null,
  settings_bed_temp_max: null,
};
const spool = (filament: SpoolmanFilament, extra: Partial<SpoolmanSpool> = {}): SpoolmanSpool => ({
  id: 51,
  filament,
  initial_weight: 1000,
  remaining_weight: 640,
  archived: false,
  extra: {},
  ...extra,
});

function update(
  raw: SpoolmanSpool,
  changes: Array<{ field: string; to: unknown }>,
  links = {},
): PlannedChange {
  return {
    kind: "update",
    source: "spoolman",
    groupId: "g",
    spool: spoolmanToCommon(raw),
    links,
    changes: changes.map((c) => ({ from: null, ...c })),
  } as PlannedChange;
}

function connect(filaments: SpoolmanFilament[], spools: SpoolmanSpool[]) {
  const server = createFakeSpoolman({ vendors: [vendor], filaments, spools });
  const client = new SpoolmanClient({ baseUrl: "http://spoolman.test" }, server.fetchImpl, "http:");
  return { server, client };
}

describe("mapping", () => {
  test("lot number is read, but the Spoolstock link convention is not a lot", () => {
    expect(spoolmanToCommon(spool(base, { lot_nr: "LOT-7" })).lotNr).toBe("LOT-7");
    const linked = spoolmanToCommon(spool(base, { lot_nr: "spoolstock:spool:abc" }));
    expect(linked.lotNr).toBeNull();
    expect(linked.crossIds.spoolstockShortId).toBe("abc");
  });

  test("reads Spoolman-NG ranges, falling back to the single temperature", () => {
    const range = spoolmanToCommon(
      spool({
        ...ng,
        settings_extruder_temp: 215,
        settings_extruder_temp_min: 200,
        settings_extruder_temp_max: 230,
        settings_bed_temp: 60,
      }),
    );
    expect(range).toMatchObject({
      nozzleTempMin: 200,
      nozzleTempMax: 230,
      bedTempMin: 60,
      bedTempMax: 60,
    });
    const single = spoolmanToCommon(spool({ ...base, settings_extruder_temp: 210 }));
    expect([single.nozzleTempMin, single.nozzleTempMax]).toEqual([210, 210]);
  });

  test("a bed temperature of 0 means unset", () => {
    const mapped = spoolmanToCommon(spool({ ...base, settings_bed_temp: 0 }));
    expect([mapped.bedTempMin, mapped.bedTempMax]).toEqual([null, null]);
  });

  test("a per-spool diameter overrides the filament, and finish is read", () => {
    expect(spoolmanToCommon(spool(base, { diameter: 1.72 })).diameter).toBe(1.72);
    expect(spoolmanToCommon(spool(base, { diameter: null })).diameter).toBe(1.75);
    expect(spoolmanToCommon(spool({ ...base, finish: "matte" })).finish).toBe("Matte");
    expect(spoolmanToCommon(spool(base)).finish).toBeNull();
  });
});

describe("file export", () => {
  const exportOf = (raw: SpoolmanSpool, changes: PlannedChange[]) => {
    const loaded = loadSpoolmanFile(JSON.stringify([raw]));
    return JSON.parse(exportSpoolmanJson(loaded, changes).json)[0];
  };

  test("lot number replaces a link-style lot but keeps the link as an extra", () => {
    const raw = spool(base, { lot_nr: "spoolstock:spool:abc" });
    const out = exportOf(raw, [update(raw, [{ field: "lotNr", to: "LOT-9" }])]);
    expect(out.lot_nr).toBe("LOT-9");
    expect(out.extra.spoolstock_short_id).toBe(JSON.stringify("abc"));
  });

  test("min and max changes write the midpoint as the single temperature", () => {
    const raw = spool({
      ...base,
      settings_extruder_temp: 190,
      settings_bed_temp: 50,
    });
    const out = exportOf(raw, [
      update(raw, [
        { field: "nozzleTempMax", to: 230 },
        { field: "nozzleTempMin", to: 210 },
        { field: "bedTempMin", to: null },
        { field: "bedTempMax", to: null },
      ]),
    ]);
    expect(out.filament.settings_extruder_temp).toBe(220);
    expect(out.filament.settings_bed_temp).toBeNull();
    expect(out.filament).not.toHaveProperty("settings_extruder_temp_min");
  });

  test("Spoolman-NG files also get the range", () => {
    const raw = spool(ng);
    const out = exportOf(raw, [
      update(raw, [
        { field: "nozzleTempMin", to: 200 },
        { field: "nozzleTempMax", to: 230 },
      ]),
    ]);
    expect(out.filament).toMatchObject({
      settings_extruder_temp: 215,
      settings_extruder_temp_min: 200,
      settings_extruder_temp_max: 230,
    });
  });

  test("a diameter change goes to the spool override and leaves the filament", () => {
    const raw = spool(base, { diameter: 1.72 });
    const out = exportOf(raw, [update(raw, [{ field: "diameter", to: 1.74 }])]);
    expect(out.diameter).toBe(1.74);
    expect(out.filament.diameter).toBe(1.75);
  });

  test("a colour change to the same RGB keeps the stored alpha", () => {
    const raw = spool({ ...base, color_hex: "1a1a1a80" });
    const out = exportOf(raw, [update(raw, [{ field: "colors", to: ["1A1A1A"] }])]);
    expect(out.filament.color_hex).toBe("1a1a1a80");
    const other = exportOf(raw, [update(raw, [{ field: "colors", to: ["FF0000"] }])]);
    expect(other.filament.color_hex).toBe("FF0000");
  });

  test("new spools carry the lot number and a single temperature", () => {
    const values = makeSpool("spoolstock", "n1", {
      vendor: "Elegoo",
      lotNr: "LOT-3",
      nozzleTempMin: 200,
      nozzleTempMax: 220,
      bedTempMin: 0,
      bedTempMax: 0,
    });
    const create = {
      kind: "create",
      source: "spoolman",
      groupId: "c",
      values,
      links: {},
    } as unknown as PlannedChange;
    const loaded = loadSpoolmanFile("[]");
    const out = JSON.parse(exportSpoolmanJson(loaded, [create]).json)[0];
    expect(out.lot_nr).toBe("LOT-3");
    expect(out.filament.settings_extruder_temp).toBe(210);
    expect(out.filament.settings_bed_temp).toBeNull();
  });
});

describe("file loading", () => {
  test("filament and vendor exports are named instead of failing row by row", () => {
    const filaments = JSON.stringify([{ id: 1, name: "Black", material: "PLA", density: 1.24 }]);
    expect(() => loadSpoolmanFile(filaments)).toThrow(/filament export/);
    expect(() => loadSpoolmanFile("id,name,material,density\n1,Black,PLA,1.24")).toThrow(
      /filament export/,
    );
    const vendors = JSON.stringify([{ id: 1, name: "Prusa", empty_spool_weight: 200 }]);
    expect(() => loadSpoolmanFile(vendors)).toThrow(/vendor export/);
  });
});

describe("API writes", () => {
  test("lot number update keeps the Spoolstock link in an extra", async () => {
    const raw = spool(base, { lot_nr: "spoolstock:spool:abc" });
    const { server, client } = connect([base], [raw]);
    const [entry] = await applyToSpoolman(client, [update(raw, [{ field: "lotNr", to: "LOT-9" }])]);
    expect(entry!.ok).toBe(true);
    const saved = server.spools.get(51)!;
    expect(saved.lot_nr).toBe("LOT-9");
    expect(saved.extra).toMatchObject({
      spoolstock_short_id: JSON.stringify("abc"),
    });
  });

  test("create sends the lot number, falling back to the Spoolstock convention", async () => {
    const { server, client } = connect([], []);
    const make = (lotNr: string | null, id: string): PlannedCreate =>
      ({
        kind: "create",
        source: "spoolman",
        groupId: id,
        links: { spoolstockShortId: "zzz" },
        values: makeSpool("spoolstock", id, {
          vendor: "Prusament",
          material: "PLA",
          lotNr,
        }),
      }) as unknown as PlannedCreate;
    await applyToSpoolman(client, [make("LOT-1", "a"), make(null, "b")]);
    expect([...server.spools.values()].map((s) => s.lot_nr)).toEqual([
      "LOT-1",
      "spoolstock:spool:zzz",
    ]);
  });

  test("filament update writes the midpoint, and the range on Spoolman-NG", async () => {
    for (const [filament, ranged] of [
      [{ ...base, settings_extruder_temp: 190 }, false],
      [ng, true],
    ] as const) {
      const raw = spool(filament);
      const { server, client } = connect([filament], [raw]);
      const [entry] = await applyToSpoolman(client, [
        update(raw, [
          { field: "nozzleTempMin", to: 200 },
          { field: "nozzleTempMax", to: 230 },
          { field: "bedTempMin", to: 55 },
          { field: "bedTempMax", to: 65 },
        ]),
      ]);
      expect(entry!.ok).toBe(true);
      const saved = server.filaments.get(10)!;
      expect(saved).toMatchObject({
        settings_extruder_temp: 215,
        settings_bed_temp: 60,
      });
      if (ranged)
        expect(saved).toMatchObject({
          settings_extruder_temp_min: 200,
          settings_extruder_temp_max: 230,
          settings_bed_temp_min: 55,
          settings_bed_temp_max: 65,
        });
      else expect(saved).not.toHaveProperty("settings_extruder_temp_min");
    }
  });

  test("created filaments get temperatures, ranges only on Spoolman-NG, bed 0 as null", async () => {
    for (const [seed, ranged] of [
      [[], false],
      [[ng], true],
    ] as const) {
      const { server, client } = connect([...seed], []);
      const values = makeSpool("spoolstock", "t", {
        vendor: "Prusament",
        material: "PLA",
        nozzleTempMin: 200,
        nozzleTempMax: 220,
        bedTempMin: 0,
        bedTempMax: 0,
      });
      await applyToSpoolman(client, [
        {
          kind: "create",
          source: "spoolman",
          groupId: "t",
          links: {},
          values,
        } as never,
      ]);
      const created = [...server.filaments.values()].at(-1)!;
      expect(created.settings_extruder_temp).toBe(210);
      expect(created.settings_bed_temp).toBeNull();
      expect(created.settings_extruder_temp_min).toBe(ranged ? 200 : undefined);
    }
  });

  test("a diameter change patches the spool override, not the filament", async () => {
    const raw = spool(base, { diameter: 1.72 });
    const { server, client } = connect([base], [raw]);
    await applyToSpoolman(client, [update(raw, [{ field: "diameter", to: 1.74 }])]);
    expect(server.spools.get(51)!.diameter).toBe(1.74);
    expect(server.filaments.get(10)!.diameter).toBe(1.75);
    expect(server.requests.some((r) => r.method === "PATCH" && r.path === "/filament/10")).toBe(
      false,
    );
  });

  test("a colour change to the same RGB keeps alpha on the API too", async () => {
    const filament = { ...base, color_hex: "1a1a1a80" };
    const raw = spool(filament);
    const { server, client } = connect([filament], [raw]);
    await applyToSpoolman(client, [update(raw, [{ field: "colors", to: ["1A1A1A"] }])]);
    expect(server.filaments.get(10)!.color_hex).toBe("1a1a1a80");
  });

  test("recreating the template vendor keeps its external id and extras", async () => {
    const richVendor = {
      id: 5,
      name: "Acme",
      external_id: "ext-1",
      extra: { k: '"v"' },
    };
    const created: unknown[] = [];
    const catalog = new FilamentCatalog(
      {
        createVendor: async (params) => {
          created.push(params);
          return { id: 9, ...params, extra: params.extra ?? undefined };
        },
        createFilament: async () => base,
      },
      [],
      [],
    );
    await catalog.vendorId("Acme", richVendor);
    await catalog.vendorId("Other", richVendor);
    expect(created[0]).toMatchObject({
      name: "Acme",
      external_id: "ext-1",
      extra: { k: '"v"' },
    });
    expect(created[1]).toEqual({ name: "Other" });
  });
});
