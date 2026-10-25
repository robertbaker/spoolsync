import type { LoadResult } from "../../core/model";

/**
 * Filadex's filament export (`GET /api/filaments?export=json`, or the CSV from the same menu). Each
 * record is one spool. Filadex stores `totalWeight` in kilograms and the remainder as a percentage,
 * so weights are converted to grams on the way in and back on the way out.
 */
export type FiladexRecord = Record<string, unknown>;
export type FiladexLoadResult = LoadResult & { source: "filadex"; file: FiladexRecord[] };

export const CSV_COLUMNS = [
  "name",
  "manufacturer",
  "material",
  "colorName",
  "colorCode",
  "diameter",
  "printTemp",
  "totalWeight",
  "remainingPercentage",
  "purchaseDate",
  "purchasePrice",
  "status",
  "spoolType",
  "dryerCount",
  "lastDryingDate",
  "storageLocation",
  "barcode",
] as const;
