import type { CommonSpool } from "./model";

/**
 * How readily a material takes up water from the air, which is what decides whether it needs
 * drying.
 */
export type Moisture = "high" | "medium" | "low";

export interface DryingSettings {
  /** Oven or dryer temperature in Celsius. */
  tempC: number;
  /** How long to dry, in hours. */
  hours: number;
  moisture: Moisture;
}

export interface DryingAdvice extends DryingSettings {
  /**
   * Where the temperature and time come from: a reference catalog, or the usual figure for the
   * material.
   */
  origin: "catalog" | "typical";
}

/**
 * The usual drying settings for common materials. They are typical figures, not a manufacturer's
 * word: a catalog record for the exact filament, when there is one, takes their place.
 */
const TYPICAL: ReadonlyArray<{ test: RegExp; label: string; settings: DryingSettings }> = [
  { test: /^BVOH/, label: "BVOH", settings: { tempC: 45, hours: 6, moisture: "high" } },
  { test: /^PVA/, label: "PVA", settings: { tempC: 45, hours: 6, moisture: "high" } },
  { test: /^PCTG/, label: "PCTG", settings: { tempC: 65, hours: 6, moisture: "medium" } },
  { test: /^PET/, label: "PETG", settings: { tempC: 65, hours: 6, moisture: "medium" } },
  {
    test: /^(PA|NYLON|PPA)/,
    label: "Nylon (PA)",
    settings: { tempC: 80, hours: 12, moisture: "high" },
  },
  { test: /^PC/, label: "PC", settings: { tempC: 80, hours: 8, moisture: "medium" } },
  { test: /^(TPU|TPE|TPA)/, label: "TPU", settings: { tempC: 55, hours: 6, moisture: "medium" } },
  { test: /^ASA/, label: "ASA", settings: { tempC: 80, hours: 4, moisture: "low" } },
  { test: /^ABS/, label: "ABS", settings: { tempC: 80, hours: 4, moisture: "low" } },
  { test: /^HIPS/, label: "HIPS", settings: { tempC: 65, hours: 4, moisture: "low" } },
  { test: /^PP/, label: "PP", settings: { tempC: 55, hours: 6, moisture: "low" } },
  { test: /^PLA/, label: "PLA", settings: { tempC: 45, hours: 4, moisture: "low" } },
];

const compact = (material: string) => material.toUpperCase().replace(/[^A-Z0-9]/g, "");

function typicalEntry(material: string | null | undefined) {
  if (!material) return null;
  const name = compact(material);
  return name ? (TYPICAL.find((entry) => entry.test.test(name)) ?? null) : null;
}

/** The usual drying settings for a material name (`PA12-CF`, `PET-G`, `Nylon`), or `null`. */
export function typicalDrying(material: string | null | undefined): DryingSettings | null {
  return typicalEntry(material)?.settings ?? null;
}

/**
 * A short name for the group a material falls in (`PA12-CF` is `Nylon (PA)`), or the name as
 * written.
 */
export function dryingGroupName(material: string | null | undefined): string {
  return typicalEntry(material)?.label ?? (material?.trim() || "Unknown material");
}

/** What a catalog says about drying one filament. Either value may be missing. */
export interface CatalogDrying {
  dryingTemp?: number | null | undefined;
  dryingHours?: number | null | undefined;
}

/**
 * Drying advice for a material. Catalog figures win where present; a figure the catalog lacks falls
 * back to the usual one for the material. A material with neither a typical entry nor catalog
 * figures has no advice.
 */
export function dryingFor(
  material: string | null | undefined,
  catalog?: CatalogDrying | null,
): DryingAdvice | null {
  const typical = typicalDrying(material);
  const tempC = catalog?.dryingTemp ?? null;
  const hours = catalog?.dryingHours ?? null;
  if (tempC === null && hours === null) return typical ? { ...typical, origin: "typical" } : null;
  const resolvedTemp = tempC ?? typical?.tempC ?? null;
  const resolvedHours = hours ?? typical?.hours ?? null;
  if (resolvedTemp === null || resolvedHours === null) return null;
  return {
    tempC: resolvedTemp,
    hours: resolvedHours,
    // A catalog that gives drying settings says the filament benefits from drying.
    moisture: typical?.moisture ?? "medium",
    origin: "catalog",
  };
}

export interface DryingEntry {
  spool: CommonSpool;
  advice: DryingAdvice;
}

export interface DryingOptions {
  /** Also list materials that rarely need drying, such as PLA. */
  includeLow?: boolean;
  /** Catalog figures for a spool, when it is tied to a catalog record. */
  catalogFor?: (spool: CommonSpool) => CatalogDrying | null | undefined;
}

const RANK: Record<Moisture, number> = { high: 0, medium: 1, low: 2 };
/** Same ordering as `localeCompare` with defaults, without per-call setup. */
const DRYING_COLLATOR = new Intl.Collator();

/**
 * The spools worth drying before a print: archived and empty ones are left out, as are materials
 * that rarely need it unless asked for. Most moisture-prone first, then by material and name.
 */
export function spoolsToDry(
  spools: readonly CommonSpool[],
  options: DryingOptions = {},
): DryingEntry[] {
  const entries: DryingEntry[] = [];
  for (const spool of spools) {
    if (spool.archived) continue;
    if (spool.remainingWeight !== null && spool.remainingWeight <= 0) continue;
    const advice = dryingFor(spool.material, options.catalogFor?.(spool));
    if (!advice) continue;
    if (advice.moisture === "low" && !options.includeLow) continue;
    entries.push({ spool, advice });
  }
  // Sort keys are computed once per entry, not once per comparison.
  return entries
    .map((entry) => ({
      entry,
      rank: RANK[entry.advice.moisture],
      group: dryingGroupName(entry.spool.material),
      name: [entry.spool.vendor, entry.spool.name].filter(Boolean).join(" "),
    }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        DRYING_COLLATOR.compare(a.group, b.group) ||
        DRYING_COLLATOR.compare(a.name, b.name),
    )
    .map(({ entry }) => entry);
}

export interface DryingGroup {
  /** `Nylon (PA)` and the settings, so spools with the same advice share a group. */
  key: string;
  material: string;
  advice: DryingAdvice;
  entries: DryingEntry[];
}

/** Entries grouped by material and settings, so a dryer run can take several spools at once. */
export function groupDrying(entries: readonly DryingEntry[]): DryingGroup[] {
  const groups = new Map<string, DryingGroup>();
  for (const entry of entries) {
    const material = dryingGroupName(entry.spool.material);
    const key = `${material}|${entry.advice.tempC}|${entry.advice.hours}`;
    const group = groups.get(key);
    if (group) group.entries.push(entry);
    else groups.set(key, { key, material, advice: entry.advice, entries: [entry] });
  }
  return [...groups.values()];
}
