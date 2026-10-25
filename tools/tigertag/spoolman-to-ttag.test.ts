import { describe, expect, test } from "bun:test";

import { createTtag, parseSpoolPayload } from "./spoolman-to-ttag";

const options = { includeArchived: false } as Parameters<typeof createTtag>[1];

const nested = {
  id: 240,
  initial_weight: 1000,
  used_weight: 200,
  spool_weight: 170,
  filament: {
    id: 66,
    name: "Green",
    material: "PLA+",
    vendor: { name: "Sunlu" },
    color_hex: "42DE87",
    diameter: 1.75,
    article_number: "00740511Z",
    settings_extruder_temp: 180,
    settings_bed_temp: 0,
  },
};

// Spoolman's file export flattens the same spool into dotted keys.
const flat = {
  id: 240,
  initial_weight: 1000,
  used_weight: 200,
  spool_weight: 170,
  "filament.id": 66,
  "filament.name": "Green",
  "filament.material": "PLA+",
  "filament.vendor.name": "Sunlu",
  "filament.color_hex": "42DE87",
  "filament.diameter": 1.75,
  "filament.article_number": "00740511Z",
  "filament.settings_extruder_temp": 180,
  "filament.settings_bed_temp": 0,
};

async function convert(spool: unknown) {
  const spools = parseSpoolPayload(JSON.stringify([spool]), "test");
  const { file, warnings } = await createTtag(spools, options);
  return { record: file.records[0]!, warnings };
}

describe("spoolman-to-ttag", () => {
  test("maps a Spoolman spool to a TigerTag record", async () => {
    const { record, warnings } = await convert(nested);
    expect(record).toMatchObject({
      id_brand: 51857,
      id_material: 46591,
      data1: 56,
      data2: 180,
      data3: 180,
      data6: 0,
      data7: 0,
      measure_gr: 1000,
      weight_available: 800,
      container_weight: 170,
      sku: "00740511Z",
      online_color_list: ["42DE87"],
      spoolmanId: 240,
    });
    expect(warnings).toEqual([]);
  });

  test("accepts Spoolman's flattened file export", async () => {
    const [flatResult, nestedResult] = await Promise.all([convert(flat), convert(nested)]);
    const strip = (record: Record<string, unknown>) => ({
      ...record,
      uid: undefined,
      timestamp: undefined,
    });
    expect(strip(flatResult.record)).toEqual(strip(nestedResult.record));
  });

  test("prefers remaining_weight and omits unknown empty spool weights", async () => {
    const { record } = await convert({
      ...nested,
      remaining_weight: 650,
      spool_weight: null,
    });
    expect(record.weight_available).toBe(650);
    expect(record).not.toHaveProperty("container_weight");
  });

  test("keeps up to three colors and warns about the rest", async () => {
    const { record, warnings } = await convert({
      ...nested,
      filament: {
        ...nested.filament,
        color_hex: null,
        multi_color_hexes: "ff0000,00ff00,0000ff,ffffff",
      },
    });
    expect(record.online_color_list).toEqual(["FF0000", "00FF00", "0000FF"]);
    expect([record.color_r, record.color_g2, record.color_b3]).toEqual([255, 255, 255]);
    expect(record).not.toHaveProperty("online_color_type");
    expect(warnings).toEqual(["Spool 240: 4 colors; only the first 3 are kept"]);
  });

  test("warns when the diameter is not a chip size", async () => {
    const { record, warnings } = await convert({
      ...nested,
      filament: { ...nested.filament, diameter: 3 },
    });
    expect(record.data1).toBe(221);
    expect(warnings).toEqual(["Spool 240: diameter 3 mm recorded as 2.85 mm"]);
  });

  test("puts numeric article numbers in barcode", async () => {
    const { record } = await convert({
      ...nested,
      filament: { ...nested.filament, article_number: "6938936716877" },
    });
    expect(record.barcode).toBe("6938936716877");
    expect(record).not.toHaveProperty("sku");
  });
});
