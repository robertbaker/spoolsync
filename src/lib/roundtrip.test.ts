import { expect, test } from "bun:test";

import type { PlannedCreate } from "@spoolsync/core/core/compare";
import { makeSpool } from "@spoolsync/core/core/testing";
import { createEmptyInventory, exportInventory, loadInventoryFile } from "@spoolsync/core/workflow";

import { parseRows } from "../../packages/spoolsync-core/src/adapters/shared/tabular";

test("3DFilamentProfiles CSV exports use native JSON number and null types", async () => {
  const loaded = await loadInventoryFile(
    "threeDfp",
    "short_code,brand,material,remaining_grams,empty_spool_weight,td_value,filament_id,spool_spoolman_id,spool_purchase_price,spool_preferred_nozzle_temp,spool_preferred_bed_temp,spool_purchase_date\none,Test,PLA,500,200,0.3,5206,1,12,190,,\n",
  );
  const output = await exportInventory("threeDfp", loaded, []);
  expect(JSON.parse(output.text)[0]).toMatchObject({
    remaining_grams: 500,
    empty_spool_weight: 200,
    td_value: 0.3,
    filament_id: 5206,
    spool_properties: {
      spoolman_id: "1",
      purchase_price: 12,
      preferred_nozzle_temp: 190,
      preferred_bed_temp: null,
      purchase_date: null,
      last_dried_date: null,
    },
  });
  expect(parseRows(output.alternateFiles![0]!.text)[0]?.remaining_grams).toBe("500");
});

test("3DFilamentProfiles CSV invalid numeric values cannot silently become null in JSON", async () => {
  await expect(
    loadInventoryFile("threeDfp", "short_code,brand,spool_purchase_price\none,Test,invalid\n"),
  ).rejects.toThrow("spool_purchase_price must contain a finite number");
});

test("Bambuddy exports protect formula-like text and decode it on reimport", async () => {
  const output = await exportInventory("bambuddy", await createEmptyInventory("bambuddy"), [
    {
      kind: "create",
      source: "bambuddy",
      groupId: "text",
      values: makeSpool("spoolman", "1", {
        vendor: "+Brand",
        name: "-Color",
        location: "@Shelf",
        comment: '=HYPERLINK("example")',
      }),
      links: {},
      groupIds: {},
    },
  ]);
  expect(parseRows(output.text)[0]).toMatchObject({
    brand: "'+Brand",
    color_name: "'-Color",
    storage_location: "'@Shelf",
    note: '\'=HYPERLINK("example")',
  });
  expect((await loadInventoryFile("bambuddy", output.text)).spools[0]).toMatchObject({
    vendor: "+Brand",
    name: "-Color",
    location: "@Shelf",
    comment: '=HYPERLINK("example")',
  });
});

test("Bambuddy zero core weights remain known when transferred to Spoolman", async () => {
  for (const text of [
    '[{"id":1,"material":"PLA","core_weight":0,"label_weight":1000,"weight_used":300}]',
    "material,core_weight,label_weight,weight_used\nPLA,0,1000,300\n",
  ]) {
    const source = await loadInventoryFile("bambuddy", text);
    expect(source.spools[0]?.emptySpoolWeight).toBe(0);
    const output = await exportInventory("spoolman", await createEmptyInventory("spoolman"), [
      {
        kind: "create",
        source: "spoolman",
        groupId: "coreless",
        values: source.spools[0]!,
        links: {},
        groupIds: {},
      },
    ]);
    expect((await loadInventoryFile("spoolman", output.text)).spools[0]?.emptySpoolWeight).toBe(0);
  }
  expect(
    (await loadInventoryFile("bambuddy", '[{"id":1,"material":"PLA"}]')).spools[0]
      ?.emptySpoolWeight,
  ).toBeNull();
});

