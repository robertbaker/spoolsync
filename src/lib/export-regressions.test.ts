import { expect, test } from "bun:test";

import { loadFilameterFile } from "@spoolsync/core/adapters/filameter";
import { loadSpoolioJson } from "@spoolsync/core/adapters/spoolio";
import { loadThreeDfpFile } from "@spoolsync/core/adapters/threeDfp";
import type { PlannedChange } from "@spoolsync/core/core/compare";
import { makeSpool } from "@spoolsync/core/core/testing";
import { createEmptyInventory, exportInventory, loadInventoryFile } from "@spoolsync/core/workflow";

test("Spoolman newly assigned vendors receive distinct synthetic IDs instead of shared ID zero", async () => {
  const loaded = await loadInventoryFile(
    "spoolman",
    JSON.stringify([
      { id: 1, filament: { id: 10, vendor: null, vendor_id: null } },
      { id: 2, filament: { id: 20, vendor: null, vendor_id: null } },
    ]),
  );
  const output = await exportInventory(
    "spoolman",
    loaded,
    loaded.spools.map((spool, index) => ({
      kind: "update",
      source: "spoolman",
      groupId: spool.sourceId,
      spool,
      links: {},
      changes: [
        { field: "vendor", from: null, to: index === 0 ? "First vendor" : "Second vendor" },
      ],
    })),
  );
  const rows = JSON.parse(output.text);
  expect(rows[0].filament.vendor.id).toBeLessThan(0);
  expect(rows[1].filament.vendor.id).toBeLessThan(0);
  expect(rows[0].filament.vendor.id).not.toBe(rows[1].filament.vendor.id);
  for (const row of rows) expect(row.filament.vendor_id).toBe(row.filament.vendor.id);
  expect(
    (await loadInventoryFile("spoolman", output.text)).spools.map((spool) => spool.vendor),
  ).toEqual(["First vendor", "Second vendor"]);
});

test("Spoolman multicolor edits preserve existing longitudinal direction", async () => {
  const loaded = await loadInventoryFile(
    "spoolman",
    JSON.stringify([
      {
        id: 1,
        filament: {
          id: 10,
          multi_color_hexes: "112233,445566",
          multi_color_direction: "longitudinal",
        },
      },
    ]),
  );
  for (const colors of [["AABBCC", "DDEEFF"], ["AABBCC"], []]) {
    const output = await exportInventory("spoolman", loaded, [
      {
        kind: "update",
        source: "spoolman",
        groupId: "colors",
        spool: loaded.spools[0]!,
        links: {},
        changes: [{ field: "colors", from: loaded.spools[0]!.colors, to: colors }],
      },
    ]);
    expect(JSON.parse(output.text)[0].filament.multi_color_direction).toBe(
      colors.length > 1 ? "longitudinal" : null,
    );
    expect((await loadInventoryFile("spoolman", output.text)).spools[0]?.colors).toEqual(colors);
  }
});

test("Spoolman exports warn when clearing a field reveals a known inherited value", async () => {
  const loaded = await loadInventoryFile(
    "spoolman",
    JSON.stringify([
      {
        id: 1,
        initial_weight: 1100,
        spool_weight: 250,
        price: 15,
        filament: {
          id: 10,
          weight: 1000,
          price: 12,
          vendor: { id: 2, name: "Test", empty_spool_weight: 200 },
        },
      },
    ]),
  );
  const output = await exportInventory("spoolman", loaded, [
    {
      kind: "update",
      source: "spoolman",
      groupId: "clear",
      spool: loaded.spools[0]!,
      links: {},
      changes: [
        { field: "initialWeight", from: 1100, to: null },
        { field: "emptySpoolWeight", from: 250, to: null },
        { field: "price", from: 15, to: null },
      ],
    },
  ]);
  expect(output.warnings).toHaveLength(3);
  expect(output.warnings.join(" ")).toContain("will inherit 1000");
  expect(output.warnings.join(" ")).toContain("will inherit 200");
  expect(output.warnings.join(" ")).toContain("will inherit 12");
  expect((await loadInventoryFile("spoolman", output.text)).spools[0]).toMatchObject({
    initialWeight: 1000,
    emptySpoolWeight: 200,
    price: 12,
  });
  expect((await exportInventory("spoolman", loaded, [])).warnings).toEqual([]);
});

