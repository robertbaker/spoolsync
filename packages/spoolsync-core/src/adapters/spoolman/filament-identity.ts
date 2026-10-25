import { defaultDensity } from "./filament-policy";
import type { SpoolmanFilament } from "./schema";

export const norm = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

/** The filament attributes that make two filaments interchangeable. */
export interface FilamentIdentity {
  vendorId: number | null;
  material: string | null;
  name: string | null;
  colors: string[];
  colorDirection: "coaxial" | "longitudinal" | null;
  diameter: number;
  density: number;
  upc: string | null;
  nozzleTemp: number | null;
  bedTemp: number | null;
}

export function identityKey(identity: FilamentIdentity): string {
  return JSON.stringify([
    identity.vendorId,
    norm(identity.material),
    norm(identity.name),
    identity.colors,
    identity.colorDirection,
    identity.diameter,
    identity.density,
    norm(identity.upc),
    identity.nozzleTemp,
    identity.bedTemp,
  ]);
}

export function filamentIdentity(filament: SpoolmanFilament): FilamentIdentity {
  const multi = (filament.multi_color_hexes ?? "")
    .split(",")
    .map((hex) => hex.trim().replace(/^#/, "").slice(0, 6).toUpperCase())
    .filter(Boolean);
  const single = filament.color_hex
    ? [filament.color_hex.replace(/^#/, "").slice(0, 6).toUpperCase()]
    : [];
  return {
    vendorId: filament.vendor?.id ?? null,
    material: filament.material ?? null,
    name: filament.name ?? null,
    colors: multi.length ? multi : single,
    colorDirection:
      multi.length > 1
        ? filament.multi_color_direction === "longitudinal"
          ? "longitudinal"
          : "coaxial"
        : null,
    diameter: filament.diameter ?? 1.75,
    density: filament.density ?? defaultDensity(filament.material ?? null),
    upc: filament.article_number ?? null,
    nozzleTemp: filament.settings_extruder_temp ?? null,
    bedTemp: filament.settings_bed_temp ?? null,
  };
}

export function metadataKey(filament: SpoolmanFilament): string {
  return JSON.stringify([
    filament.comment ?? null,
    filament.external_id ?? null,
    filament.settings_extruder_temp ?? null,
    filament.settings_bed_temp ?? null,
    Object.entries(filament.extra ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}
