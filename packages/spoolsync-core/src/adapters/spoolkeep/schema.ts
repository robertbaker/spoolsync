import { z } from "../../zod";

/**
 * SpoolKeep's JSON backup: an array with one record per filament product. A record counts spools
 * (`newQuantity` unopened, `usedQuantity` opened) instead of tracking individual weights.
 */
export const SpoolKeepRecordSchema = z.looseObject({
  id: z.string().min(1),
  brand: z.string().nullish(),
  family: z.string().nullish(),
  exactType: z.string().nullish(),
  color: z.string().nullish(),
  reference: z.string().nullish(),
  note: z.string().nullish(),
  price: z.number().nullish(),
  diameter: z.number().nullish(),
  nozzleTempMin: z.number().nullish(),
  nozzleTempMax: z.number().nullish(),
  bedTempMin: z.number().nullish(),
  bedTempMax: z.number().nullish(),
  newQuantity: z.number().nullish(),
  usedQuantity: z.number().nullish(),
});
export type SpoolKeepRecord = z.infer<typeof SpoolKeepRecordSchema>;