test("3DFilamentProfiles shared catalog IDs do not collapse spools without short codes", async () => {
  const loaded = await loadInventoryFile(
    "threeDfp",
    JSON.stringify([
      { brand: "Test", filament_id: 5206, remaining_grams: 900 },
      { brand: "Test", filament_id: 5206, remaining_grams: 400 },
    ]),
  );
  expect(loaded.spools.map((spool) => spool.sourceId)).toEqual(["row-1", "row-2"]);
  const output = await exportInventory("threeDfp", loaded, [
    {
      kind: "update",
      source: "threeDfp",
      groupId: "second",
      spool: loaded.spools[1]!,
      links: {},
      changes: [{ field: "remainingWeight", from: 400, to: 300 }],
    },
  ]);
  expect(JSON.parse(output.text)).toEqual([
    { brand: "Test", filament_id: 5206, remaining_grams: 900 },
    { brand: "Test", filament_id: 5206, remaining_grams: 300 },
  ]);
  expect(
    (await loadInventoryFile("threeDfp", output.alternateFiles![0]!.text)).spools.map(
      (spool) => spool.remainingWeight,
    ),
  ).toEqual([900, 300]);
});

test("Spoolman file creates use the API writer's material-specific density defaults", async () => {
  const loaded = await createEmptyInventory("spoolman");
  for (const [material, expected] of [
    ["ABS", 1.04],
    ["PETG", 1.27],
    ["PLA", 1.24],
  ] as const) {
    const output = await exportInventory("spoolman", loaded, [
      {
        kind: "create",
        source: "spoolman",
        groupId: material,
        values: makeSpool("spoolio", "1", { material, density: null }),
        links: {},
        groupIds: {},
      },
    ]);
    expect((await loadInventoryFile("spoolman", output.text)).spools[0]?.density).toBe(expected);
  }
  const explicit = await exportInventory("spoolman", loaded, [
    {
      kind: "create",
      source: "spoolman",
      groupId: "explicit",
      values: makeSpool("spoolio", "1", { material: "ABS", density: 1.09 }),
      links: {},
      groupIds: {},
    },
  ]);
  expect((await loadInventoryFile("spoolman", explicit.text)).spools[0]?.density).toBe(1.09);
});

test("Spoolman clearing a vendor also clears its flattened export foreign key", async () => {
  const loaded = await loadInventoryFile(
    "spoolman",
    JSON.stringify([
      {
        id: 1,
        filament: { id: 10, vendor_id: 2, vendor: { id: 2, name: "Original" } },
      },
    ]),
  );
  const output = await exportInventory("spoolman", loaded, [
    {
      kind: "update",
      source: "spoolman",
      groupId: "vendor",
      spool: loaded.spools[0]!,
      links: {},
      changes: [{ field: "vendor", from: "Original", to: null }],
    },
  ]);
  expect(JSON.parse(output.text)[0].filament).toMatchObject({ vendor: null, vendor_id: null });
  expect((await loadInventoryFile("spoolman", output.text)).spools[0]?.vendor).toBeNull();
});

test("Bambuddy refuses CSV values rejected by the target app's integer and color limits", async () => {
  const loaded = await createEmptyInventory("bambuddy");
  for (const [values, message] of [
    [{ initialWeight: 1000.5 }, "whole number of grams"],
    [{ initialWeight: null, remainingWeight: 300.5 }, "whole number of grams"],
    [{ nozzleTempMin: 200.5 }, "nozzleTempMin"],
    [{ nozzleTempMax: 220.5 }, "nozzleTempMax"],
    [
      { colors: Array.from({ length: 10 }, (_, i) => i.toString(16).padStart(6, "0")) },
      "eight secondary colors",
    ],
  ] as const) {
    expect(
      exportInventory("bambuddy", loaded, [
        {
          kind: "create",
          source: "bambuddy",
          groupId: "new",
          values: {
            ...makeSpool("spoolman", "1"),
            ...values,
          },
          links: {},
          groupIds: {},
        },
      ]),
    ).rejects.toThrow(message);
  }
  const result = await exportInventory("bambuddy", loaded, [
    {
      kind: "create",
      source: "bambuddy",
      groupId: "fractional-used",
      values: makeSpool("spoolman", "1", { initialWeight: 250, remainingWeight: 68.3 }),
      links: {},
      groupIds: {},
    },
  ]);
  expect((await loadInventoryFile("bambuddy", result.text)).spools[0]?.remainingWeight).toBeCloseTo(
    68.3,
  );
});

