import { z } from "../../zod";

/**
 * The Spool app's JSON backup (Mac and iOS). Spools are kept in `spools`; the backup also holds
 * prints, printers, business records, and settings that SpoolSync does not read. Fields are loose
 * so newer app versions keep loading.
 */
export const SpoolAppSpoolSchema = z.looseObject({
  id: z.string().min(1),
  brand: z.string().nullish(),
  materialType: z.string().nullish(),
  colourName: z.string().nullish(),
  colourHex: z.string().nullish(),
  isMulticolour: z.boolean().nullish(),
  multiHexes: z.array(z.string()).nullish(),
  multicolourDescription: z.string().nullish(),
  productLine: z.string().nullish(),
  nominalWeight: z.number().nullish(),
  currentWeight: z.number().nullish(),
  emptySpoolGrams: z.number().nullish(),
  diameterMm: z.number().nullish(),
  nozzleTemp: z.number().nullish(),
  bedTemp: z.number().nullish(),
  purchasePrice: z.number().nullish(),
  purchaseDate: z.string().nullish(),
  purchaseUrl: z.string().nullish(),
  notes: z.string().nullish(),
  isArchived: z.boolean().nullish(),
  isFinished: z.boolean().nullish(),
  lifecycleRaw: z.string().nullish(),
});
export type SpoolAppSpool = z.infer<typeof SpoolAppSpoolSchema>;

export const SpoolAppBackupSchema = z.looseObject({
  backupFormat: z.string().nullish(),
  version: z.string().nullish(),
  spools: z.array(z.unknown()),
});