test("Bambuddy reads custom core weights but warns that its CSV importer cannot restore them", async () => {
  const imported = await loadInventoryFile("bambuddy", "material,core_weight\nPLA,145\n");
  expect(imported.spools[0]?.emptySpoolWeight).toBe(145);
  const loaded = await createEmptyInventory("bambuddy");
  const result = await exportInventory("bambuddy", loaded, [
    {
      kind: "create",
      source: "bambuddy",
      groupId: "new",
      values: { ...makeSpool("spoolman", "1"), emptySpoolWeight: 145 },
      links: {},
      groupIds: {},
    },
  ]);
  expect(parseRows(result.text)[0]?.core_weight).toBeUndefined();
  expect(result.warnings.some((warning) => warning.includes("does not accept core_weight"))).toBe(
    true,
  );
  expect((await exportInventory("bambuddy", loaded, [])).text).not.toContain("core_weight");
});

test("FilaMeter missing CSV weights stay unknown through JSON and CSV exports", async () => {
  for (const csv of ["filament\nPLA\n", "filament,total_weight,used_weight\nPLA,,\n"]) {
    const loaded = await loadInventoryFile("filameter", csv);
    const exported = await exportInventory("filameter", loaded, []);
    for (const inventory of [
      loaded,
      await loadInventoryFile("filameter", exported.text),
      await loadInventoryFile("filameter", exported.alternateFiles![0]!.text),
    ]) {
      expect(inventory.spools[0]).toMatchObject({ initialWeight: null, remainingWeight: null });
    }
  }
  for (const [csv, total, remaining] of [
    ["filament,total_weight,used_weight\nPLA,0,0", 0, 0],
    ["filament,remaining,used_weight\nPLA,300,200", 500, 300],
  ] as const) {
    expect((await loadInventoryFile("filameter", csv)).spools[0]).toMatchObject({
      initialWeight: total,
      remainingWeight: remaining,
    });
  }
});

test("3DFilamentProfiles color updates clear stale aliases and secondary colors", async () => {
  for (const colors of [[], ["112233"], ["112233", "445566"]]) {
    const loaded = await loadInventoryFile(
      "threeDfp",
      JSON.stringify([
        {
          short_code: "abc",
          color_hex: "#FF0000",
          rgba: "#FF0000",
          extra_colors: ["#00FF00"],
          colors: ["#0000FF"],
        },
      ]),
    );
    const output = await exportInventory("threeDfp", loaded, [
      {
        kind: "update",
        source: "threeDfp",
        groupId: "abc",
        spool: loaded.spools[0]!,
        links: {},
        changes: [{ field: "colors", from: loaded.spools[0]!.colors, to: colors }],
      },
    ]);
    for (const text of [output.text, output.alternateFiles![0]!.text]) {
      expect((await loadInventoryFile("threeDfp", text)).spools[0]?.colors).toEqual(
        colors.slice(0, 1),
      );
    }
    expect(output.warnings).toHaveLength(colors.length > 1 ? 1 : 0);
  }
});

test("3DFilamentProfiles scalar aliases stay cleared through JSON and CSV", async () => {
  const loaded = await loadInventoryFile(
    "threeDfp",
    '[{"short_code":"abc","vendor":"Old brand","filament_type":"PLA","colour_name":"Old name","remaining":500,"spool_weight":200,"storage_location":"Shelf"}]',
  );
  const output = await exportInventory("threeDfp", loaded, [
    {
      kind: "update",
      source: "threeDfp",
      groupId: "abc",
      spool: loaded.spools[0]!,
      links: {},
      changes: [
        { field: "vendor", from: "Old brand", to: null },
        { field: "material", from: "PLA", to: null },
        { field: "name", from: "Old name", to: null },
        { field: "remainingWeight", from: 500, to: null },
        { field: "emptySpoolWeight", from: 200, to: null },
        { field: "location", from: "Shelf", to: null },
      ],
    },
  ]);
  for (const text of [output.text, output.alternateFiles![0]!.text]) {
    expect((await loadInventoryFile("threeDfp", text)).spools[0]).toMatchObject({
      vendor: null,
      material: null,
      name: null,
      remainingWeight: null,
      emptySpoolWeight: null,
      location: null,
    });
  }
});