test("Spoolman file edits split shared filament and vendor IDs without conflicting definitions", async () => {
  const filament = { id: 10, material: "PLA", vendor_id: 2, vendor: { id: 2, name: "Original" } };
  const loaded = await loadInventoryFile(
    "spoolman",
    JSON.stringify([
      { id: 1, filament_id: 10, filament },
      { id: 2, filament_id: 10, filament },
      { id: 3, filament: { id: -5, vendor: { id: -8, name: "Existing" } } },
    ]),
  );
  const before = JSON.stringify(loaded);
  const result = await exportInventory("spoolman", loaded, [
    {
      kind: "update",
      source: "spoolman",
      groupId: "edit",
      spool: loaded.spools[0]!,
      links: {},
      changes: [
        { field: "material", from: "PLA", to: "PETG" },
        { field: "vendor", from: "Original", to: "Updated" },
      ],
    },
  ]);
  const rows = JSON.parse(result.text);
  expect(rows[0].filament.id).toBeLessThan(-8);
  expect(rows[0].filament_id).toBe(rows[0].filament.id);
  expect(rows[0].filament.vendor.id).toBeLessThan(rows[0].filament.id);
  expect(rows[0].filament.vendor_id).toBe(rows[0].filament.vendor.id);
  expect(rows[1].filament).toEqual(filament);
  expect((await loadInventoryFile("spoolman", result.text)).spools[0]?.material).toBe("PETG");
  expect(JSON.stringify(loaded)).toBe(before);
});

test("TigerTag reports unsupported diameters and text truncation for creates and updates", async () => {
  const loaded = await loadInventoryFile(
    "tigertag",
    JSON.stringify({
      format: "tigertag",
      kind: "ttag",
      version: 1,
      exportedBy: "account",
      records: [{ uid: "TigerData_sample", name: "Sample", data1: 56 }],
    }),
  );
  const name = "🧵".repeat(10);
  const comment = "N".repeat(501);
  const output = await exportInventory("tigertag", loaded, [
    {
      kind: "update",
      source: "tigertag",
      groupId: "sample",
      spool: loaded.spools[0]!,
      links: {},
      changes: [
        { field: "diameter", from: 1.75, to: 3 },
        { field: "name", from: "Sample", to: name },
        { field: "comment", from: null, to: comment },
      ],
    },
    {
      kind: "create",
      source: "tigertag",
      groupId: "new",
      values: makeSpool("spoolman", "1", { diameter: 3, name, comment }),
      links: {},
      groupIds: {},
    },
  ]);
  expect(
    output.warnings.filter((w) => w.includes("diameter 3 mm was exported as 2.85 mm")),
  ).toHaveLength(2);
  expect(output.warnings.filter((w) => w.includes("28-byte"))).toHaveLength(2);
  expect(output.warnings.filter((w) => w.includes("500-character"))).toHaveLength(2);
  const back = await loadInventoryFile("tigertag", output.text);
  for (const spool of back.spools) {
    expect(spool.diameter).toBe(2.85);
    expect(new TextEncoder().encode(spool.name!).length).toBeLessThanOrEqual(28);
    expect(spool.comment).toHaveLength(500);
  }
});

test("TigerTag exports retain the restore warning when account identity is missing", async () => {
  for (const exportedBy of [null, "account"]) {
    const loaded = await loadInventoryFile(
      "tigertag",
      JSON.stringify({
        format: "tigertag",
        kind: "ttag",
        version: 1,
        exportedBy,
        records: [{ uid: "TigerData_sample", name: "Purple", weight_available: 800 }],
      }),
    );
    const output = await exportInventory("tigertag", loaded, [
      {
        kind: "update",
        source: "tigertag",
        groupId: "sample",
        spool: loaded.spools[0]!,
        links: {},
        changes: [{ field: "comment", from: null, to: "Updated" }],
      },
    ]);
    expect(output.warnings.length).toBe(exportedBy ? 0 : 1);
    if (!exportedBy) expect(output.warnings[0]).toContain("Select Restore");
    expect((await exportInventory("tigertag", loaded, [])).warnings).toEqual([]);
  }
});

