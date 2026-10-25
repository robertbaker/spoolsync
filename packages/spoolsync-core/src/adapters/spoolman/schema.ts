import { z } from "../../zod";

/**
 * Spoolman REST v1 shapes. Loose objects, so fields Spoolman-NG adds (or a future upstream adds)
 * survive parsing and stay available on `raw`.
 *
 * @see https://donkie.github.io/Spoolman/
 */

/** Spoolman stores every `extra` value as a JSON-encoded string. */
const ExtraSchema = z.record(z.string(), z.string());

export const VendorSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  comment: z.string().nullish(),
  empty_spool_weight: z.number().nullish(),
  external_id: z.string().nullish(),
  extra: ExtraSchema.optional(),
});
export type SpoolmanVendor = z.infer<typeof VendorSchema>;

export const FilamentSchema = z.looseObject({
  id: z.number(),
  name: z.string().nullish(),
  vendor: VendorSchema.nullish(),
  material: z.string().nullish(),
  price: z.number().nullish(),
  density: z.number().nullish(),
  diameter: z.number().nullish(),
  weight: z.number().nullish(),
  spool_weight: z.number().nullish(),
  article_number: z.string().nullish(),
  comment: z.string().nullish(),
  settings_extruder_temp: z.number().nullish(),
  settings_bed_temp: z.number().nullish(),
  color_hex: z.string().nullish(),
  multi_color_hexes: z.string().nullish(),
  multi_color_direction: z.string().nullish(),
  external_id: z.string().nullish(),
  extra: ExtraSchema.optional(),
});
export type SpoolmanFilament = z.infer<typeof FilamentSchema>;

export const SpoolSchema = z.looseObject({
  id: z.number(),
  registered: z.string().optional(),
  first_used: z.string().nullish(),
  last_used: z.string().nullish(),
  filament: FilamentSchema,
  price: z.number().nullish(),
  remaining_weight: z.number().nullish(),
  initial_weight: z.number().nullish(),
  spool_weight: z.number().nullish(),
  used_weight: z.number().optional(),
  location: z.string().nullish(),
  lot_nr: z.string().nullish(),
  comment: z.string().nullish(),
  archived: z.boolean().optional(),
  extra: ExtraSchema.optional(),
});
export type SpoolmanSpool = z.infer<typeof SpoolSchema>;

export const InfoSchema = z.looseObject({
  version: z.string(),
  debug_mode: z.boolean().optional(),
  db_type: z.string().optional(),
});
export type SpoolmanInfo = z.infer<typeof InfoSchema>;

export const HealthSchema = z.looseObject({ status: z.string() });

export const ExtraFieldSchema = z.looseObject({ key: z.string(), name: z.string().optional() });

export type SpoolmanEntity = "vendor" | "filament" | "spool";

export type VendorParameters = {
  name: string;
  comment?: string | null;
  empty_spool_weight?: number | null;
  external_id?: string | null;
  extra?: Record<string, string> | null;
};

export type FilamentParameters = {
  name?: string | null;
  vendor_id?: number | null;
  material?: string | null;
  price?: number | null;
  density: number;
  diameter: number;
  weight?: number | null;
  spool_weight?: number | null;
  article_number?: string | null;
  comment?: string | null;
  settings_extruder_temp?: number | null;
  settings_bed_temp?: number | null;
  color_hex?: string | null;
  multi_color_hexes?: string | null;
  multi_color_direction?: "coaxial" | "longitudinal" | null;
  external_id?: string | null;
  extra?: Record<string, string> | null;
};

export type SpoolParameters = {
  filament_id: number;
  price?: number | null;
  initial_weight?: number | null;
  spool_weight?: number | null;
  remaining_weight?: number | null;
  location?: string | null;
  lot_nr?: string | null;
  comment?: string | null;
  archived?: boolean;
  extra?: Record<string, string> | null;
};

/** Spoolman rejects comments longer than 1024 characters. */
export const SPOOLMAN_MAX_COMMENT = 1024;

export function truncateComment(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (value.length <= SPOOLMAN_MAX_COMMENT) return value;
  const characters = Array.from(value);
  return characters.length > SPOOLMAN_MAX_COMMENT
    ? `${characters.slice(0, SPOOLMAN_MAX_COMMENT - 1).join("")}…`
    : value;
}

/** Encodes non-blank values as Spoolman text extras; blanks are omitted rather than sent as null. */
export function encodeExtras(
  values: Record<string, string | number | null | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    const text = typeof value === "string" ? value.trim() : value;
    if (text !== null && text !== undefined && text !== "") out[key] = JSON.stringify(String(text));
  }
  return out;
}

export function readExtra(
  extra: Record<string, string> | undefined,
  key: string,
): string | undefined {
  const raw = extra && Object.hasOwn(extra, key) ? extra[key] : undefined;
  if (typeof raw !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "string") return parsed.trim() || undefined;
    if (typeof parsed === "number" && Number.isSafeInteger(parsed)) return String(parsed);
    return undefined;
  } catch {
    return raw.trim() || undefined;
  }
}