test("single-color formats report secondary color loss on creates and updates", async () => {
  for (const source of ["threeDfp", "filameter"] as const) {
    const loaded = await createEmptyInventory(source);
    const created = await exportInventory(source, loaded, [
      {
        kind: "create",
        source,
        groupId: "new",
        values: makeSpool("spoolman", "1", { colors: ["FF0000", "000000"] }),
        links: {},
        groupIds: {},
      },
    ]);
    expect(created.warnings.some((warning) => warning.includes("only the primary color"))).toBe(
      true,
    );
    const reloaded = await loadInventoryFile(source, created.text);
    const updated = await exportInventory(source, reloaded, [
      {
        kind: "update",
        source,
        groupId: "edit",
        spool: reloaded.spools[0]!,
        links: {},
        changes: [{ field: "colors", from: ["FF0000"], to: ["112233", "445566"] }],
      },
    ]);
    expect(updated.warnings.some((warning) => warning.includes("only the primary color"))).toBe(
      true,
    );
  }
});

test("CSV metadata warnings are specific to the alternate file", async () => {
  const original = {
    spools: [{ short_code: "abc", brand: "Test", spool_properties: { custom_value: "keep" } }],
    backup_settings: { keep: true },
  };
  const loaded = await loadInventoryFile("threeDfp", JSON.stringify(original));
  const output = await exportInventory("threeDfp", loaded, []);
  expect(output.warnings).toEqual([]);
  expect(JSON.parse(output.text)).toEqual(original);
  expect(output.alternateFiles![0]!.warnings).toEqual([
    "CSV omits top-level backup metadata. Use JSON to preserve the complete export.",
    "CSV omits unrecognized nested spool properties. Use JSON to preserve those fields.",
  ]);
  const filameter = await exportInventory("filameter", await createEmptyInventory("filameter"), []);
  expect(filameter.warnings).toEqual([]);
  expect(filameter.alternateFiles![0]!.warnings![0]).toContain("document IDs");
});

test("3DFilamentProfiles CSV warns before converting nested extension fields to text", async () => {
  const loaded = await loadInventoryFile("threeDfp", '[{"short_code":"abc","custom":{"value":1}}]');
  const output = await exportInventory("threeDfp", loaded, []);
  expect(output.alternateFiles![0]!.warnings).toContain(
    "CSV converts structured fields to text. Use JSON to preserve their original structure.",
  );
  expect(JSON.parse(output.text)[0].custom).toEqual({ value: 1 });
});

test("3DFilamentProfiles updates synchronize flat and nested metadata in both output formats", async () => {
  const loaded = await loadInventoryFile(
    "threeDfp",
    JSON.stringify([
      {
        id: 42,
        brand: "Test",
        spool_purchase_price: 10,
        spool_purchase_date: "2026-01-01",
        spool_preferred_nozzle_temp: 200,
        spool_preferred_bed_temp: 50,
        spool_spoolman_id: "1",
        spool_properties: {
          purchase_price: 10,
          purchase_date: "2026-01-01",
          preferred_nozzle_temp: 200,
          preferred_bed_temp: 50,
          spoolman_id: "1",
          untouched: "keep",
        },
      },
    ]),
  );
  const output = await exportInventory("threeDfp", loaded, [
    {
      kind: "update",
      source: "threeDfp",
      groupId: "42",
      spool: loaded.spools[0]!,
      links: { spoolmanId: 99 },
      changes: [
        { field: "price", from: 10, to: 20 },
        { field: "purchasedOn", from: "2026-01-01", to: "2026-09-01" },
        { field: "nozzleTempMin", from: 200, to: 220 },
        { field: "bedTempMin", from: 50, to: 60 },
      ],
    },
  ]);
  for (const text of [output.text, output.alternateFiles![0]!.text]) {
    expect((await loadInventoryFile("threeDfp", text)).spools[0]).toMatchObject({
      sourceId: "42",
      price: 20,
      purchasedOn: "2026-09-01",
      nozzleTempMin: 220,
      bedTempMin: 60,
      crossIds: { spoolmanId: 99 },
    });
  }
  expect(JSON.parse(output.text)[0].spool_properties.untouched).toBe("keep");
  expect(loaded.spools[0]?.price).toBe(10);
});