test("3DFilamentProfiles creates preserve unknown remaining weights in JSON and CSV", async () => {
  for (const template of ["[]", "short_code,brand,remaining_grams\n"]) {
    const loaded = await loadInventoryFile("threeDfp", template);
    for (const remainingWeight of [null, 0, 300]) {
      const output = await exportInventory("threeDfp", loaded, [
        {
          kind: "create",
          source: "threeDfp",
          groupId: "new",
          values: makeSpool("spoolman", "1", { remainingWeight }),
          links: {},
          groupIds: {},
        },
      ]);
      for (const text of [output.text, output.alternateFiles![0]!.text]) {
        expect((await loadInventoryFile("threeDfp", text)).spools[0]?.remainingWeight).toBe(
          remainingWeight,
        );
      }
    }
  }
});

test("Spoolman clearing remaining weight removes stale derived-weight fallback", async () => {
  const loaded = await loadInventoryFile(
    "spoolman",
    '[{"id":1,"filament":{"id":1,"weight":1000},"initial_weight":1000,"used_weight":200}]',
  );
  const result = await exportInventory("spoolman", loaded, [
    {
      kind: "update",
      source: "spoolman",
      groupId: "weight",
      spool: loaded.spools[0]!,
      links: {},
      changes: [{ field: "remainingWeight", from: 800, to: null }],
    },
  ]);
  expect(JSON.parse(result.text)[0].used_weight).toBeUndefined();
  expect((await loadInventoryFile("spoolman", result.text)).spools[0]?.remainingWeight).toBeNull();
  expect(loaded.spools[0]?.remainingWeight).toBe(800);
});

test("Spoolman uses inherited total weight and preserves remaining weight on total edits", async () => {
  const loaded = await loadInventoryFile(
    "spoolman",
    '[{"id":1,"filament":{"id":1,"weight":1000},"used_weight":200}]',
  );
  for (const [field, to, remaining, used] of [
    ["remainingWeight", 500, 500, 500],
    ["initialWeight", 1200, 800, 400],
  ] as const) {
    const result = await exportInventory("spoolman", loaded, [
      {
        kind: "update",
        source: "spoolman",
        groupId: "weight",
        spool: loaded.spools[0]!,
        links: {},
        changes: [{ field, from: loaded.spools[0]![field], to }],
      },
    ]);
    expect(JSON.parse(result.text)[0].used_weight).toBe(used);
    expect((await loadInventoryFile("spoolman", result.text)).spools[0]?.remainingWeight).toBe(
      remaining,
    );
  }
});

test("Spoolman rejects impossible weight edits instead of exporting contradictory weights", async () => {
  const loaded = await loadInventoryFile(
    "spoolman",
    '[{"id":1,"filament":{"id":1,"weight":1000},"used_weight":200}]',
  );
  for (const [field, to] of [
    ["remainingWeight", -1],
    ["remainingWeight", 1001],
    ["initialWeight", 500],
  ] as const) {
    expect(
      exportInventory("spoolman", loaded, [
        {
          kind: "update",
          source: "spoolman",
          groupId: "weight",
          spool: loaded.spools[0]!,
          links: {},
          changes: [{ field, from: loaded.spools[0]![field], to }],
        },
      ]),
    ).rejects.toThrow("weight");
  }
});

test("clearing a Spoolman purchase date removes the stored extra and preserves unrelated extras", async () => {
  const loaded = await loadInventoryFile(
    "spoolman",
    JSON.stringify([
      {
        id: 1,
        filament: { id: 1 },
        extra: {
          spoolstock_purchased_on: JSON.stringify("2025-05-06"),
          spoolstock_short_id: JSON.stringify("sample"),
        },
      },
    ]),
  );
  const before = JSON.stringify(loaded);
  const result = await exportInventory("spoolman", loaded, [
    {
      kind: "update",
      source: "spoolman",
      groupId: "date",
      spool: loaded.spools[0]!,
      links: {},
      changes: [{ field: "purchasedOn", from: "2025-05-06", to: null }],
    },
  ]);
  const reloaded = await loadInventoryFile("spoolman", result.text);
  expect(reloaded.spools[0]?.purchasedOn).toBeNull();
  expect(reloaded.spools[0]?.crossIds.spoolstockShortId).toBe("sample");
  expect(JSON.parse(result.text)[0].extra.spoolstock_purchased_on).toBeUndefined();
  expect(JSON.stringify(loaded)).toBe(before);
});

