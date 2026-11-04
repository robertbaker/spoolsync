import { normalizeBarcode, normalizeHex } from "../cleanup/numbers";
import { contentId } from "./normalize";
import type { ReferenceFilament } from "./types";

export const DEFAULT_TTL_HOURS = 24;
export const MAX_TTL_HOURS = 24 * 30;
/** Entries beyond this are not cached, so a huge catalog cannot fill the browser's storage. */
export const MAX_CACHED_FILAMENTS = 20_000;

/** A fetched catalog kept for a while so the next visit does not fetch it again. */
export interface ReferenceCacheEntry {
  providerId: string;
  /** Identifies the endpoint and mapping the data came from; a changed setting misses the cache. */
  key: string;
  /** Milliseconds since the epoch. */
  fetchedAt: number;
  ttlMs: number;
  attribution: string;
  license: string | null;
  filaments: ReferenceFilament[];
}

export function cacheKey(parts: {
  urlTemplate: string;
  mapping: unknown;
  pagination: unknown;
}): string {
  return contentId([parts.urlTemplate, JSON.stringify(parts.mapping), JSON.stringify(parts.pagination)]);
}

export function ttlMs(hours: number): number {
  const clean = Number.isFinite(hours) ? Math.min(MAX_TTL_HOURS, Math.max(0, hours)) : DEFAULT_TTL_HOURS;
  return Math.round(clean * 3_600_000);
}

/** Fresh while the age is under the TTL (and not from the future, which means a bad clock). */
export function isFresh(entry: Pick<ReferenceCacheEntry, "fetchedAt" | "ttlMs">, now: number): boolean {
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
  const colorHex = typeof raw["colorHex"] === "string" ? (normalizeHex(raw["colorHex"])?.hex ?? null) : null;
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

/** Validates stored cache entries, one per provider. Damaged or oversized ones are dropped. */
export function sanitizeReferenceCache(raw: unknown): Record<string, ReferenceCacheEntry> {
  const out: Record<string, ReferenceCacheEntry> = {};
  if (!isObject(raw)) return out;
  for (const [providerId, value] of Object.entries(raw)) {
    if (!isObject(value) || !Array.isArray(value["filaments"])) continue;
    const key = str(value["key"], 40);
    const fetchedAt = num(value["fetchedAt"]);
    const ttl = num(value["ttlMs"]);
    if (!key || fetchedAt === null || ttl === null || ttl < 0 || value["filaments"].length > MAX_CACHED_FILAMENTS)
      continue;
    const filaments = value["filaments"]
      .map(sanitizeFilament)
      .filter((filament): filament is ReferenceFilament => filament !== null);
    if (!filaments.length) continue;
    out[providerId] = {
      providerId,
      key,
      fetchedAt,
      ttlMs: Math.min(ttl, ttlMs(MAX_TTL_HOURS)),
      attribution: str(value["attribution"], 500) ?? "",
      license: str(value["license"], 500),
      filaments,
    };
  }
  return out;
}
