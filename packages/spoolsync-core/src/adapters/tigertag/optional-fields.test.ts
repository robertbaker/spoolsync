import { describe, expect, test } from "bun:test";

import { exportTtag, loadTtag } from ".";
import { buildPlan, type PlannedUpdate } from "../../core/compare";
import { matchSpools } from "../../core/match";
import { makeSpool } from "../../core/testing";

const catalogProduct = {
  filament: { aspect1: "Basic", aspect2: null, transmission_dist: null },
  nozzle: { temp_min: 190, temp_max: 240 },
  bed: { temp_min: 25, temp_max: 60 },
};

const record = (extra: Record<string, unknown> = {}) => ({
  uid: "SYNTH1",
  id_type: 142,
  id_brand: 65535,
  id_material: 65535,
  brand: "Synth",
  material: "PLA",
  name: "Purple",
  color_name: "Purple",
  color_r: 108,
  color_g: 71,
  color_b: 178,
  online_color_type: "mono",
  online_color_list: ["#6C47B2FF"],
  id_aspect1: 92,
  id_aspect2: 255,
  data1: 56,
  data2: 190,
  data3: 230,
  data6: 50,
  data7: 60,
  ...extra,
});

const load = (...records: Record<string, unknown>[]) =>
  loadTtag(
    JSON.stringify({
      format: "tigertag",
      kind: "ttag",
      version: 1,
      exportedBy: "me",
      records,
    }),
  );

const update = (
  loaded: ReturnType<typeof load>,
  changes: PlannedUpdate["changes"],
): PlannedUpdate => ({
  kind: "update",
  source: "tigertag",
  groupId: "g",
  spool: loaded.spools[0]!,
  links: {},
  changes,
});

const exported = (loaded: ReturnType<typeof load>, changes: PlannedUpdate["changes"]) => {
  const output = exportTtag(loaded, [update(loaded, changes)]);
  return {
    output,
    file: JSON.parse(output.json).records[0] as Record<string, unknown>,
  };
};

describe("finish (aspect) and TD", () => {
  test("reads the aspect labels and TD", () => {
    expect(load(record({ TD: 4.2 })).spools[0]).toMatchObject({
      finish: "Silk",
      td: 4.2,
    });
    expect(load(record({ id_aspect1: 247, id_aspect2: 92 })).spools[0]!.finish).toBe("Matte, Silk");
    expect(load(record({ id_aspect1: 255 })).spools[0]).toMatchObject({
      finish: null,
      td: null,
    });
    // An id outside the table falls back to the catalogue label.
    expect(load(record({ id_aspect1: 999, catalogProduct })).spools[0]!.finish).toBe("Basic");
    expect(load(record({ id_aspect1: 999 })).spools[0]!.finish).toBeNull();
  });

  test("writes the aspect ids and TD and warns for unknown or surplus aspects", () => {
    const loaded = load(record());
    const { file, output } = exported(loaded, [
      { field: "finish", from: "Silk", to: "Matte, Glow" },
      { field: "td", from: null, to: 3.5 },
    ]);
    expect(file).toMatchObject({ id_aspect1: 247, id_aspect2: 91, TD: 3.5 });
    expect(output.warnings).toEqual([]);
    expect(loadTtag(output.json).spools[0]).toMatchObject({
      finish: "Matte, Glow",
      td: 3.5,
    });

    const odd = exported(loaded, [{ field: "finish", from: "Silk", to: "Plaid, Matte, Silk" }]);
    expect(odd.file).toMatchObject({ id_aspect1: 255, id_aspect2: 247 });
    expect(odd.output.warnings.join("\n")).toContain("Plaid is not a TigerTag aspect");
    expect(odd.output.warnings.join("\n")).toContain("only two aspects fit");

    const cleared = exported(loaded, [{ field: "finish", from: "Silk", to: null }]);
    expect(cleared.file).toMatchObject({ id_aspect1: 255, id_aspect2: 255 });
  });

  test("clears an existing TD without adding the key to records that never had one", () => {
    const withTd = exported(load(record({ TD: 4 })), [{ field: "td", from: 4, to: null }]);
    expect(withTd.file["TD"]).toBeNull();
    const without = exported(load(record()), [{ field: "td", from: null, to: null }]);
    expect("TD" in without.file).toBe(false);
  });

  test("warns when a catalogue-linked record's material, name or finish changes", () => {
    const linked = exported(load(record({ catalogProduct, productKey: "abc" })), [
      { field: "name", from: "Purple", to: "Violet" },
      { field: "colors", from: ["6C47B2"], to: ["FF0000"] },
    ]);
    expect(linked.output.warnings).toHaveLength(1);
    expect(linked.output.warnings[0]).toContain("linked to the TigerTag catalogue");
    expect(linked.output.warnings[0]).toContain("name");
    const unlinked = exported(load(record()), [{ field: "name", from: "Purple", to: "Violet" }]);
    expect(unlinked.output.warnings).toEqual([]);
  });

  test("a created record takes the requested finish and TD", () => {
    const { groups } = matchSpools([
      makeSpool("spoolman", "1", { name: "Plain", finish: "Satin", td: 2.5 }),
    ]);
    const changes = buildPlan(
      groups,
      new Map([[groups[0]!.id, { values: {}, createIn: ["tigertag"] }]]),
    ).get("tigertag")!;
    const spool = loadTtag(exportTtag(loadTtag("{}"), changes).json).spools[0]!;
    expect(spool).toMatchObject({ finish: "Satin", td: 2.5 });
  });
});

