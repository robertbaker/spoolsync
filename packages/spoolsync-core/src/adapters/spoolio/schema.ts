import type { LoadResult } from "../../core/model";
import { z } from "../../zod";

/**
 * Spoolio.net's JSON export (Settings → Export). Each entry in `filaments` is one spool. The app
 * has no public API, so SpoolSync reads this file and writes the same format back, with every other
 * part of the export (print logs, settings) carried over untouched.
 */
export const SpoolioFilamentSchema = z.looseObject({
  id: z.string().min(1),
  type: z.string().nullish(),
  brand: z.string().nullish(),
  price: z.number().nullish(),
  finish: z.string().nullish(),
  abrasive: z.boolean().nullish(),
  colorHex: z.string().nullish(),
  colorMode: z.string().nullish(),
  colorName: z.string().nullish(),
  extraColors: z.array(z.string()).nullish(),
  diameter: z.number().nullish(),
  nozzleTempMin: z.number().nullish(),
  nozzleTempMax: z.number().nullish(),
  bedTempMin: z.number().nullish(),
  bedTempMax: z.number().nullish(),
  spoolmanId: z.number().nullish(),
  batchNumber: z.string().nullish(),
  spoolWeight: z.number().nullish(),
  weightTotal: z.number().nullish(),
  weightRemaining: z.number().nullish(),
  purchaseDate: z.string().nullish(),
  notes: z.string().nullish(),
});
export type SpoolioFilament = z.infer<typeof SpoolioFilamentSchema>;

export const SpoolioExportSchema = z.looseObject({
  version: z.number(),
  exportedAt: z.string().optional(),
  filaments: z.array(z.unknown()),
});
export type SpoolioExport = z.infer<typeof SpoolioExportSchema>;

export interface SpoolioLoadResult extends LoadResult {
  /** The parsed file, kept so the export can write everything else back unchanged. */
  file: SpoolioExport;
}
