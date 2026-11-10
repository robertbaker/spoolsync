import { describe, expect, test } from "bun:test";

import { buildPlan } from "../../core/compare";
import { matchSpools } from "../../core/match";
import { makeSpool } from "../../core/testing";
import { applyToSpoolman, defaultDensity } from "./apply";
import { SpoolmanClient } from "./client";
import { SpoolmanError } from "./connection";
import { createFakeSpoolman } from "./fake-server";
import { spoolmanToCommon } from "./map";
import type { SpoolmanFilament, SpoolmanSpool, SpoolParameters } from "./schema";
import { settleRemainingWeight } from "./spool-parameters";

const vendor = { id: 1, name: "Prusament" };
const filament: SpoolmanFilament = {
  id: 10,
  name: "Galaxy Black",
  material: "PLA",
  density: 1.24,
  diameter: 1.75,
  color_hex: "1A1A1A",
  vendor,
};
const spool = (id: number, overrides: Partial<SpoolmanSpool> = {}): SpoolmanSpool => ({
  id,
  filament,
  initial_weight: 1000,
  remaining_weight: 640,
  archived: false,
  extra: {},
  ...overrides,
});

function setup(spools: SpoolmanSpool[]) {
  const server = createFakeSpoolman({
    vendors: [vendor],
    filaments: [filament],
    spools,
  });
  const client = new SpoolmanClient({ baseUrl: "http://spoolman.test" }, server.fetchImpl, "http:");
  return { server, client };
}