describe("TigerTag write fixes", () => {
  test("changing colours keeps online_color_type in step", () => {
    const loaded = load(record());
    expect(
      exported(loaded, [{ field: "colors", from: ["6C47B2"], to: ["FF0000", "0000FF"] }]).file,
    ).toMatchObject({ online_color_type: "multi" });
    const multi = load(
      record({
        online_color_type: "multi",
        color_r2: 0,
        color_g2: 0,
        color_b2: 255,
      }),
    );
    expect(
      exported(multi, [{ field: "colors", from: ["6C47B2", "0000FF"], to: ["FF0000"] }]).file,
    ).toMatchObject({ online_color_type: "mono" });
    const gradient = load(record({ online_color_type: "gradient" }));
    expect(
      exported(gradient, [{ field: "colors", from: ["6C47B2"], to: ["FF0000", "0000FF"] }]).file,
    ).toMatchObject({ online_color_type: "gradient" });
  });

  test("changing colours also updates online_color and the catalogue colour fields in their own format", () => {
    const catalog = {
      color: "#6C47B2FF",
      color_info: { colors: ["#6C47B2FF"], type: "mono" },
      filament: { color: "#6C47B2FF", color_info: { colors: ["#6C47B2FF"], type: "mono" } },
      RFID_Data: { color_r: 108, color_g: 71, color_b: 178 },
    };
    const loaded = load(
      record({ online_color: "#6C47B2FF", color_a: 255, catalogProduct: catalog }),
    );
    const file = exported(loaded, [{ field: "colors", from: ["6C47B2"], to: ["FF0000", "0000FF"] }])
      .file as Record<string, any>;
    expect(file["online_color"]).toBe("#FF0000FF");
    expect(file["online_color_list"]).toEqual(["#FF0000FF", "#0000FFFF"]);
    expect(file["catalogProduct"].color).toBe("#FF0000FF");
    expect(file["catalogProduct"].color_info).toEqual({
      colors: ["#FF0000FF", "#0000FFFF"],
      type: "multi",
    });
    expect(file["catalogProduct"].filament.color).toBe("#FF0000FF");
    expect(file["catalogProduct"].RFID_Data).toEqual({ color_r: 255, color_g: 0, color_b: 0 });
    // A record without these fields does not gain them.
    const bare = exported(load(record()), [{ field: "colors", from: ["6C47B2"], to: ["FF0000"] }])
      .file as Record<string, unknown>;
    expect("online_color" in bare).toBe(false);
    expect("catalogProduct" in bare).toBe(false);
  });

  test("changing the UPC leaves the other identifier alone", () => {
    const loaded = load(record({ barcode: "6971234567890", sku: "SKU-1" }));
    expect(loaded.spools[0]!.upc).toBe("6971234567890");
    const digits = exported(loaded, [{ field: "upc", from: "6971234567890", to: "1112223334445" }]);
    expect(digits.file).toMatchObject({
      barcode: "1112223334445",
      sku: "SKU-1",
    });
    const text = exported(loaded, [{ field: "upc", from: "6971234567890", to: "NEW-SKU" }]);
    expect(text.file).toMatchObject({ sku: "NEW-SKU" });
    expect("barcode" in text.file).toBe(false);
    expect(loadTtag(text.output.json).spools[0]!.upc).toBe("NEW-SKU");
    const cleared = exported(loaded, [{ field: "upc", from: "6971234567890", to: null }]);
    expect(cleared.file).toMatchObject({ sku: "SKU-1" });
    expect("barcode" in cleared.file).toBe(false);
    const skuOnly = exported(load(record({ sku: "SKU-1" })), [
      { field: "upc", from: "SKU-1", to: null },
    ]);
    expect("sku" in skuOnly.file).toBe(false);
  });

  test("zero chip temperatures fall back to the catalogue product", () => {
    const spool = load(record({ data2: 0, data3: 0, data6: 0, data7: 0, catalogProduct }))
      .spools[0]!;
    expect(spool).toMatchObject({
      nozzleTempMin: 190,
      nozzleTempMax: 240,
      bedTempMin: 25,
      bedTempMax: 60,
    });
    // Chip values win when set, and there is no fallback without a catalogue product.
    expect(load(record({ catalogProduct })).spools[0]).toMatchObject({
      nozzleTempMin: 190,
      nozzleTempMax: 230,
      bedTempMin: 50,
      bedTempMax: 60,
    });
    expect(load(record({ data2: 0, data6: 0 })).spools[0]).toMatchObject({
      nozzleTempMin: null,
      bedTempMin: null,
    });
  });
});
