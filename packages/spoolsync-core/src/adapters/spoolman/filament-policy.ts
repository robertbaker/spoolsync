import type { ComparableField } from "../../core/model";
import type { FilamentParameters, SpoolmanFilament } from "./schema";

/** Fields stored on the Spoolman filament (shared by its spools) rather than on the spool. */
export const FILAMENT_FIELDS = new Set<ComparableField>([
  "vendor",
  "material",
  "name",
  "colors",
  "diameter",
  "density",
  "upc",
  "nozzleTempMin",
  "nozzleTempMax",
  "bedTempMin",
  "bedTempMax",
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
  const only = min ?? max;
  return only === null ? null : Math.round(only);
}

export function colorParams(
  colors: string[],
  direction: "coaxial" | "longitudinal" = "coaxial",
  existing: string[] = [],
): Pick<FilamentParameters, "color_hex" | "multi_color_hexes" | "multi_color_direction"> {
  colors = colors.map((color) => keepAlpha(color, existing));
  if (colors.length > 1)
    return {
      color_hex: null,
      multi_color_hexes: colors.join(","),
      multi_color_direction: direction,
    };
  return {
    color_hex: colors[0] ?? null,
    multi_color_hexes: null,
    multi_color_direction: null,
  };
}

export interface FilamentTemps {
  nozzleTempMin: number | null;
  nozzleTempMax: number | null;
  bedTempMin: number | null;
  bedTempMax: number | null;
}

type TempFilament = Pick<
  SpoolmanFilament,
  | "settings_extruder_temp"
  | "settings_bed_temp"
  | "settings_extruder_temp_min"
  | "settings_extruder_temp_max"
  | "settings_bed_temp_min"
  | "settings_bed_temp_max"
>;

/** Spoolman stores 0 for "not set"; no real printing temperature is zero. */
const temperature = (value: number | null | undefined): number | null =>
  typeof value === "number" && value > 0 ? value : null;

/** Spoolman stores whole degrees only, so a fractional source temperature is rounded. */
export const integerTemperature = (value: number | null | undefined): number | null => {
  const positive = temperature(value);
  return positive === null ? null : Math.max(1, Math.round(positive));
};

/**
 * The temperatures a filament states. Spoolman-NG ranges win; the single overridden temperature
 * (all upstream Spoolman has) fills in when a range end is missing.
 */
export function filamentTemps(source: object): FilamentTemps {
  const filament = source as TempFilament;
  const nozzle = temperature(filament.settings_extruder_temp);
  const bed = temperature(filament.settings_bed_temp);
  return {
    nozzleTempMin: temperature(filament.settings_extruder_temp_min) ?? nozzle,
    nozzleTempMax: temperature(filament.settings_extruder_temp_max) ?? nozzle,
    bedTempMin: temperature(filament.settings_bed_temp_min) ?? bed,
    bedTempMax: temperature(filament.settings_bed_temp_max) ?? bed,
  };
}

/**
 * Spoolman-NG omits unset (null) fields from its responses, so the range keys only appear on a
 * filament that has a range. Their presence identifies NG; their absence proves nothing, which is
 * why API writes also ask `/info` (see `isSpoolmanNg`).
 */
export function hasTempRanges(filament: object): boolean {
  return [
    "settings_extruder_temp_min",
    "settings_extruder_temp_max",
    "settings_bed_temp_min",
    "settings_bed_temp_max",
  ].some((key) => Object.hasOwn(filament, key));
}

/**
 * Filament fields for these temperatures: always the single temperature (midpoint of a range), plus
 * the range itself when the server is Spoolman-NG.
 */
export function temperatureParams(
  temps: FilamentTemps,
  ranges: boolean,
  warn?: (text: string) => void,
): Pick<
  FilamentParameters,
  | "settings_extruder_temp"
  | "settings_bed_temp"
  | "settings_extruder_temp_min"
  | "settings_extruder_temp_max"
  | "settings_bed_temp_min"
  | "settings_bed_temp_max"
> {
  temps = {
    nozzleTempMin: integerTemperature(temps.nozzleTempMin),
    nozzleTempMax: integerTemperature(temps.nozzleTempMax),
    bedTempMin: integerTemperature(temps.bedTempMin),
    bedTempMax: integerTemperature(temps.bedTempMax),
  };
  const single = {
    settings_extruder_temp: middle(temps.nozzleTempMin, temps.nozzleTempMax),
    settings_bed_temp: middle(temps.bedTempMin, temps.bedTempMax),
  };
  if (!ranges) {
    if (temps.nozzleTempMin !== temps.nozzleTempMax || temps.bedTempMin !== temps.bedTempMax)
      warn?.(
        "temperature range written as a single temperature (its midpoint): only Spoolman-NG stores ranges",
      );
    return single;
  }
  return {
    ...single,
    settings_extruder_temp_min: temps.nozzleTempMin,
    settings_extruder_temp_max: temps.nozzleTempMax,
    settings_bed_temp_min: temps.bedTempMin,
    settings_bed_temp_max: temps.bedTempMax,
  };
}

/** Only Spoolman-NG keeps a per-spool diameter; where it is set it is the effective diameter. */
export function hasDiameterOverride(spool: object): boolean {
  const { diameter } = spool as { diameter?: unknown };
  return typeof diameter === "number" && diameter > 0;
}

const stripHash = (hex: string) => hex.trim().replace(/^#/, "");

/**
 * Keeps an 8-digit `RRGGBBAA` colour the filament already has when the new colour is the same RGB,
 * since the common model only carries `RRGGBB`.
 */
function keepAlpha(color: string, existing: string[]): string {
  const match = existing.find(
    (hex) =>
      /^[0-9a-f]{8}$/i.test(stripHash(hex)) &&
      stripHash(hex).slice(0, 6).toUpperCase() === color.toUpperCase(),
  );
  return match ? stripHash(match) : color;
}

export function existingHexes(
  filament: Pick<SpoolmanFilament, "color_hex" | "multi_color_hexes"> | undefined,
): string[] {
  if (!filament) return [];
  return [filament.color_hex ?? "", ...(filament.multi_color_hexes ?? "").split(",")].filter(
    (hex) => hex.trim() !== "",
  );
}
