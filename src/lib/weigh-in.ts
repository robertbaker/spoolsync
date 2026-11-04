import { local, read, write } from "./browser/storage/access";
import { unitToGrams, type WeightUnit } from "./units";

/**
 * The weigh-in calculator behind the spool drawer: put the spool on a scale, subtract the empty
 * spool (the tare), and get the filament that is left. Everything here is pure apart from the two
 * storage helpers at the bottom, which go through the shared access layer so blocked storage is
 * tolerated.
 */

export const WEIGH_IN_KEY = "spoolsync:weigh-in";
/** Heavier than any real empty spool, so a typo cannot be stored as a tare. */
export const MAX_TARE_GRAMS = 2000;
/** Heavier than any real scale reading of one spool. */
export const MAX_SCALE_GRAMS = 20_000;
const MAX_BRAND_KEY = 60;
const MAX_STORED_TARES = 100;

export interface KnownTare {
  /** Name shown to the visitor. */
  brand: string;
  /** Normalized names (see {@link brandKey}) that identify the brand. */
  aliases: readonly string[];
  grams: number;
}

/**
 * Typical empty-spool weights for common brands, rounded. Makers change spools between lines, so
 * these are a starting point: weighing an empty spool and saving that value always wins.
 */
export const KNOWN_TARES: readonly KnownTare[] = [
  { brand: "Bambu Lab", aliases: ["bambulab", "bambu"], grams: 250 },
  { brand: "Prusament", aliases: ["prusament", "prusa", "prusaresearch"], grams: 200 },
  { brand: "Polymaker", aliases: ["polymaker", "polyterra", "polylite", "panchroma"], grams: 140 },
  { brand: "eSUN", aliases: ["esun"], grams: 240 },
  { brand: "Sunlu", aliases: ["sunlu"], grams: 160 },
  { brand: "Hatchbox", aliases: ["hatchbox"], grams: 245 },
  { brand: "Overture", aliases: ["overture"], grams: 140 },
  { brand: "Elegoo", aliases: ["elegoo"], grams: 150 },
  { brand: "Creality", aliases: ["creality"], grams: 160 },
  { brand: "Anycubic", aliases: ["anycubic"], grams: 130 },
];

/** Lower case letters and digits only, so "Bambu Lab", "bambu-lab" and "BambuLab" are one brand. */
export function brandKey(vendor: string | null | undefined): string {
  return (vendor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, MAX_BRAND_KEY);
}

/** The typical tare for a brand, or `null` when the brand is not in the table. */
export function knownTare(vendor: string | null | undefined): KnownTare | null {
  const key = brandKey(vendor);
  if (!key) return null;
  return (
    KNOWN_TARES.find((entry) => entry.aliases.includes(key)) ??
    // "Polymaker PolyTerra" typed as a brand still starts with a known name.
    KNOWN_TARES.find((entry) =>
      entry.aliases.some((alias) => alias.length >= 4 && key.startsWith(alias)),
    ) ??
    null
  );
}

const isTare = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_TARE_GRAMS;

/** Saved tares by brand key; anything out of range or oddly keyed is dropped. */
export function sanitizeTares(raw: unknown): Record<string, number> {
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? ((raw as { tares?: unknown }).tares ?? raw)
      : null;
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const tares: Record<string, number> = {};
  for (const [key, value] of Object.entries(source)) {
    if (Object.keys(tares).length >= MAX_STORED_TARES) break;
    if (!key || key.length > MAX_BRAND_KEY || key !== brandKey(key) || !isTare(value)) continue;
    tares[key] = Math.round(value * 10) / 10;
  }
  return tares;
}

/** The key under which a spool with no brand is remembered. */
export const NO_BRAND_KEY = "nobrand";

export type TareOrigin = "custom" | "spool" | "brand";

export interface ResolvedTare {
  grams: number;
  origin: TareOrigin;
  /** Plain words for where the number came from. */
  source: string;
}

/**
 * The empty-spool weight to start from: the visitor's saved value for the brand, then the weight
 * the inventory already records for this spool, then the typical value for a known brand.
 */
export function resolveTare(input: {
  vendor: string | null | undefined;
  recorded: number | null | undefined;
  saved: Readonly<Record<string, number>>;
}): ResolvedTare | null {
  const key = brandKey(input.vendor) || NO_BRAND_KEY;
  const custom = input.saved[key];
  if (isTare(custom))
    return { grams: custom, origin: "custom", source: "your saved value for this brand" };
  if (isTare(input.recorded))
    return {
      grams: input.recorded,
      origin: "spool",
      source: "the empty weight recorded for this spool",
    };
  const known = knownTare(input.vendor);
  if (known)
    return { grams: known.grams, origin: "brand", source: `a typical ${known.brand} spool` };
  return null;
}

/** Parses a weight typed in the display unit. Empty is `null`; junk is `"invalid"`. */
export function parseScaleInput(text: string, unit: WeightUnit): number | null | "invalid" {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(value) || value < 0) return "invalid";
  const grams = unitToGrams(value, unit);
  return grams <= MAX_SCALE_GRAMS ? Math.round(grams * 10) / 10 : "invalid";
}

export interface WeighInSuccess {
  ok: true;
  /** Filament left, in grams, to one decimal place. */
  remaining: number;
  /** Share of the full weight, or `null` when the full weight is unknown. */
  percent: number | null;
  /** Remaining minus what the inventory says now, or `null` when it does not say. */
  delta: number | null;
  /** True when the result is more than a few percent above the full weight, which is suspicious. */
  overFull: boolean;
}

export type WeighInResult = WeighInSuccess | { ok: false; error: string };

/** Subtracts the empty spool from the scale reading and compares the result with what is recorded. */
export function weighIn(input: {
  gross: number | null;
  tare: number | null;
  initial: number | null;
  current: number | null;
}): WeighInResult {
  const { gross, tare, initial, current } = input;
  if (gross === null)
    return { ok: false, error: "Enter what the scale shows with the spool on it." };
  if (tare === null) return { ok: false, error: "Enter the weight of the empty spool." };
  if (gross < tare)
    return {
      ok: false,
      error:
        "The scale reading is lower than the empty spool. Check the reading or the empty weight.",
    };
  const remaining = Math.round((gross - tare) * 10) / 10;
  const percent =
    initial !== null && initial > 0 ? Math.round((remaining / initial) * 1000) / 10 : null;
  return {
    ok: true,
    remaining,
    percent,
    delta: current === null ? null : Math.round((remaining - current) * 10) / 10,
    overFull: initial !== null && initial > 0 && remaining > initial * 1.05,
  };
}

// ---- Storage --------------------------------------------------------------------------------

export function readTares(): Record<string, number> {
  try {
    return sanitizeTares(JSON.parse(read(local, WEIGH_IN_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

/** Remembers an empty-spool weight for a brand. Returns false when it is invalid or cannot be kept. */
export function saveTare(vendor: string | null | undefined, grams: number): boolean {
  if (!isTare(grams)) return false;
  const tares = readTares();
  tares[brandKey(vendor) || NO_BRAND_KEY] = Math.round(grams * 10) / 10;
  return write(local, WEIGH_IN_KEY, JSON.stringify({ tares: sanitizeTares(tares) }));
}

/** Forgets a brand's saved empty-spool weight. */
export function forgetTare(vendor: string | null | undefined): boolean {
  const tares = readTares();
  delete tares[brandKey(vendor) || NO_BRAND_KEY];
  return write(local, WEIGH_IN_KEY, Object.keys(tares).length ? JSON.stringify({ tares }) : null);
}