describe("applyToSpoolman", () => {
  test("a new initial weight alone leaves the remaining weight where it was", async () => {
    const { server, client } = setup([spool(51)]);
    const result = await applyToSpoolman(client, [
      {
        kind: "update",
        source: "spoolman",
        groupId: "weight",
        spool: spoolmanToCommon(server.spools.get(51)!),
        links: {},
        changes: [{ field: "initialWeight", from: 1000, to: 750 }],
      },
    ]);
    expect(result[0]!.ok).toBe(true);
    expect(server.spools.get(51)).toMatchObject({
      initial_weight: 750,
      remaining_weight: 640,
    });
  });
  test("filament reuse searches all matching identities for compatible metadata", async () => {
    const original = { ...filament, comment: "Keep these notes" };
    const compatible = { ...original, id: 20, material: "PETG" };
    const incompatible = { ...compatible, id: 30, comment: "Other notes" };
    for (const candidates of [
      [compatible, incompatible],
      [incompatible, compatible],
    ]) {
      const server = createFakeSpoolman({
        vendors: [vendor],
        filaments: [original, ...candidates],
        spools: [spool(51, { filament: original }), spool(52, { filament: original })],
      });
      const client = new SpoolmanClient({ baseUrl: "http://spoolman.test" }, server.fetchImpl);
      const result = await applyToSpoolman(client, [
        {
          kind: "update",
          source: "spoolman",
          groupId: "move",
          spool: spoolmanToCommon(server.spools.get(51)!),
          links: {},
          changes: [{ field: "material", from: "PLA", to: "PETG" }],
        },
      ]);
      expect(result[0]!.ok).toBe(true);
      expect(server.spools.get(51)!.filament.id).toBe(20);
      expect(server.filaments.size).toBe(3);
      expect(server.spools.get(52)!.filament.id).toBe(10);
    }
  });
  test("a deleted target cannot edit a filament still used by another spool", async () => {
    const { server, client } = setup([spool(52)]);
    const deleted = spoolmanToCommon(spool(51));
    const result = await applyToSpoolman(client, [
      {
        kind: "update",
        source: "spoolman",
        groupId: "deleted",
        spool: deleted,
        links: {},
        changes: [{ field: "material", from: "PLA", to: "PETG" }],
      },
    ]);
    expect(result[0]).toMatchObject({ ok: false });
    expect(result[0]!.message).toContain("no longer exists");
    expect(server.filaments.get(10)!.material).toBe("PLA");
    expect(server.spools.get(52)!.filament.material).toBe("PLA");
    expect(server.requests.filter((request) => request.method === "PATCH")).toEqual([]);
  });
  test("new spools do not reuse filaments with conflicting temperatures or inherited values", async () => {
    for (const overrides of [
      { settings_extruder_temp: 250 },
      { settings_bed_temp: 80 },
      { price: 99 },
      { weight: 2000 },
      { spool_weight: 400 },
    ]) {
      const existing = { ...filament, ...overrides };
      const server = createFakeSpoolman({
        vendors: [vendor],
        filaments: [existing],
      });
      const client = new SpoolmanClient(
        { baseUrl: "http://spoolman.test" },
        server.fetchImpl,
        "http:",
      );
      const log = await applyToSpoolman(client, [
        {
          kind: "create",
          source: "spoolman",
          groupId: "new",
          values: makeSpool("spoolio", "new", {
            initialWeight: null,
            remainingWeight: null,
          }),
          links: {},
          groupIds: {},
        },
      ]);
      expect(log[0]?.ok).toBe(true);
      const created = [...server.spools.values()][0]!;
      expect(created.filament.id).not.toBe(10);
      expect(created.filament).toMatchObject({
        settings_extruder_temp: null,
        settings_bed_temp: null,
        price: null,
        weight: null,
        spool_weight: null,
      });
    }
  });
  test("shared filament moves preserve notes, catalog IDs and extension fields", async () => {
    const original = {
      ...filament,
      comment: "Dry before use",
      external_id: "catalog-42",
      settings_extruder_temp: 210,
      settings_bed_temp: 60,
      extra: {
        source: JSON.stringify("catalog"),
        profile: JSON.stringify("fine"),
      },
    };
    const candidate = {
      ...original,
      id: 20,
      name: "Updated",
      comment: "Unrelated notes",
      external_id: "another-catalog",
      extra: { source: JSON.stringify("other") },
    };
    const server = createFakeSpoolman({
      vendors: [vendor],
      filaments: [original, candidate],
      spools: [spool(51, { filament: original }), spool(52, { filament: original })],
    });
    const client = new SpoolmanClient(
      { baseUrl: "http://spoolman.test" },
      server.fetchImpl,
      "http:",
    );
    const log = await applyToSpoolman(client, [
      {
        kind: "update",
        source: "spoolman",
        groupId: "metadata",
        spool: spoolmanToCommon(server.spools.get(51)!),
        links: {},
        changes: [{ field: "name", from: "Galaxy Black", to: "Updated" }],
      },
    ]);
    expect(log[0]?.ok).toBe(true);
    expect(server.spools.get(51)?.filament.id).not.toBe(20);
    expect(server.spools.get(51)?.filament).toMatchObject({
      name: "Updated",
      comment: original.comment,
      external_id: original.external_id,
      extra: original.extra,
      settings_extruder_temp: 210,
      settings_bed_temp: 60,
    });
    expect(server.spools.get(52)?.filament).toEqual(original);
    expect(server.filaments.get(20)).toEqual(candidate);
  });
  test("moving a shared spool to an existing filament preserves inherited price and weights", async () => {
    for (const requestedPrice of [undefined, 7]) {
      const original = {
        ...filament,
        price: 12,
        weight: 1000,
        spool_weight: 200,
      };
      const candidate = {
        ...original,
        id: 20,
        name: "Updated",
        price: 99,
        weight: 2000,
        spool_weight: 400,
      };
      const server = createFakeSpoolman({
        vendors: [vendor],
        filaments: [original, candidate],
        spools: [51, 52].map((id) =>
          spool(id, {
            filament: original,
            price: null,
            initial_weight: null,
            spool_weight: null,
            remaining_weight: 800,
          }),
        ),
      });
      const client = new SpoolmanClient(
        { baseUrl: "http://spoolman.test" },
        server.fetchImpl,
        "http:",
      );
      const log = await applyToSpoolman(client, [
        {
          kind: "update",
          source: "spoolman",
          groupId: "move",
          spool: spoolmanToCommon(server.spools.get(51)!),
          links: {},
          changes: [
            { field: "name", from: "Galaxy Black", to: "Updated" },
            ...(requestedPrice === undefined
              ? []
              : [{ field: "price" as const, from: 12, to: requestedPrice }]),
          ],
        },
      ]);
      expect(log[0]?.ok).toBe(true);
      expect(server.spools.get(51)).toMatchObject({
        filament: { id: 20 },
        price: requestedPrice ?? 12,
        initial_weight: 1000,
        spool_weight: 200,
      });
      expect(spoolmanToCommon(server.spools.get(51)!)).toMatchObject({
        price: requestedPrice ?? 12,
        initialWeight: 1000,
        emptySpoolWeight: 200,
      });
      expect(server.spools.get(52)?.filament.id).toBe(10);
    }
  });

  test("multicolor edits and shared-filament moves preserve longitudinal direction", async () => {
    for (const shared of [false, true]) {
      const original = {
        ...filament,
        color_hex: null,
        multi_color_hexes: "112233,445566",
        multi_color_direction: "longitudinal",
      };
      const candidate = {
        ...original,
        id: 20,
        name: "Updated",
        multi_color_direction: "coaxial",
      };
      const server = createFakeSpoolman({
        vendors: [vendor],
        filaments: [original, candidate],
        spools: (shared ? [51, 52] : [51]).map((id) => spool(id, { filament: original })),
      });
      const client = new SpoolmanClient(
        { baseUrl: "http://spoolman.test" },
        server.fetchImpl,
        "http:",
      );
      const log = await applyToSpoolman(client, [
        {
          kind: "update",
          source: "spoolman",
          groupId: "direction",
          spool: spoolmanToCommon(server.spools.get(51)!),
          links: {},
          changes: shared
            ? [{ field: "name", from: "Galaxy Black", to: "Updated" }]
            : [
                {
                  field: "colors",
                  from: ["112233", "445566"],
                  to: ["AABBCC", "DDEEFF"],
                },
              ],
        },
      ]);
      expect(log[0]?.ok).toBe(true);
      expect(server.spools.get(51)?.filament.multi_color_direction).toBe("longitudinal");
      expect(server.spools.get(51)?.filament.id).not.toBe(20);
      if (shared) expect(server.spools.get(52)?.filament.id).toBe(10);
    }
  });

  test("clearing a purchase date removes its extra while preserving other extra fields", async () => {
    const { server, client } = setup([
      spool(51, {
        extra: {
          spoolstock_purchased_on: JSON.stringify("2025-05-06"),
          spoolstock_short_id: JSON.stringify("sample"),
        },
      }),
    ]);
    server.fields.spool!.add("spoolstock_purchased_on");
    server.fields.spool!.add("spoolstock_short_id");
    await applyToSpoolman(client, [
      {
        kind: "update",
        source: "spoolman",
        groupId: "date",
        spool: spoolmanToCommon(server.spools.get(51)!),
        links: {},
        changes: [{ field: "purchasedOn", from: "2025-05-06", to: null }],
      },
    ]);
    const patch = server.requests.find((r) => r.method === "PATCH")!.body as {
      extra: Record<string, unknown>;
    };
    expect(patch.extra.spoolstock_purchased_on).toBeNull();
    expect(server.spools.get(51)!.extra).toEqual({
      spoolstock_short_id: JSON.stringify("sample"),
    });
    expect(spoolmanToCommon(server.spools.get(51)!).purchasedOn).toBeNull();
  });
  test("density and barcode corrections never change a sibling spool's filament", async () => {
    const { server, client } = setup([spool(51), spool(52)]);
    const target = spoolmanToCommon(server.spools.get(51)!);
    await applyToSpoolman(client, [
      {
        kind: "update",
        source: "spoolman",
        groupId: "x",
        spool: target,
        links: {},
        changes: [
          { field: "density", from: 1.24, to: 1.3 },
          { field: "upc", from: null, to: "NEW" },
        ],
      },
    ]);
    expect(server.spools.get(51)!.filament).toMatchObject({
      density: 1.3,
      article_number: "NEW",
    });
    expect(server.spools.get(52)!.filament).toMatchObject({
      id: 10,
      density: 1.24,
    });
    expect(server.filaments.get(10)!.article_number).toBeUndefined();
  });
  test("a failed move keeps the original filament shared for subsequent updates", async () => {
    const { server } = setup([spool(51), spool(52)]);
    const client = new SpoolmanClient(
      { baseUrl: "http://spoolman.test" },
      async (input, init) => {
        if (init?.method === "PATCH" && new URL(input).pathname === "/api/v1/spool/51") {
          return new Response("Move failed", { status: 500 });
        }
        return server.fetchImpl(input, init);
      },
      "http:",
    );
    const changes = [51, 52].map((id) => ({
      kind: "update" as const,
      source: "spoolman" as const,
      groupId: String(id),
      spool: spoolmanToCommon(server.spools.get(id)!),
      links: {},
      changes: [{ field: "name" as const, from: "Galaxy Black", to: `New name ${id}` }],
    }));
    const log = await applyToSpoolman(client, changes);
    expect(log.map((entry) => entry.ok)).toEqual([false, true]);
    expect(server.spools.get(51)!.filament).toMatchObject({
      id: 10,
      name: "Galaxy Black",
    });
    expect(server.spools.get(52)!.filament.name).toBe("New name 52");
    expect(
      server.requests.filter(
        (request) => request.method === "PATCH" && request.path === "/filament/10",
      ),
    ).toHaveLength(0);
  });

  test("filament identities preserve separators in material and name", async () => {
    const { server, client } = setup([]);
    const sources = [
      makeSpool("spoolstock", "a", { material: "PLA|silk", name: "Red" }),
      makeSpool("spoolstock", "b", { material: "PLA", name: "silk|Red" }),
    ];
    const { groups } = matchSpools(sources);
    const plan = buildPlan(
      groups,
      new Map(groups.map((group) => [group.id, { values: {}, createIn: ["spoolman" as const] }])),
    );
    const log = await applyToSpoolman(client, plan.get("spoolman")!);
    expect(log.every((entry) => entry.ok)).toBe(true);
    const created = [...server.spools.values()];
    expect(new Set(created.map((entry) => entry.filament.id)).size).toBe(2);
    expect(created.map((entry) => entry.filament.material).sort()).toEqual(["PLA", "PLA|silk"]);
  });

  test("updates spool fields and stamps the Spoolstock id, keeping existing extras", async () => {
    const { server, client } = setup([spool(51, { extra: { other: JSON.stringify("kept") } })]);
    server.fields.spool!.add("other");
    const spoolman = spoolmanToCommon(server.spools.get(51)!);
    const spoolstock = makeSpool("spoolstock", "s1", {
      remainingWeight: 600,
      location: "Shelf B",
    });
    const [group] = matchSpools([spoolman, spoolstock], {
      confirmed: ["spoolman:51|spoolstock:s1"],
      rejected: [],
    }).groups;
    const plan = buildPlan(
      [group!],
      new Map([
        [
          group!.id,
          {
            values: { remainingWeight: 600, location: "Shelf B" },
            createIn: [],
          },
        ],
      ]),
    );

    const log = await applyToSpoolman(client, plan.get("spoolman")!);
    expect(log).toEqual([
      {
        groupId: group!.id,
        ok: true,
        message: "Updated spool #51: remaining (g), location, linked IDs",
      },
    ]);
    const updated = server.spools.get(51)!;
    expect(updated).toMatchObject({
      remaining_weight: 600,
      location: "Shelf B",
      lot_nr: "spoolstock:spool:s1",
    });
    expect(updated.extra).toEqual({
      other: JSON.stringify("kept"),
      spoolstock_short_id: JSON.stringify("s1"),
    });
  });

  test("edits a filament in place when only this spool uses it", async () => {
    const { server, client } = setup([spool(51, { extra: {} })]);
    const spoolman = spoolmanToCommon(server.spools.get(51)!);
    const [group] = matchSpools([spoolman]).groups;
    const plan = buildPlan(
      [group!],
      new Map([
        [
          group!.id,
          {
            values: { name: "Galaxy Black v2", vendor: "Prusa Research" },
            createIn: [],
          },
        ],
      ]),
    );
    // A single-member group has nothing to compare, but chosen values still apply.
    await applyToSpoolman(client, plan.get("spoolman")!);
    const edited = server.filaments.get(10)!;
    expect(edited.name).toBe("Galaxy Black v2");
    expect(edited.vendor?.name).toBe("Prusa Research");
  });

  test("moves the spool to another filament when the current one is shared", async () => {
    const { server, client } = setup([spool(51), spool(52)]);
    const spoolman = spoolmanToCommon(server.spools.get(51)!);
    const [group] = matchSpools([spoolman]).groups;
    const plan = buildPlan(
      [group!],
      new Map([[group!.id, { values: { colors: ["FF0000"] }, createIn: [] }]]),
    );
    const log = await applyToSpoolman(client, plan.get("spoolman")!);
    expect(log[0]?.message).toContain("is shared");
    expect(server.filaments.get(10)!.color_hex).toBe("1A1A1A");
    const moved = server.spools.get(51)!.filament;
    expect(moved.id).not.toBe(10);
    expect(moved.color_hex).toBe("FF0000");
    expect(server.spools.get(52)!.filament.id).toBe(10);
  });

  test("creates a spool on an existing matching filament, or a new one", async () => {
    const { server, client } = setup([]);
    const same = makeSpool("spoolstock", "a1", { purchasedOn: "2026-01-02" });
    const fresh = makeSpool("spoolstock", "b2", {
      vendor: "Elegoo",
      material: "PETG",
      name: "Red",
      colors: ["FF0000"],
      density: null,
      nozzleTempMin: 230,
      nozzleTempMax: 250,
    });
    const { groups } = matchSpools([same, fresh]);
    const plan = buildPlan(
      groups,
      new Map(groups.map((g) => [g.id, { values: {}, createIn: ["spoolman" as const] }])),
    );
    const log = await applyToSpoolman(client, plan.get("spoolman")!);
    expect(log.every((entry) => entry.ok)).toBe(true);

    const created = [...server.spools.values()];
    const onExisting = created.find((s) => s.lot_nr === "spoolstock:spool:a1")!;
    expect(onExisting.filament.id).toBe(10);
    expect(onExisting.extra).toEqual({
      spoolstock_short_id: JSON.stringify("a1"),
      spoolstock_purchased_on: JSON.stringify("2026-01-02"),
    });

    const onNew = created.find((s) => s.lot_nr === "spoolstock:spool:b2")!;
    expect(onNew.filament).toMatchObject({
      material: "PETG",
      density: 1.27,
      settings_extruder_temp: 240,
      vendor: { name: "Elegoo" },
    });
  });

  test("logs a failure and carries on", async () => {
    const { server, client } = setup([spool(51)]);
    const stale = makeSpool("spoolman", "999", {
      crossIds: { spoolmanId: 999 },
    });
    const ok = spoolmanToCommon(server.spools.get(51)!);
    const groups = matchSpools([stale, ok], {
      confirmed: [],
      rejected: ["spoolman:51|spoolman:999"],
    }).groups;
    const plan = buildPlan(
      groups,
      new Map(groups.map((g) => [g.id, { values: { location: "X" }, createIn: [] }])),
    );
    const log = await applyToSpoolman(client, plan.get("spoolman")!);
    expect(log.map((entry) => entry.ok).sort()).toEqual([false, true]);
    expect(server.spools.get(51)!.location).toBe("X");
  });
});