test("3DFilamentProfiles can clear metadata even when flat and nested copies exist", async () => {
  const loaded = await loadInventoryFile(
    "threeDfp",
    '[{"short_code":"abc","spool_purchase_price":10,"spool_preferred_nozzle_temp":200,"spool_properties":{"purchase_price":10,"preferred_nozzle_temp":200}}]',
  );
  const output = await exportInventory("threeDfp", loaded, [
    {
      kind: "update",
      source: "threeDfp",
      groupId: "abc",
      spool: loaded.spools[0]!,
      links: {},
      changes: [
        { field: "price", from: 10, to: null },
        { field: "nozzleTempMin", from: 200, to: null },
      ],
    },
  ]);
  for (const text of [output.text, output.alternateFiles![0]!.text]) {
    expect((await loadInventoryFile("threeDfp", text)).spools[0]).toMatchObject({
      price: null,
      nozzleTempMin: null,
    });
  }
});

test("3DFilamentProfiles note aliases preserve lot links and support clearing comments", async () => {
  for (const alias of ["comment", "description"]) {
    for (const note of ["Old note", "Lot: spoolstock:spool:abc12345\nOld note"]) {
      const loaded = await loadInventoryFile(
        "threeDfp",
        JSON.stringify([{ short_code: "abc", [alias]: note }]),
      );
      const output = await exportInventory("threeDfp", loaded, [
        {
          kind: "update",
          source: "threeDfp",
          groupId: "abc",
          spool: loaded.spools[0]!,
          links: {},
          changes: [{ field: "comment", from: "Old note", to: null }],
        },
      ]);
      const reloaded = await loadInventoryFile("threeDfp", output.text);
      expect(reloaded.spools[0]?.comment).toBeNull();
      expect(reloaded.spools[0]?.crossIds.spoolstockShortId).toBe(
        loaded.spools[0]?.crossIds.spoolstockShortId,
      );
    }
  }
});

test("empty CSV exports reload and can receive newly synced spools", async () => {
  for (const source of ["bambuddy", "filameter", "threeDfp"] as const) {
    const empty = await createEmptyInventory(source);
    const output = await exportInventory(source, empty, []);
    const csv = source === "bambuddy" ? output.text : output.alternateFiles![0]!.text;
    expect(csv.trim().length).toBeGreaterThan(0);
    expect(parseRows(csv)).toEqual([]);
    const reloaded = await loadInventoryFile(source, csv);
    expect(reloaded.spools).toEqual([]);
    expect(reloaded.warnings).toEqual([]);
    const created = await exportInventory(source, reloaded, [
      {
        kind: "create",
        source,
        groupId: "new",
        values: makeSpool("spoolman", "1", { name: "New spool", remainingWeight: 700 }),
        links: {},
        groupIds: {},
      },
    ]);
    const createdCsv = source === "bambuddy" ? created.text : created.alternateFiles![0]!.text;
    const final = await loadInventoryFile(source, createdCsv);
    expect(final.spools).toHaveLength(1);
    expect(final.spools[0]).toMatchObject({
      name: "New spool",
      material: "PLA",
      remainingWeight: 700,
    });
  }
});

test("header-only CSVs still reject the wrong service and malformed rows", async () => {
  for (const source of ["bambuddy", "filameter", "threeDfp"] as const) {
    await expect(loadInventoryFile(source, "first_name,last_name\r\n")).rejects.toThrow();
  }
  await expect(loadInventoryFile("bambuddy", "material,brand\nPLA,First\n,Second")).rejects.toThrow(
    "data row 2 is missing a material",
  );
});

