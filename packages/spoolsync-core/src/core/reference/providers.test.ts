import { describe, expect, test } from "bun:test";

import { ReferenceCatalog } from "./catalog";
import { fetchReferenceCatalog, type ReferenceIO, type ReferenceResponse } from "./fetch";
import { flattenOpenFilamentDatabase } from "./ofd";
import { providerById } from "./providers";
import { buildFetchConfig } from "./settings";

// Synthetic records in the shape the live services return (checked against both on 2026-11-04).
const ofdDocument = {
  brands: [{ id: "b1", name: "Hatchbox", slug: "hatchbox" }],
  materials: [{ id: "m1", material: "PLA", slug: "PLA", brand_id: "b1" }],
  filaments: [
    {
      id: "f1",
      name: "PLA Matte",
      material: "PLA",
      brand_id: "b1",
      material_id: "m1",
      density: 1.24,
      min_print_temperature: 190,
      max_print_temperature: 220,
      min_bed_temperature: 0,
      max_bed_temperature: 60,
      slug: "matte",
      dry_temperature: 50,
      dry_time: 6,
    },
  ],
  stores: [
    { id: "st1", name: "Filament Shop", ships_to: ["GB", "DE"] },
    { id: "st2", name: "", ships_to: ["US"] },
  ],
  purchase_links: [
    { store_id: "st1", size_id: "s1", url: "https://shop.example.org/hatchbox-terracotta" },
    { store_id: "st2", size_id: "s1", url: "https://other.example.org/x" },
    { store_id: "st1", size_id: "s3", url: "http://insecure.example.org/y" },
  ],
  variants: [
    { id: "v1", name: "Terracotta", color_hex: "#C0623A", filament_id: "f1" },
    {
      id: "v2",
      name: "Blue Orange",
      color_hex: "#F4AC23",
      color_hexes: ["#F4AC23", "#2E56F1"],
      filament_id: "f1",
    },
    { id: "orphan", name: "Lost", color_hex: "#000000", filament_id: "missing" },
  ],
  sizes: [
    {
      id: "s1",
      variant_id: "v1",
      filament_weight: 1000,
      diameter: 1.75,
      empty_spool_weight: 216,
      gtin: "191314034277",
    },
    {
      id: "s2",
      variant_id: "v1",
      filament_weight: 1000,
      diameter: 1.75,
      spool_refill: true,
      empty_spool_weight: 216,
    },
    { id: "s3", variant_id: "v2", filament_weight: 250, diameter: 2.85 },
    { id: "s4", variant_id: "orphan", filament_weight: 1000, diameter: 1.75 },
  ],
};

const fcPage = {
  count: 2,
  next: null,
  results: [
    {
      id: 4835,
      manufacturer: { id: 138, name: "American Filament" },
      color_name: "Blizzard White",
      filament_type: { id: 170, name: "PCTG", hot_end_temp: 270, bed_temp: 75 },
      hex_color: "E9EDED",
      card_img: "https://filamentcolors.xyz/media/thumb.jpg",
      mfr_purchase_link: "https://americanfilament.us/products/blizzard-white",
      amazon_purchase_link: null,
    },
    {
      id: 1,
      manufacturer: { name: "Acme" },
      color_name: "Red",
      filament_type: { name: "PLA" },
      hex_color: "FF0000",
    },
  ],
};

function io(body: unknown): ReferenceIO {
  const res: ReferenceResponse = {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
  };
  return { fetch: async () => res, sleep: async () => {}, now: () => 1 };
}

