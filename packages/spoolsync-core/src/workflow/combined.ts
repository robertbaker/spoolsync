import { csvText } from "../adapters/shared/tabular";
import { allSpools, SOURCE_LABELS, type CommonSpool, type LoadResult } from "../core/model";

const COLUMNS = [
  "service",
  "id",
  "vendor",
  "material",
  "name",
  "colors",
  "diameter_mm",
  "density",
  "nozzle_temp_min",
  "nozzle_temp_max",
  "bed_temp_min",
  "bed_temp_max",
  "barcode",
  "initial_weight_g",
  "remaining_weight_g",
  "empty_spool_weight_g",
  "location",
  "price",
  "purchased_on",
  "lot_nr",
  "comment",
  "archived",
] as const;

/**
 * Text that starts with these characters is read as a formula by spreadsheet programs. Inventory
 * files are untrusted, so such cells are prefixed with an apostrophe to keep them as plain text.
 */
function safeText(value: string | null): string {
  if (!value) return "";
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function row(spool: CommonSpool): Record<(typeof COLUMNS)[number], string | number | boolean> {
  return {
    service: SOURCE_LABELS[spool.source],
    id: safeText(spool.sourceId),
    vendor: safeText(spool.vendor),
    material: safeText(spool.material),
    name: safeText(spool.name),
    colors: spool.colors.map((color) => `#${color}`).join(" "),
    diameter_mm: spool.diameter ?? "",
    density: spool.density ?? "",
    nozzle_temp_min: spool.nozzleTempMin ?? "",
    nozzle_temp_max: spool.nozzleTempMax ?? "",
    bed_temp_min: spool.bedTempMin ?? "",
    bed_temp_max: spool.bedTempMax ?? "",
    barcode: safeText(spool.upc),
    initial_weight_g: spool.initialWeight ?? "",
    remaining_weight_g: spool.remainingWeight ?? "",
    empty_spool_weight_g: spool.emptySpoolWeight ?? "",
    location: safeText(spool.location),
    price: spool.price ?? "",
    purchased_on: spool.purchasedOn ?? "",
    lot_nr: safeText(spool.lotNr),
    comment: safeText(spool.comment),
    archived: spool.archived,
  };
}

/** One CSV of every loaded spool, tagged with its service, for spreadsheets and backups. */
export function combinedInventoryCsv(results: readonly LoadResult[]): {
  csv: string;
  rows: number;
} {
  const spools = allSpools(results);
  return { csv: csvText(spools.map(row), COLUMNS), rows: spools.length };
}