test("FilaMeter remaining-only CSV derives total from remaining plus used", async () => {
  const loaded = await loadInventoryFile(
    "filameter",
    "filament,remaining,used_weight\nPLA,600,400",
  );
  expect(loaded.spools[0]).toMatchObject({ initialWeight: 1000, remainingWeight: 600 });
});

test("FilaMeter preserves remaining weight when only initial weight changes", async () => {
  const loaded = await loadInventoryFile(
    "filameter",
    '{"regular":[{"_id":"one","filament":"PLA","total_weight":1000,"used_weight":400}]}',
  );
  const output = await exportInventory("filameter", loaded, [
    {
      kind: "update",
      source: "filameter",
      groupId: "one",
      spool: loaded.spools[0]!,
      changes: [{ field: "initialWeight", from: 1000, to: 2000 }],
      links: {},
    },
  ]);
  expect((await loadInventoryFile("filameter", output.text)).spools[0]).toMatchObject({
    initialWeight: 2000,
    remainingWeight: 600,
  });
});

test("new Bambuddy and FilaMeter spools retain known remaining weight without a known total", async () => {
  for (const source of ["bambuddy", "filameter"] as const) {
    const loaded = await loadInventoryFile(source, "[]");
    const output = await exportInventory(source, loaded, [
      {
        kind: "create",
        source,
        groupId: "one",
        values: makeSpool("spoolman", "1", { initialWeight: null, remainingWeight: 600 }),
        links: {},
        groupIds: {},
      },
    ]);
    expect((await loadInventoryFile(source, output.text)).spools[0]?.remainingWeight).toBe(600);
    expect(output.warnings.some((warning) => warning.includes("initial weight was unknown"))).toBe(
      true,
    );
  }
});

test("unknown remaining weight exports as full with a warning instead of silently empty", async () => {
  for (const source of ["bambuddy", "filameter"] as const) {
    const loaded = await loadInventoryFile(source, "[]");
    const output = await exportInventory(source, loaded, [
      {
        kind: "create",
        source,
        groupId: "one",
        values: makeSpool("spoolman", "1", { initialWeight: 1000, remainingWeight: null }),
        links: {},
        groupIds: {},
      },
    ]);
    expect((await loadInventoryFile(source, output.text)).spools[0]?.remainingWeight).toBe(1000);
    expect(
      output.warnings.some((warning) => warning.includes("remaining weight was unknown")),
    ).toBe(true);
  }
});

test("FilaMeter zero-weight spools stay zero and Bambuddy missing totals stay unknown", async () => {
  const filameter = await loadInventoryFile(
    "filameter",
    '[{"filament":"Empty","total_weight":0,"used_weight":0}]',
  );
  expect(filameter.spools[0]).toMatchObject({ initialWeight: 0, remainingWeight: 0 });
  const bambuddy = await loadInventoryFile(
    "bambuddy",
    '[{"id":1,"material":"PLA","weight_used":100}]',
  );
  expect(bambuddy.spools[0]?.remainingWeight).toBeNull();
});

test("3DFilamentProfiles numeric IDs stay stable and address the intended export row", async () => {
  const loaded = await loadInventoryFile(
    "threeDfp",
    '[{"id":42,"brand":"First"},{"id":7,"brand":"Second"}]',
  );
  expect(loaded.spools.map((spool) => spool.sourceId)).toEqual(["42", "7"]);
  const output = await exportInventory("threeDfp", loaded, [
    {
      kind: "update",
      source: "threeDfp",
      groupId: "7",
      spool: loaded.spools[1]!,
      changes: [{ field: "vendor", from: "Second", to: "Updated" }],
      links: {},
    },
  ]);
  expect(JSON.parse(output.text)).toEqual([
    { id: 42, brand: "First" },
    { id: 7, brand: "Updated" },
  ]);
});

