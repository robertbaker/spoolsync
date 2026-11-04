/**
 * Open Filament Database (https://openfilamentdatabase.org) publishes its data as static JSON. The
 * bulk file `https://api.openfilamentdatabase.org/json/all.json` holds flat tables joined by ids:
 * brands -> materials -> filaments -> variants (a color) -> sizes (a weight, diameter and barcode).
 * This module joins them into one flat record per size, which the ordinary mapping reads, so a
 * barcode, net weight and empty spool weight stay attached to the size they describe.
 */

export const OFD_BULK_URL = "https://api.openfilamentdatabase.org/json/all.json";

type Table = Array<Record<string, unknown>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const table = (value: unknown): Table => (Array.isArray(value) ? value.filter(isRecord) : []);

function index(rows: Table): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) if (typeof row["id"] === "string") map.set(row["id"], row);
  return map;
}

/** Flat OFD record: the keys the built-in OFD mapping reads. */
export interface OfdRecord {
  id: string;
  brand: string | null;
  filament: string | null;
  material: string | null;
  variant: string | null;
  hex: string | null;
  hexes: string[] | null;
  diameter: unknown;
  density: unknown;
  nozzleMin: unknown;
  nozzleMax: unknown;
  bedMin: unknown;
  bedMax: unknown;
  weight: unknown;
  emptySpool: unknown;
  gtin: unknown;
  sourceUrl: string | null;
  dryingTemp: unknown;
  dryingHours: unknown;
  buyLinks: Array<{ store: string; url: string; shipsTo: string[] }>;
  discontinued: boolean;
}

/**
 * Joins the bulk document into one record per size. A size whose variant, filament or brand cannot
 * be found is skipped (the data is validated upstream, so that means a damaged file, not a choice).
 * Refill sizes carry no spool, so they never claim an empty-spool weight. Order follows the file.
 */
export function flattenOpenFilamentDatabase(document: unknown): OfdRecord[] {
  if (!isRecord(document)) return [];
  const brands = index(table(document["brands"]));
  const filaments = index(table(document["filaments"]));
  const variants = index(table(document["variants"]));
  const materials = index(table(document["materials"]));
  const stores = index(table(document["stores"]));
  const linksBySize = new Map<string, Array<{ store: string; url: string; shipsTo: string[] }>>();
  for (const link of table(document["purchase_links"])) {
    const store = stores.get(String(link["store_id"]));
    const name =
      store && typeof store["name"] === "string" && store["name"].trim() ? store["name"] : null;
    if (!store || !name || typeof link["url"] !== "string" || typeof link["size_id"] !== "string")
      continue;
    const shipsTo = Array.isArray(store["ships_to"])
      ? store["ships_to"].filter((code): code is string => typeof code === "string")
      : [];
    linksBySize.set(link["size_id"], [
      ...(linksBySize.get(link["size_id"]) ?? []),
      { store: name, url: link["url"], shipsTo },
    ]);
  }
  const text = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value : null;
  const out: OfdRecord[] = [];
  for (const size of table(document["sizes"])) {
    const variant = variants.get(String(size["variant_id"]));
    const filament = variant ? filaments.get(String(variant["filament_id"])) : undefined;
    const brand = filament ? brands.get(String(filament["brand_id"])) : undefined;
    if (!variant || !filament || !brand || typeof size["id"] !== "string") continue;
    const material = materials.get(String(filament["material_id"]));
    const slugs = [brand["slug"], material?.["slug"], filament["slug"]];
    const sourceUrl = slugs.every((slug) => typeof slug === "string" && slug)
      ? `https://openfilamentdatabase.org/brands/${slugs.map((slug) => encodeURIComponent(slug as string)).join("/")}`
      : null;
    const hexes = Array.isArray(variant["color_hexes"])
      ? variant["color_hexes"].filter((hex): hex is string => typeof hex === "string")
      : [];
    out.push({
      id: size["id"],
      brand: text(brand["name"]),
      filament: text(filament["name"]),
      material: text(filament["material"]),
      variant: text(variant["name"]),
      hex: text(variant["color_hex"]),
      hexes: hexes.length > 1 ? hexes : null,
      diameter: size["diameter"],
      density: filament["density"],
      nozzleMin: filament["min_print_temperature"],
      nozzleMax: filament["max_print_temperature"],
      bedMin: filament["min_bed_temperature"],
      bedMax: filament["max_bed_temperature"],
      weight: size["filament_weight"],
      emptySpool: size["spool_refill"] === true ? null : size["empty_spool_weight"],
      gtin: size["gtin"],
      sourceUrl,
      dryingTemp: filament["dry_temperature"],
      dryingHours: filament["dry_time"],
      buyLinks: linksBySize.get(size["id"]) ?? [],
      discontinued: size["discontinued"] === true || variant["discontinued"] === true,
    });
  }
  return out;
}