test("clearing a TigerTag name cannot restore the old display-name fallback", async () => {
  for (const record of [
    { uid: "TigerData_sample", name: "Purple", color_name: "Purple" },
    { uid: "TigerData_sample", name: "Purple" },
  ]) {
    const loaded = await loadInventoryFile("tigertag", JSON.stringify([record]));
    const before = JSON.stringify(loaded);
    const result = await exportInventory("tigertag", loaded, [
      {
        kind: "update",
        source: "tigertag",
        groupId: "name",
        spool: loaded.spools[0]!,
        links: {},
        changes: [{ field: "name", from: "Purple", to: null }],
      },
    ]);
    expect((await loadInventoryFile("tigertag", result.text)).spools[0]?.name).toBeNull();
    expect(JSON.stringify(loaded)).toBe(before);
  }
});

test("Spoolio preserves unrecognized records and nested extensions on export", async () => {
  const original = {
    version: 1,
    filaments: [
      null,
      "future format",
      42,
      ["extension"],
      { id: "broken", brand: 123 },
      { id: "good", brand: "Before", custom: { settings: [1, 2] } },
    ],
    printLogs: [{ id: "log" }],
    settings: { keep: true },
  };
  const loaded = await loadInventoryFile("spoolio", JSON.stringify(original));
  const before = JSON.stringify(loaded);
  const result = await exportInventory("spoolio", loaded, [
    {
      kind: "update",
      source: "spoolio",
      groupId: "good",
      spool: loaded.spools[0]!,
      links: {},
      changes: [{ field: "vendor", from: "Before", to: "After" }],
    },
  ]);
  expect(JSON.parse(result.text)).toMatchObject({
    ...original,
    filaments: [
      ...original.filaments.slice(0, -1),
      { ...(original.filaments.at(-1) as object), brand: "After" },
    ],
  });
  expect(result.warnings).toContain(
    "5 unrecognized filament records were preserved unchanged and could not be synced.",
  );
  expect(result.total).toBe(1);
  expect(JSON.stringify(loaded)).toBe(before);
  expect(loaded.origin).toBe("file");
});

test("Spoolio rejects duplicate and missing export targets", async () => {
  const duplicate = loadSpoolioJson('{"version":1,"filaments":[{"id":"same"},{"id":"same"}]}');
  expect(exportInventory("spoolio", duplicate, [])).rejects.toThrow("duplicate ID");
  const loaded = await loadInventoryFile("spoolio", '{"version":1,"filaments":[]}');
  expect(
    exportInventory("spoolio", loaded, [
      {
        kind: "update",
        source: "spoolio",
        groupId: "missing",
        spool: makeSpool("spoolio", "missing"),
        links: {},
        changes: [],
      },
    ]),
  ).rejects.toThrow("is missing");
});

test("FilaMeter JSON keeps non-filament records while CSV and totals include only spools", async () => {
  const original = {
    regular: [null, 42, { settings: true }, { _id: "one", filament: "PLA", material: "PLA" }],
    local: [{ keep: true }],
  };
  const loaded = await loadInventoryFile("filameter", JSON.stringify(original));
  const result = await exportInventory("filameter", loaded, []);
  expect(JSON.parse(result.text)).toEqual(original);
  expect(result.total).toBe(1);
  expect(result.alternateFiles?.[0]?.text).toContain("PLA");
  expect(
    (await loadInventoryFile("filameter", result.alternateFiles![0]!.text)).spools,
  ).toHaveLength(1);
});

test("FilaMeter weight updates use the new total regardless of change order", async () => {
  const loaded = await loadInventoryFile(
    "filameter",
    '{"regular":[{"_id":"one","filament":"PLA","total_weight":1000,"used_weight":200}]}',
  );
  const result = await exportInventory("filameter", loaded, [
    {
      kind: "update",
      source: "filameter",
      groupId: "one",
      spool: loaded.spools[0]!,
      links: {},
      changes: [
        { field: "remainingWeight", from: 800, to: 300 },
        { field: "initialWeight", from: 1000, to: 500 },
      ],
    },
  ]);
  expect(JSON.parse(result.text).regular[0]).toMatchObject({ total_weight: 500, used_weight: 200 });
});

test("FilaMeter refuses ambiguous duplicate document IDs", async () => {
  const loaded = loadFilameterFile(
    '{"regular":[{"_id":"same","filament":"PLA"},{"_id":"same","filament":"PETG"}]}',
  );
  expect(exportInventory("filameter", loaded, [])).rejects.toThrow("duplicate IDs");
});