test("defaultDensity uses the base material", () => {
  expect(defaultDensity("PETG-CF")).toBe(1.27);
  expect(defaultDensity(null)).toBe(1.24);
});

describe("applyToSpoolman convergence and guards", () => {
  test("a second sync after writing over-long text and fractional temperatures plans no changes", async () => {
    const { server, client } = setup([spool(51)]);
    const long = "L".repeat(80);
    const longName = "N".repeat(80);
    const wanted = { location: long, lotNr: long, name: longName, nozzleTempMin: 215.5 };
    const run = async () => {
      const spoolman = spoolmanToCommon(server.spools.get(51)!);
      const other = makeSpool("spoolstock", "s1", {
        ...wanted,
        remainingWeight: spoolman.remainingWeight,
      });
      const [group] = matchSpools([spoolman, other], {
        confirmed: ["spoolman:51|spoolstock:s1"],
        rejected: [],
      }).groups;
      const plan = buildPlan(
        [group!],
        new Map([[group!.id, { values: { ...wanted }, createIn: [] }]]),
      );
      const changes = plan.get("spoolman") ?? [];
      const log = await applyToSpoolman(client, changes);
      expect(log.every((entry) => entry.ok)).toBe(true);
      return changes;
    };
    expect((await run()).length).toBeGreaterThan(0);
    const stored = server.spools.get(51)!;
    expect(stored.location).toBe("L".repeat(64));
    expect(stored.filament.name).toBe("N".repeat(64));
    // Stamping the cross-service ids is the only thing left; no field is proposed again.
    const second = await run();
    for (const change of second) {
      if (change.kind === "update") expect(change.changes).toEqual([]);
    }
  });

  test("fractional source temperatures reuse the filament they created", async () => {
    const { server, client } = setup([]);
    const create = () => [
      {
        kind: "create" as const,
        source: "spoolman" as const,
        groupId: "g",
        values: makeSpool("spoolio", "n", { nozzleTempMin: 215.5, nozzleTempMax: 225.5 }),
        links: {},
        groupIds: {},
      },
    ];
    await applyToSpoolman(client, create());
    await applyToSpoolman(client, create());
    expect(server.filaments.size).toBe(2);
    expect(server.spools.size).toBe(2);
  });

  test("fractional source temperatures reuse an existing integer-temperature filament", async () => {
    const existing: SpoolmanFilament = {
      ...filament,
      id: 11,
      weight: 1000,
      settings_extruder_temp: 221,
      settings_bed_temp: 65,
      settings_extruder_temp_min: 216,
      settings_extruder_temp_max: 226,
      settings_bed_temp_min: 60,
      settings_bed_temp_max: 70,
    };
    // The existing filament carries ranges, so the catalog compares them exactly (Spoolman-NG).
    const server = createFakeSpoolman({ vendors: [vendor], filaments: [existing], spools: [] });
    const client = new SpoolmanClient(
      { baseUrl: "http://spoolman.test" },
      server.fetchImpl,
      "http:",
    );
    const create = () => [
      {
        kind: "create" as const,
        source: "spoolman" as const,
        groupId: "g",
        values: makeSpool("spoolio", "n", {
          vendor: vendor.name,
          material: "PLA",
          name: filament.name,
          nozzleTempMin: 215.5,
          nozzleTempMax: 225.5,
          bedTempMin: 59.6,
          bedTempMax: 69.6,
        }),
        links: {},
        groupIds: {},
      },
    ];
    const first = await applyToSpoolman(client, create());
    const second = await applyToSpoolman(client, create());
    expect([...first, ...second].every((entry) => entry.ok)).toBe(true);
    expect(server.requests.filter((r) => r.method === "POST" && r.path === "/filament")).toEqual(
      [],
    );
    expect(server.filaments.size).toBe(1);
    expect(server.spools.size).toBe(2);
  });

  test("a remaining weight with no initial or filament weight is dropped with a note", async () => {
    const { server, client } = setup([spool(51, { initial_weight: undefined })]);
    const result = await applyToSpoolman(client, [
      {
        kind: "update",
        source: "spoolman",
        groupId: "w",
        spool: spoolmanToCommon(server.spools.get(51)!),
        links: {},
        changes: [{ field: "remainingWeight", from: 640, to: 500 }],
      },
    ]);
    expect(result[0]!.ok).toBe(true);
    expect(JSON.stringify(result[0])).toContain("remaining weight not set");
  });

  test("an extras patch sends only the keys that change, never unrelated existing ones", async () => {
    const { server, client } = setup([
      spool(51, {
        extra: { legacy: JSON.stringify("old"), spoolstock_short_id: JSON.stringify("same") },
      }),
    ]);
    server.fields.spool!.add("spoolsync_spoolio_id");
    await applyToSpoolman(client, [
      {
        kind: "update",
        source: "spoolman",
        groupId: "e",
        spool: spoolmanToCommon(server.spools.get(51)!),
        links: { spoolioId: "abc", spoolstockShortId: "same" },
        changes: [{ field: "purchasedOn", from: null, to: null }],
      },
    ]);
    const patch = server.requests.find((r) => r.method === "PATCH")!.body as {
      extra: Record<string, unknown>;
    };
    expect(patch.extra).toEqual({ spoolsync_spoolio_id: JSON.stringify("abc") });
    expect(server.spools.get(51)!.extra!.legacy).toBe(JSON.stringify("old"));
  });

  test("clearing a purchase date that was never stored sends no extra at all", async () => {
    const { server, client } = setup([spool(51, { extra: { legacy: JSON.stringify("old") } })]);
    await applyToSpoolman(client, [
      {
        kind: "update",
        source: "spoolman",
        groupId: "e",
        spool: spoolmanToCommon(server.spools.get(51)!),
        links: {},
        changes: [
          { field: "purchasedOn", from: null, to: null },
          { field: "location", from: null, to: "Shelf" },
        ],
      },
    ]);
    const patch = server.requests.find((r) => r.method === "PATCH")!.body as object;
    expect(patch).not.toHaveProperty("extra");
  });

  test("a temperature range on a server without ranges says it became a midpoint", async () => {
    const { client } = setup([]);
    const log = await applyToSpoolman(client, [
      {
        kind: "create",
        source: "spoolman",
        groupId: "g",
        values: makeSpool("spoolio", "n", { nozzleTempMin: 200, nozzleTempMax: 220 }),
        links: {},
        groupIds: {},
      },
    ]);
    expect(log[0]!.ok).toBe(true);
    expect(log[0]!.message).toContain("midpoint");
  });

  test("a single-temperature Spoolman-NG filament matches instead of being duplicated", async () => {
    const existing: SpoolmanFilament = {
      ...filament,
      id: 11,
      settings_extruder_temp: 220,
      settings_bed_temp: 60,
    };
    const server = createFakeSpoolman({
      vendors: [vendor],
      filaments: [existing],
      spools: [],
      info: { version: "1.0.0", install_type: "docker" },
    });
    const client = new SpoolmanClient(
      { baseUrl: "http://spoolman.test" },
      server.fetchImpl,
      "http:",
    );
    const log = await applyToSpoolman(client, [
      {
        kind: "create",
        source: "spoolman",
        groupId: "g",
        values: makeSpool("spoolio", "n", {
          vendor: vendor.name,
          material: "PLA",
          name: filament.name,
          nozzleTempMin: 220,
          nozzleTempMax: 220,
          bedTempMin: 60,
          bedTempMax: 60,
        }),
        links: {},
        groupIds: {},
      },
    ]);
    expect(log[0]!.ok).toBe(true);
    expect(server.requests.filter((r) => r.method === "POST" && r.path === "/filament")).toEqual(
      [],
    );
  });

  test("a remaining weight after a filament move keeps the spool's weight state valid", async () => {
    const shared = { ...filament, weight: 1000 };
    const server = createFakeSpoolman({
      vendors: [vendor],
      filaments: [shared],
      spools: [
        spool(51, { filament: shared, initial_weight: undefined, remaining_weight: undefined }),
        spool(52, { filament: shared }),
      ],
    });
    const client = new SpoolmanClient(
      { baseUrl: "http://spoolman.test" },
      server.fetchImpl,
      "http:",
    );
    const log = await applyToSpoolman(client, [
      {
        kind: "update",
        source: "spoolman",
        groupId: "m",
        spool: spoolmanToCommon(server.spools.get(51)!),
        links: {},
        changes: [
          { field: "name", from: "Galaxy Black", to: "Renamed" },
          { field: "remainingWeight", from: null, to: 400 },
        ],
      },
    ]);
    expect(log[0]!.ok).toBe(true);
    const stored = server.spools.get(51)!;
    expect(stored.filament.name).toBe("Renamed");
    expect(stored.remaining_weight).toBe(400);
  });

  test("a remaining weight is kept when the new filament supplies the weight", () => {
    const patch: Partial<SpoolParameters> = { filament_id: 20, remaining_weight: 300 };
    const notes: string[] = [];
    settleRemainingWeight(patch, { initial_weight: null }, 800, (text) => notes.push(text));
    expect(patch).toEqual({ filament_id: 20, remaining_weight: 300 });
    expect(notes).toEqual([]);
    const none: Partial<SpoolParameters> = { filament_id: 20, remaining_weight: 300 };
    settleRemainingWeight(none, { initial_weight: null }, null, (text) => notes.push(text));
    expect(none).toEqual({ filament_id: 20 });
    expect(notes).toHaveLength(1);
    const pinned: Partial<SpoolParameters> = { remaining_weight: 300 };
    settleRemainingWeight(pinned, { initial_weight: null }, 800);
    expect(pinned.initial_weight).toBe(800);
  });

  test("notes are separated, and a failed change keeps them", async () => {
    const { server, client } = setup([spool(51)]);
    const long = "L".repeat(70);
    const update = {
      kind: "update" as const,
      source: "spoolman" as const,
      groupId: "n",
      spool: spoolmanToCommon(server.spools.get(51)!),
      links: {},
      changes: [
        { field: "location" as const, from: null, to: long },
        { field: "lotNr" as const, from: null, to: long },
      ],
    };
    const ok = await applyToSpoolman(client, [update]);
    expect(ok[0]!.message).toContain("accepts; lot number was shortened");
    const failing = Object.create(client, {
      updateSpool: {
        value: async () => {
          throw new Error("boom");
        },
      },
    });
    const failed = await applyToSpoolman(failing, [update]);
    expect(failed[0]!.ok).toBe(false);
    expect(failed[0]!.message).toContain("boom (location was shortened");
  });

  test("an auth /info failure is not swallowed, a missing /info is", async () => {
    const { client } = setup([]);
    const denied = Object.create(client, {
      info: {
        value: async () => {
          throw new SpoolmanError("auth", "Spoolman rejected the token", 401);
        },
      },
    });
    const create = {
      kind: "create" as const,
      source: "spoolman" as const,
      groupId: "g",
      values: makeSpool("spoolio", "n"),
      links: {},
      groupIds: {},
    };
    await expect(applyToSpoolman(denied, [create])).rejects.toThrow("rejected the token");
    const missing = Object.create(client, {
      info: {
        value: async () => {
          throw new SpoolmanError("http", "HTTP 404", 404);
        },
      },
    });
    expect((await applyToSpoolman(missing, [create]))[0]!.ok).toBe(true);
  });
});