describe("Open Filament Database", () => {
  test("joins its tables into one record per size and skips orphans", () => {
    const rows = flattenOpenFilamentDatabase(ofdDocument);
    expect(rows.map((row) => row.id)).toEqual(["s1", "s2", "s3"]);
    expect(rows[0]).toMatchObject({
      brand: "Hatchbox",
      filament: "PLA Matte",
      variant: "Terracotta",
      gtin: "191314034277",
    });
    expect(rows[1]!.emptySpool).toBeNull();
    expect(flattenOpenFilamentDatabase(null)).toEqual([]);
  });

  test("fetches through the built-in settings and normalizes sizes", async () => {
    const provider = providerById("openfilamentdatabase")!;
    const built = buildFetchConfig("openfilamentdatabase", undefined);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const catalog = await fetchReferenceCatalog(provider, built.config, io(ofdDocument));
    expect(catalog.filaments).toHaveLength(3);
    const [first, , multi] = catalog.filaments;
    expect(first).toMatchObject({
      id: "s1",
      vendor: "Hatchbox",
      material: "PLA",
      colorName: "Terracotta",
      colorHex: "C0623A",
      diameter: 1.75,
      density: 1.24,
      nozzleTempMin: 190,
      nozzleTempMax: 220,
      bedTempMax: 60,
      initialWeight: 1000,
      emptySpoolWeight: 216,
      barcode: "191314034277",
      providerId: "openfilamentdatabase",
      sourceUrl: "https://openfilamentdatabase.org/brands/hatchbox/PLA/matte",
      dryingTemp: 50,
      dryingHours: 6,
    });
    expect(first!.buyLinks).toEqual([
      {
        store: "Filament Shop",
        url: "https://shop.example.org/hatchbox-terracotta",
        shipsTo: ["GB", "DE"],
      },
    ]);
    // An insecure link is dropped, and a size with no usable link has none.
    expect(multi!.buyLinks).toEqual([]);
    expect(multi).toMatchObject({
      colorHexes: ["F4AC23", "2E56F1"],
      initialWeight: 250,
      diameter: 2.85,
    });
  });
});

describe("FilamentColors", () => {
  test("reads swatches and fills only what the API states", async () => {
    const provider = providerById("filamentcolors")!;
    const built = buildFetchConfig("filamentcolors", undefined);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const catalog = await fetchReferenceCatalog(provider, built.config, io(fcPage));
    const [first] = catalog.filaments;
    expect(first).toMatchObject({
      id: "4835",
      vendor: "American Filament",
      material: "PCTG",
      colorName: "Blizzard White",
      colorHex: "E9EDED",
      url: "https://americanfilament.us/products/blizzard-white",
      sourceUrl: "https://filamentcolors.xyz/swatch/4835/",
      imageUrl: "https://filamentcolors.xyz/media/thumb.jpg",
      nozzleTempMax: null,
      bedTempMax: null,
      initialWeight: null,
    });
  });
});

describe("barcode lookup", () => {
  const record = (id: string, barcode: string | null) => ({
    id,
    providerId: "openfilamentdatabase",
    providerLabel: "Open Filament Database",
    vendor: "Hatchbox",
    name: null,
    material: "PLA",
    colorName: id,
    colorHex: null,
    colorHexes: [],
    diameter: null,
    density: null,
    nozzleTempMin: null,
    nozzleTempMax: null,
    bedTempMin: null,
    bedTempMax: null,
    initialWeight: null,
    emptySpoolWeight: null,
    price: null,
    barcode,
    url: null,
    attribution: "x",
    license: null,
  });

  test("matches on digits only, ignoring leading zeros, and never on short input", () => {
    const catalog = new ReferenceCatalog([
      record("a", "00191314034277"),
      record("b", "5060665813013"),
      record("c", null),
    ]);
    expect(catalog.lookupBarcode("191314034277").map((r) => r.id)).toEqual(["a"]);
    expect(catalog.lookupBarcode("0191314034277").map((r) => r.id)).toEqual(["a"]);
    expect(catalog.lookupBarcode("5060-6658 13013").map((r) => r.id)).toEqual(["b"]);
    expect(catalog.lookupBarcode("123")).toEqual([]);
    expect(catalog.lookupBarcode("")).toEqual([]);
    expect(catalog.lookupBarcode("999999999999")).toEqual([]);
  });
});
