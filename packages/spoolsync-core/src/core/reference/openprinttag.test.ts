import { describe, expect, test } from "bun:test";

import { OPENPRINTTAG_MAPPING } from "./mapping";
import { normalizeReferenceRecords } from "./normalize";
import { flattenOpenPrintTag } from "./openprinttag";

// Synthetic records in the shape of the database's YAML files (checked 2026-11-04).
const document = {
  brands: [{ slug: "acme", name: "Acme", countries_of_origin: ["CZ"] }],
  materials: [
    {
      slug: "acme-asa-black",
      brand: { slug: "acme" },
      name: "ASA Jet Black",
      class: "FFF",
      type: "ASA",
      primary_color: { color_rgba: "#292824ff" },
      photos: [{ url: "https://files.example.org/a.png", type: "unspecified" }],
      properties: {
        density: 1.07,
        min_print_temperature: 250,
        max_print_temperature: 270,
        min_bed_temperature: 100,
        max_bed_temperature: 120,
        drying_temperature: 80,
        drying_time: 240,
      },
    },
    {
      slug: "acme-pla-orange",
      brand: { slug: "acme" },
      name: "PLA Orange",
      class: "FFF",
      type: "PLA",
    },
    { slug: "acme-resin", brand: { slug: "acme" }, name: "Resin", class: "SLA", type: "Resin" },
  ],
  packages: [
    {
      slug: "acme-asa-black-1000",
      material: { slug: "acme-asa-black" },
      nominal_netto_full_weight: 1000,
      gtin: 8594173675292,
      filament_diameter: 1750,
      url: "https://shop.example.org/asa",
    },
    { slug: "orphan", material: { slug: "missing" }, nominal_netto_full_weight: 500 },
  ],
};

describe("flattenOpenPrintTag", () => {
  const records = flattenOpenPrintTag(document);

  test("joins a package with its material and brand and skips orphans and non-filament", () => {
    expect(records.map((record) => record.id)).toEqual(["acme-asa-black-1000", "acme-pla-orange"]);
    expect(records[0]).toMatchObject({
      brand: "Acme",
      material: "ASA",
      diameter: 1.75,
      weight: 1000,
      gtin: "8594173675292",
    });
  });

  test("keeps a material without a package, with no weight or barcode", () => {
    expect(records[1]).toMatchObject({ weight: null, gtin: null, diameter: null });
  });

  test("maps through the preset to reference filaments", () => {
    const { filaments } = normalizeReferenceRecords(records, OPENPRINTTAG_MAPPING, {
      providerId: "file",
      providerLabel: "Reference file",
      attribution: "OpenPrintTag database",
      license: "MIT",
    });
    expect(filaments[0]).toMatchObject({
      vendor: "Acme",
      material: "ASA",
      colorHex: "292824",
      nozzleTempMin: 250,
      initialWeight: 1000,
      barcode: "8594173675292",
      dryingHours: 4,
    });
  });

  test("returns nothing for a document that is not an object", () => {
    expect(flattenOpenPrintTag(null)).toEqual([]);
  });
});