test("total/used exports reject impossible or negative weights", async () => {
  for (const source of ["bambuddy", "filameter"] as const) {
    const loaded = await loadInventoryFile(source, "[]");
    for (const [initialWeight, remainingWeight] of [
      [500, 600],
      [1000, -1],
    ]) {
      await expect(
        exportInventory(source, loaded, [
          {
            kind: "create",
            source,
            groupId: "bad",
            values: makeSpool("spoolman", "1", {
              initialWeight: initialWeight!,
              remainingWeight: remainingWeight!,
            }),
            links: {},
            groupIds: {},
          },
        ]),
      ).rejects.toThrow("Resolve the weights before exporting");
    }
  }
});

test("Bambuddy converts per-kilogram prices for partial and large spools", async () => {
  const loaded = await loadInventoryFile(
    "bambuddy",
    JSON.stringify([
      { id: 1, material: "PLA", label_weight: 250, cost_per_kg: 20 },
      { id: 2, material: "PETG", label_weight: 2000, cost_per_kg: 20 },
      { id: 3, material: "PLA", label_weight: 250, cost_per_kg: 19.95 },
    ]),
  );
  expect(loaded.spools.map((spool) => spool.price)).toEqual([5, 40, 4.9875]);
  const changes: PlannedCreate[] = loaded.spools.map((spool) => ({
    kind: "create",
    source: "bambuddy",
    groupId: spool.sourceId,
    values: spool,
    links: {},
    groupIds: {},
  }));
  const output = await exportInventory("bambuddy", loaded, changes);
  expect(parseRows(output.text).map((row) => Number(row.cost_per_kg))).toEqual([20, 20, 19.95]);
  expect(
    (await loadInventoryFile("bambuddy", output.text)).spools.map((spool) => spool.price),
  ).toEqual([5, 40, 4.9875]);
});

test("Bambuddy preserves secondary colors through its CSV importer", async () => {
  const loaded = await loadInventoryFile("bambuddy", "[]");
  const output = await exportInventory("bambuddy", loaded, [
    {
      kind: "create",
      source: "bambuddy",
      groupId: "colors",
      values: makeSpool("spoolman", "1", { colors: ["FF0000", "000000", "00FF00"] }),
      links: {},
      groupIds: {},
    },
  ]);
  expect((await loadInventoryFile("bambuddy", output.text)).spools[0]?.colors).toEqual([
    "FF0000",
    "000000",
    "00FF00",
  ]);
});

test("unknown Bambuddy label weights do not produce misleading prices", async () => {
  const loaded = await loadInventoryFile(
    "bambuddy",
    '[{"id":1,"material":"PLA","cost_per_kg":20}]',
  );
  expect(loaded.spools[0]?.price).toBeNull();
  expect(loaded.warnings).toHaveLength(1);
  const output = await exportInventory("bambuddy", loaded, [
    {
      kind: "create",
      source: "bambuddy",
      groupId: "unknown",
      values: makeSpool("spoolman", "1", { initialWeight: null, price: 12 }),
      links: {},
      groupIds: {},
    },
  ]);
  expect(parseRows(output.text)[0]?.cost_per_kg).toBe("");
  expect(output.warnings[0]).toContain("Price was omitted");
});

test("3DFilamentProfiles creates preserve purchase dates in JSON and CSV", async () => {
  for (const input of ["[]", "short_code,brand,remaining_grams\nexisting,Test,500"]) {
    const loaded = await loadInventoryFile("threeDfp", input);
    const output = await exportInventory("threeDfp", loaded, [
      {
        kind: "create",
        source: "threeDfp",
        groupId: "new",
        values: makeSpool("spoolman", "1", { purchasedOn: "2026-09-15" }),
        links: {},
        groupIds: {},
      },
    ]);
    for (const text of [output.text, output.alternateFiles![0]!.text]) {
      expect((await loadInventoryFile("threeDfp", text)).spools.at(-1)?.purchasedOn).toBe(
        "2026-09-15",
      );
    }
  }
});
