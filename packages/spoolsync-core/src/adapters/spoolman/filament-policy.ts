import type { ComparableField } from "../../core/model";
import type { FilamentParameters } from "./schema";

/** Fields stored on the Spoolman filament (shared by its spools) rather than on the spool. */
export const FILAMENT_FIELDS = new Set<ComparableField>([
  "vendor",
  "material",
  "name",
  "colors",
  "diameter",
  "density",
  "upc",
]);

/** Densities (g/cm³) for new filaments when no source states one; Spoolman requires a value. */
const DEFAULT_DENSITY: Record<string, number> = {
  pla: 1.24,
  petg: 1.27,
  pet: 1.27,
  abs: 1.04,
  asa: 1.07,
  tpu: 1.21,
  pa: 1.14,
  nylon: 1.14,
  pc: 1.2,
  pva: 1.23,
  hips: 1.04,
};

export function defaultDensity(material: string | null): number {
  const base = (material ?? "").toLowerCase().split(/[^a-z]/)[0] ?? "";
  return DEFAULT_DENSITY[base] ?? 1.24;
}

export function middle(min: number | null, max: number | null): number | null {
  if (min !== null && max !== null) return Math.round((min + max) / 2);
  return min ?? max;
}

export function colorParams(
  colors: string[],
  direction: "coaxial" | "longitudinal" = "coaxial",
): Pick<FilamentParameters, "color_hex" | "multi_color_hexes" | "multi_color_direction"> {
  if (colors.length > 1)
    return {
      color_hex: null,
      multi_color_hexes: colors.join(","),
      multi_color_direction: direction,
    };
  return { color_hex: colors[0] ?? null, multi_color_hexes: null, multi_color_direction: null };
}
