import { describe, expect, test } from "bun:test";

import { buildPlan } from "../../core/compare";
import { matchSpools } from "../../core/match";
import { makeSpool } from "../../core/testing";
import { applyToSpoolman, defaultDensity } from "./apply";
import { SpoolmanClient } from "./client";
import { createFakeSpoolman } from "./fake-server";
import { spoolmanToCommon } from "./map";
import type { SpoolmanFilament, SpoolmanSpool } from "./schema";

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
  const server = createFakeSpoolman({ vendors: [vendor], filaments: [filament], spools });
  const client = new SpoolmanClient({ baseUrl: "http://spoolman.test" }, server.fetchImpl, "http:");
  return { server, client };
}

describe("applyToSpoolman", () => {
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
      const server = createFakeSpoolman({ vendors: [vendor], filaments: [existing] });
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
          values: makeSpool("spoolio", "new", { initialWeight: null, remainingWeight: null }),
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
      extra: { source: JSON.stringify("catalog"), profile: JSON.stringify("fine") },
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
      const original = { ...filament, price: 12, weight: 1000, spool_weight: 200 };
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
      const candidate = { ...original, id: 20, name: "Updated", multi_color_direction: "coaxial" };
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
            : [{ field: "colors", from: ["112233", "445566"], to: ["AABBCC", "DDEEFF"] }],
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
    expect(server.spools.get(51)!.extra).toEqual({ spoolstock_short_id: JSON.stringify("sample") });
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
    expect(server.spools.get(51)!.filament).toMatchObject({ density: 1.3, article_number: "NEW" });
    expect(server.spools.get(52)!.filament).toMatchObject({ id: 10, density: 1.24 });
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
    expect(server.spools.get(51)!.filament).toMatchObject({ id: 10, name: "Galaxy Black" });
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
    const spoolstock = makeSpool("spoolstock", "s1", { remainingWeight: 600, location: "Shelf B" });
    const [group] = matchSpools([spoolman, spoolstock], {
      confirmed: ["spoolman:51|spoolstock:s1"],
      rejected: [],
    }).groups;
    const plan = buildPlan(
      [group!],
      new Map([
        [group!.id, { values: { remainingWeight: 600, location: "Shelf B" }, createIn: [] }],
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
          { values: { name: "Galaxy Black v2", vendor: "Prusa Research" }, createIn: [] },
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
    const stale = makeSpool("spoolman", "999", { crossIds: { spoolmanId: 999 } });
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
