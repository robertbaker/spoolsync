/**
 * OpenPrintTag database (https://github.com/OpenPrintTag/openprinttag-database) is a git repository
 * of YAML files with no bulk export: `data/brands`, `data/materials/<brand>`, and
 * `data/material-packages/<brand>`. A package is a purchasable product (weight, GTIN, diameter)
 * that points at a material (type, color, temperatures), which points at a brand. This module joins
 * the three tables, already parsed from YAML, into one flat record per package that the ordinary
 * mapping reads. `tools/openprinttag-to-reference.ts` builds the document from a local clone. A
 * material with no package still yields a record, without weight or barcode.
 */

export const OPENPRINTTAG_REPOSITORY = "https://github.com/OpenPrintTag/openprinttag-database";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const table = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const slugOf = (value: unknown): string | null => (isRecord(value) ? text(value["slug"]) : null);

/** YAML reads `1.75` as a number but a GTIN such as `8594173675292` too; keep digits as text. */
const barcode = (value: unknown): string | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : text(value);

/** The database states filament diameter in micrometers (`1750`). Values already in mm pass through. */
function diameterMm(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value >= 100 ? value / 1000 : value;
}

/** Flat OpenPrintTag record: the keys the built-in mapping reads. */
export interface OpenPrintTagRecord {
  id: string;
  brand: string | null;
  material: string | null;
  colorName: string | null;
  hex: string | null;
  diameter: number | null;
  density: unknown;
  nozzleMin: unknown;
  nozzleMax: unknown;
  bedMin: unknown;
  bedMax: unknown;
  weight: unknown;
  gtin: string | null;
  url: string | null;
  sourceUrl: string | null;
  imageUrl: string | null;
  dryingTemp: unknown;
  dryingHours: unknown;
}

export interface OpenPrintTagDocument {
  brands: unknown[];
  materials: unknown[];
  packages: unknown[];
}

/**
 * Joins the tables into one record per package, in file order, then one per material that no
 * package refers to. A package whose material cannot be found is skipped (a damaged clone, not a
 * choice). Only FFF (filament) records are read; resin and other classes are not filament.
 */
export function flattenOpenPrintTag(document: unknown): OpenPrintTagRecord[] {
  if (!isRecord(document)) return [];
  const brands = new Map<string, Record<string, unknown>>();
  for (const brand of table(document["brands"])) {
    const slug = text(brand["slug"]);
    if (slug) brands.set(slug, brand);
  }
  const materials = new Map<string, Record<string, unknown>>();
  for (const material of table(document["materials"])) {
    const slug = text(material["slug"]);
    if (slug && (material["class"] === undefined || material["class"] === "FFF"))
      materials.set(slug, material);
  }

  const build = (
    material: Record<string, unknown>,
    pkg: Record<string, unknown> | null,
  ): OpenPrintTagRecord | null => {
    const slug = text(material["slug"]);
    if (!slug) return null;
    const brandSlug = slugOf(material["brand"]);
    const brand = brandSlug ? brands.get(brandSlug) : undefined;
    const properties = isRecord(material["properties"]) ? material["properties"] : {};
    const primary = isRecord(material["primary_color"]) ? material["primary_color"] : {};
    const photo = table(material["photos"]).find((entry) => text(entry["url"]));
    return {
      id: pkg ? (text(pkg["slug"]) ?? slug) : slug,
      brand: brand ? text(brand["name"]) : null,
      material: text(material["type"]) ?? text(material["abbreviation"]),
      colorName: text(material["name"]),
      hex: text(primary["color_rgba"]),
      diameter: pkg ? diameterMm(pkg["filament_diameter"]) : null,
      density: properties["density"],
      nozzleMin: properties["min_print_temperature"],
      nozzleMax: properties["max_print_temperature"],
      bedMin: properties["min_bed_temperature"],
      bedMax: properties["max_bed_temperature"],
      weight: pkg ? pkg["nominal_netto_full_weight"] : null,
      gtin: pkg ? barcode(pkg["gtin"]) : null,
      url: pkg ? text(pkg["url"]) : null,
      sourceUrl:
        brandSlug && pkg
          ? `${OPENPRINTTAG_REPOSITORY}/blob/main/data/material-packages/${encodeURIComponent(brandSlug)}/${encodeURIComponent(text(pkg["slug"]) ?? slug)}.yaml`
          : brandSlug
            ? `${OPENPRINTTAG_REPOSITORY}/blob/main/data/materials/${encodeURIComponent(brandSlug)}/${encodeURIComponent(slug)}.yaml`
            : null,
      imageUrl: photo ? text(photo["url"]) : null,
      dryingTemp: properties["drying_temperature"],
      dryingHours:
        typeof properties["drying_time"] === "number" ? properties["drying_time"] / 60 : null,
    };
  };

  const out: OpenPrintTagRecord[] = [];
  const packaged = new Set<string>();
  for (const pkg of table(document["packages"])) {
    const materialSlug = slugOf(pkg["material"]);
    const material = materialSlug ? materials.get(materialSlug) : undefined;
    if (!material || !materialSlug) continue;
    const record = build(material, pkg);
    if (!record) continue;
    packaged.add(materialSlug);
    out.push(record);
  }
  for (const [slug, material] of materials) {
    if (packaged.has(slug)) continue;
    const record = build(material, null);
    if (record) out.push(record);
  }
  return out;
}