describe("applyToSpoolman review regressions", () => {
  const ngInfo = { version: "1.0.0", install_type: "docker" };
  const clientFor = (server: ReturnType<typeof createFakeSpoolman>) =>
    new SpoolmanClient({ baseUrl: "http://spoolman.test" }, server.fetchImpl, "http:");
  const createOf = (overrides: Parameters<typeof makeSpool>[2]) => ({
    kind: "create" as const,
    source: "spoolman" as const,
    groupId: "g",
    values: makeSpool("spoolio", "n", overrides),
    links: {},
    groupIds: {},
  });
  const posts = (server: ReturnType<typeof createFakeSpoolman>, path: string) =>
    server.requests.filter((r) => r.method === "POST" && r.path === path);

  test("a range-only Spoolman-NG filament is reused, not duplicated", async () => {
    const existing: SpoolmanFilament = {
      ...filament,
      id: 11,
      settings_extruder_temp_min: 190,
      settings_extruder_temp_max: 220,
    };
    const server = createFakeSpoolman({
      vendors: [vendor],
      filaments: [existing],
      info: ngInfo,
    });
    const log = await applyToSpoolman(clientFor(server), [
      createOf({
        vendor: vendor.name,
        material: "PLA",
        name: filament.name,
        nozzleTempMin: 190,
        nozzleTempMax: 220,
      }),
    ]);
    expect(log[0]!.ok).toBe(true);
    expect(posts(server, "/filament")).toEqual([]);
  });

  test("later spools of one temperature move reuse the filament made for the first", async () => {
    const shared = { ...filament, comment: "keep" };
    const spools = [51, 52, 53, 54].map((id) => spool(id, { filament: shared }));
    const server = createFakeSpoolman({ vendors: [vendor], filaments: [shared], spools });
    const changes = [51, 52, 53].map((id) => ({
      kind: "update" as const,
      source: "spoolman" as const,
      groupId: `t${id}`,
      spool: spoolmanToCommon(server.spools.get(id)!),
      links: {},
      changes: [
        { field: "nozzleTempMin" as const, from: null, to: 215 },
        { field: "nozzleTempMax" as const, from: null, to: 215 },
      ],
    }));
    const log = await applyToSpoolman(clientFor(server), changes);
    expect(log.every((entry) => entry.ok)).toBe(true);
    expect(posts(server, "/filament")).toHaveLength(1);
    const moved = new Set([51, 52, 53].map((id) => server.spools.get(id)!.filament.id));
    expect(moved.size).toBe(1);
    expect(server.spools.get(54)!.filament.id).toBe(shared.id);
  });

  test("an initial weight of 0 does not block a remaining weight change", async () => {
    const weighed = { ...filament, weight: 1000 };
    const server = createFakeSpoolman({
      vendors: [vendor],
      filaments: [weighed],
      spools: [
        spool(60, {
          filament: weighed,
          initial_weight: 0,
          remaining_weight: 0,
          used_weight: 0,
        }),
      ],
    });
    expect(spoolmanToCommon(server.spools.get(60)!).initialWeight).toBe(1000);
    const log = await applyToSpoolman(clientFor(server), [
      {
        kind: "update",
        source: "spoolman",
        groupId: "z",
        spool: spoolmanToCommon(server.spools.get(60)!),
        links: {},
        changes: [{ field: "remainingWeight", from: 1000, to: 400 }],
      },
    ]);
    expect(log[0]!.ok).toBe(true);
    expect(server.spools.get(60)).toMatchObject({ initial_weight: 1000, remaining_weight: 400 });
  });

  test("settleRemainingWeight treats an initial weight of 0 as missing", () => {
    const notes: string[] = [];
    const none: Partial<SpoolParameters> = { remaining_weight: 300 };
    settleRemainingWeight(none, { initial_weight: 0 }, null, (text) => notes.push(text));
    expect(none).toEqual({});
    expect(notes).toHaveLength(1);
    const moved: Partial<SpoolParameters> = { filament_id: 20, remaining_weight: 300 };
    settleRemainingWeight(moved, { initial_weight: 0 }, 800);
    expect(moved.initial_weight).toBe(800);
  });

  test("a new spool with an unknown remaining weight omits it and says so", async () => {
    const weighed = { ...filament, weight: 1000 };
    const server = createFakeSpoolman({ vendors: [vendor], filaments: [weighed] });
    const log = await applyToSpoolman(clientFor(server), [
      createOf({
        vendor: vendor.name,
        material: "PLA",
        name: filament.name,
        initialWeight: 1000,
        remainingWeight: null,
      }),
    ]);
    expect(log[0]!.message).toContain("records a new spool as full");
    expect(posts(server, "/spool")[0]!.body).not.toHaveProperty("remaining_weight");
  });

  test("shrinking the initial weight below the remaining weight is capped and noted", async () => {
    const { server, client } = setup([spool(51)]);
    const log = await applyToSpoolman(client, [
      {
        kind: "update",
        source: "spoolman",
        groupId: "w",
        spool: spoolmanToCommon(server.spools.get(51)!),
        links: {},
        changes: [{ field: "initialWeight", from: 1000, to: 500 }],
      },
    ]);
    expect(log[0]!.ok).toBe(true);
    expect(log[0]!.message).toContain("lowered to 500");
    expect(server.spools.get(51)).toMatchObject({ initial_weight: 500, remaining_weight: 500 });
  });

  test("only auth and cancellation stop an apply when /info fails", async () => {
    const { client } = setup([]);
    const withInfo = (error: Error) =>
      Object.create(client, {
        info: {
          value: async () => {
            throw error;
          },
        },
      });
    const create = createOf({});
    const down = await applyToSpoolman(withInfo(new SpoolmanError("http", "HTTP 503", 503)), [
      create,
    ]);
    expect(down[0]!.ok).toBe(true);
    expect(down[0]!.message).toContain("/info was unavailable");
    expect(
      (await applyToSpoolman(withInfo(new SpoolmanError("timeout", "timed out")), [create]))[0]!.ok,
    ).toBe(true);
    await expect(
      applyToSpoolman(withInfo(new SpoolmanError("http", "HTTP 403", 403)), [create]),
    ).rejects.toThrow("403");
    const abort = new Error("aborted");
    abort.name = "AbortError";
    await expect(applyToSpoolman(withInfo(abort), [create])).rejects.toThrow("aborted");
  });

  test("the fake server enforces upstream weight rules and derives used weight", async () => {
    const server = createFakeSpoolman({ vendors: [vendor], filaments: [filament] });
    const send = (method: string, path: string, body: object) =>
      server.fetchImpl(`http://spoolman.test/api/v1${path}`, {
        method,
        body: JSON.stringify(body),
      });
    expect((await send("POST", "/filament", { name: "x", weight: 0 })).status).toBe(422);
    const made = await (
      await send("POST", "/spool", { filament_id: 10, initial_weight: 0, remaining_weight: 5 })
    ).json();
    expect(made.message).toContain("remaining_weight");
    const ok = await (
      await send("POST", "/spool", { filament_id: 10, initial_weight: 1000, remaining_weight: 250 })
    ).json();
    expect(ok.used_weight).toBe(750);
    const zero = await (await send("PATCH", `/spool/${ok.id}`, { initial_weight: 0 })).json();
    expect(zero.remaining_weight).toBe(0);
    const stuck = await (await send("PATCH", `/spool/${ok.id}`, { remaining_weight: 300 })).json();
    expect(stuck.remaining_weight).toBe(0);
  });
});