test("missing update targets fail instead of reporting an update that was never saved", async () => {
  for (const source of ["threeDfp", "filameter", "spoolman"] as const) {
    const loaded = await loadInventoryFile(source, "[]");
    expect(
      exportInventory(source, loaded, [
        {
          kind: "update",
          source,
          groupId: "missing",
          spool: makeSpool(source, "missing"),
          changes: [{ field: "name", from: "Old", to: "New" }],
          links: {},
        },
      ]),
    ).rejects.toThrow("is missing");
  }
});

test("FilaMeter updates the selected document without an ID and preserves metadata", async () => {
  const original = {
    regular: [
      { settings: true },
      { filament: "First", total_weight: 1000 },
      { filament: "Second", total_weight: 1000 },
    ],
    local: [{ untouched: true }],
    version: 2,
  };
  const loaded = await loadInventoryFile("filameter", JSON.stringify(original));
  const result = await exportInventory("filameter", loaded, [
    {
      kind: "update",
      source: "filameter",
      groupId: "second",
      spool: loaded.spools[1]!,
      changes: [{ field: "remainingWeight", from: 1000, to: 500 }],
      links: {},
    },
  ]);
  expect(JSON.parse(result.text)).toEqual({
    ...original,
    regular: [
      original.regular[0],
      original.regular[1],
      { ...original.regular[2], used_weight: 500 },
    ],
  });
  expect(JSON.parse((await exportInventory("filameter", loaded, [])).text)).toEqual(original);
});

test("duplicate 3DFilamentProfiles IDs cannot silently discard rows", async () => {
  const loaded = loadThreeDfpFile(
    JSON.stringify([
      { short_code: "same", brand: "A" },
      { short_code: "same", brand: "B" },
    ]),
  );
  expect(exportInventory("threeDfp", loaded, [])).rejects.toThrow("duplicate IDs");
});

test("3DFilamentProfiles preserves rows without IDs and updates the selected row", async () => {
  const loaded = await loadInventoryFile(
    "threeDfp",
    JSON.stringify([
      { brand: "First", remaining_grams: 100 },
      { brand: "Second", remaining_grams: 200 },
    ]),
  );
  const result = await exportInventory("threeDfp", loaded, [
    {
      kind: "update",
      source: "threeDfp",
      groupId: "second",
      spool: loaded.spools[1]!,
      changes: [{ field: "remainingWeight", from: 200, to: 150 }],
      links: {},
    },
  ]);
  expect(JSON.parse(result.text)).toEqual([
    { brand: "First", remaining_grams: 100 },
    { brand: "Second", remaining_grams: 150 },
  ]);
});

test("each newly created 3DFilamentProfiles row gets its own Spoolman link", async () => {
  const loaded = await loadInventoryFile("threeDfp", "[]");
  const changes: PlannedChange[] = [11, 22].map((id) => ({
    kind: "create",
    source: "threeDfp",
    groupId: String(id),
    values: makeSpool("spoolman", String(id)),
    links: {},
    groupIds: { spoolmanId: id },
  }));
  const result = await exportInventory("threeDfp", loaded, changes);
  expect(
    JSON.parse(result.text).map(
      (row: { spool_properties: { spoolman_id: string } }) => row.spool_properties.spoolman_id,
    ),
  ).toEqual(["11", "22"]);
});

test("exporting nested property updates leaves the loaded inventory unchanged", async () => {
  const original = {
    spools: [{ short_code: "abc", brand: "Test", spool_properties: { purchase_price: 10 } }],
    metadata: { version: 3 },
  };
  const loaded = await loadInventoryFile("threeDfp", JSON.stringify(original));
  const before = JSON.stringify(loaded);
  const result = await exportInventory("threeDfp", loaded, [
    {
      kind: "update",
      source: "threeDfp",
      groupId: "abc",
      spool: loaded.spools[0]!,
      changes: [{ field: "price", from: 10, to: 20 }],
      links: { spoolmanId: 12 },
    },
  ]);
  expect(JSON.parse(result.text)).toMatchObject({
    spools: [{ spool_properties: { purchase_price: 20, spoolman_id: "12" } }],
    metadata: { version: 3 },
  });
  expect(JSON.stringify(loaded)).toBe(before);
  const unchanged = await exportInventory("threeDfp", loaded, []);
  expect(JSON.parse(unchanged.text)).toEqual(original);
});
