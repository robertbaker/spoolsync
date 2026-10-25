import Papa from "papaparse";

import { z } from "../../zod";
import { csvInput, strictHeaders, validateCsv } from "../shared/tabular";

/**
 * Spoolstock's CSV export: one row per spool, with filament, brand and material columns flattened
 * as `filament.brand.name` etc. Every value is a string; blanks are empty strings. Column list and
 * order match the app's export (ported from printstudio's importer).
 */
export const SPOOLSTOCK_HEADERS = [
  "short_id",
  "inventory_location",
  "price",
  "purchase_source",
  "size",
  "created_at",
  "updated_at",
  "remaining_weight",
  "remaining_percent",
  "empty_spool.notes",
  "empty_spool.size",
  "empty_spool.spool_material",
  "empty_spool.weight",
  "current_weight",
  "depleted",
  "filament.name",
  "filament.color_family",
  "filament.features",
  "filament.diameter",
  "filament.favorite",
  "filament.brand.name",
  "filament.brand.website",
  "filament.material.name",
  "filament.material.long_name",
  "filament.material.description",
  "filament.material.temp_range",
  "filament.material.bed_temp_range",
  "filament.material.density",
  "filament.material.low_temp",
  "filament.material.high_temp",
  "filament.material.low_bed_temp",
  "filament.material.high_bed_temp",
  "filament.created_at",
  "filament.updated_at",
  "filament.total_size",
  "filament.spool_count",
  "filament.active_spool_count",
  "filament.total_remaining_weight",
  "filament.total_remaining_percent",
  "filament.repurchase_url",
  "filament.color_hex_codes",
  "diameter",
  "notes",
  "filament.rating",
  "filament.notes",
  "purchased_on",
  "filament.upc",
  "filament.product_family",
] as const;
export type SpoolstockHeader = (typeof SPOOLSTOCK_HEADERS)[number];

export const SpoolstockRecordSchema = z.object({
  short_id: z.string().trim().min(1, "short_id is empty"),
  ...Object.fromEntries(
    SPOOLSTOCK_HEADERS.filter((header) => header !== "short_id").map((header) => [
      header,
      z.string().optional(),
    ]),
  ),
}) as unknown as z.ZodType<SpoolstockRecord>;

export type SpoolstockRecord = { short_id: string } & Partial<
  Record<Exclude<SpoolstockHeader, "short_id">, string>
>;

export interface ParsedSpoolstockCsv {
  records: SpoolstockRecord[];
  warnings: string[];
}

export function parseSpoolstockCsv(csvText: string): ParsedSpoolstockCsv {
  const input = csvInput(csvText);
  const parsed = Papa.parse<Record<string, string>>(input.text, {
    delimiter: input.delimiter,
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: strictHeaders((header) => header.trim()),
  });
  validateCsv(parsed);
  const warnings: string[] = [];
  const headers = parsed.meta.fields ?? [];
  if (!headers.includes("short_id")) {
    return {
      records: [],
      warnings: [
        "This does not look like a Spoolstock export: there is no short_id column. Export from the Spoolstock app's Inventory tab.",
      ],
    };
  }

  const records: SpoolstockRecord[] = [];
  parsed.data.forEach((row, index) => {
    const result = SpoolstockRecordSchema.safeParse(row);
    if (result.success) records.push(result.data);
    else
      warnings.push(
        `Row ${index + 2}: ${result.error.issues.map((issue) => issue.message).join(", ")}`,
      );
  });
  return { records, warnings };
}
