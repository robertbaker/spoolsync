import { normalizeBarcode, normalizeHex } from "../cleanup/numbers";
import { contentId } from "./normalize";
import type { ReferenceFilament } from "./types";

export const DEFAULT_TTL_HOURS = 24;
export const MAX_TTL_HOURS = 24 * 30;
/** Catalogs beyond this are not cached, so a runaway response cannot fill the browser's storage. */
export const MAX_CACHED_FILAMENTS = 60_000;

/**
 * What is known about a kept catalog without its records. The records are large (the Open Filament
 * Database alone is about 24,000), so the browser keeps them apart from this small description.
 */
export interface ReferenceCacheMeta {
  providerId: string;
  /** Identifies the endpoint and mapping the data came from; a changed setting misses the cache. */
  key: string;
  /** Milliseconds since the epoch of the last time the data was fetched or confirmed current. */
  fetchedAt: number;
  ttlMs: number;
  attribution: string;
  license: string | null;
  /** The service's freshness token when the data was taken, or `null` when it gave none. */
  sourceToken: string | null;
  /** Where the data came from: the live service or the snapshot built into the site. */
  via: "fetch" | "snapshot";
  count: number;
}

/** A catalog kept for a while so the next visit does not fetch it again. */
export interface ReferenceCacheEntry extends Omit<
  ReferenceCacheMeta,
  "count" | "via" | "sourceToken"
> {
  via?: ReferenceCacheMeta["via"];
  sourceToken?: string | null;
  filaments: ReferenceFilament[];
}

export function cacheKey(parts: {
  urlTemplate: string;
  mapping: unknown;
  pagination: unknown;
}): string {
  return contentId([
    parts.urlTemplate,
    JSON.stringify(parts.mapping),
    JSON.stringify(parts.pagination),
  ]);
}

export function ttlMs(hours: number): number {
  const clean = Number.isFinite(hours)
    ? Math.min(MAX_TTL_HOURS, Math.max(0, hours))
    : DEFAULT_TTL_HOURS;
  return Math.round(clean * 3_600_000);
}

/** Fresh while the age is under the TTL (and not from the future, which means a bad clock). */
export function isFresh(
  entry: Pick<ReferenceCacheEntry, "fetchedAt" | "ttlMs">,
  now: number,
): boolean {
  const age = now - entry.fetchedAt;
  return age >= 0 && age < entry.ttlMs;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const str = (value: unknown, max = 300): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function httpsUrl(value: unknown): string | null {
  const text = str(value, 2000);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Re-validates a stored record; anything that does not fit is dropped rather than trusted. */
export function sanitizeFilament(raw: unknown): ReferenceFilament | null {
  if (!isObject(raw)) return null;
  const id = str(raw["id"]);
  const providerId = str(raw["providerId"], 60);
  if (!id || !providerId) return null;
  const hexes = Array.isArray(raw["colorHexes"])
    ? raw["colorHexes"]
        .map((hex) => (typeof hex === "string" ? (normalizeHex(hex)?.hex ?? null) : null))
        .filter((hex): hex is string => hex !== null)
        .slice(0, 8)
    : [];
  const colorHex =
    typeof raw["colorHex"] === "string" ? (normalizeHex(raw["colorHex"])?.hex ?? null) : null;
  const colorHexes = hexes.length ? hexes : colorHex ? [colorHex] : [];
  const barcode = typeof raw["barcode"] === "string" ? normalizeBarcode(raw["barcode"]) : null;
  const vendor = str(raw["vendor"]);
  if (!vendor && !barcode) return null;
  return {
    id,
    providerId,
    providerLabel: str(raw["providerLabel"], 80) ?? providerId,
    vendor,
    name: str(raw["name"]),
    material: str(raw["material"], 60),
    colorName: str(raw["colorName"]),
    colorHex: colorHexes[0] ?? null,
    colorHexes,
    diameter: num(raw["diameter"]),
    density: num(raw["density"]),
    nozzleTempMin: num(raw["nozzleTempMin"]),
    nozzleTempMax: num(raw["nozzleTempMax"]),
    bedTempMin: num(raw["bedTempMin"]),
    bedTempMax: num(raw["bedTempMax"]),
    initialWeight: num(raw["initialWeight"]),
    emptySpoolWeight: num(raw["emptySpoolWeight"]),
    price: num(raw["price"]),
    barcode,
    url: httpsUrl(raw["url"]),
    attribution: str(raw["attribution"], 500) ?? "",
    license: str(raw["license"], 500),
  };
}

/** Validates stored cache descriptions, one per provider. Damaged ones are dropped. */
export function sanitizeReferenceCacheMeta(raw: unknown): Record<string, ReferenceCacheMeta> {
  const out: Record<string, ReferenceCacheMeta> = {};
  if (!isObject(raw)) return out;
  for (const [providerId, value] of Object.entries(raw)) {
    if (!isObject(value)) continue;
    const key = str(value["key"], 40);
    const fetchedAt = num(value["fetchedAt"]);
    const ttl = num(value["ttlMs"]);
    const count = num(value["count"]);
    if (!key || fetchedAt === null || ttl === null || ttl < 0 || count === null || count <= 0)
      continue;
    out[providerId] = {
      providerId,
      key,
      fetchedAt,
      ttlMs: Math.min(ttl, ttlMs(MAX_TTL_HOURS)),
      attribution: str(value["attribution"], 500) ?? "",
      license: str(value["license"], 500),
      sourceToken: str(value["sourceToken"], 120),
      via: value["via"] === "snapshot" ? "snapshot" : "fetch",
      count: Math.floor(count),
    };
  }
  return out;
}

/** Re-validates stored records; anything that does not fit is dropped rather than trusted. */
export function sanitizeFilaments(raw: unknown): ReferenceFilament[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_CACHED_FILAMENTS) return null;
  const filaments = raw
    .map(sanitizeFilament)
    .filter((filament): filament is ReferenceFilament => filament !== null);
  return filaments.length ? filaments : null;
}
