import type { LoadResult } from "../../core/model";
import { z } from "../../zod";

/**
 * Tiger Studio Manager's `.ttag` backup: `{ format: "tigertag", kind: "ttag", version: 1, records
 * }`, each record a verbatim inventory document. Studio picks Restore (rewrite in place under the
 * same uids) when `exportedBy` matches the signed-in account, and Import (fresh copies) otherwise,
 * so a file SpoolSync writes keeps the `exportedBy` of the file it was loaded from.
 *
 * @see https://github.com/TigerTag-Project/TigerTag-Studio-Manager/blob/main/docs/TTAG-FIELDS.md
 */
export const TtagFileSchema = z.looseObject({
  format: z.literal("tigertag"),
  kind: z.literal("ttag"),
  version: z.number().int().min(1).max(1),
  exportedAt: z.string().optional(),
  exportedBy: z.string().nullish(),
  records: z.array(z.looseObject({ uid: z.string().min(1) })),
  rfidBackups: z.record(z.string(), z.unknown()).optional(),
});
export type TtagFile = z.infer<typeof TtagFileSchema>;
export type TtagRecord = TtagFile["records"][number] & Record<string, unknown>;

export interface TigertagLoadResult extends LoadResult {
  file: TtagFile;
}

/** A spool's raw data: one record, or two for a twin (one material, two chips). */
export interface TigertagRaw {
  records: TtagRecord[];
}

export const FILAMENT_TYPE = 142;
export const CHIP_EPOCH_OFFSET = 946_684_800;
export const UNSET_PRODUCT_ID = 0xffff_ffff;
