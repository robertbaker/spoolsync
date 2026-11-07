import { sanitizeFilament } from "./cache";
import { isProviderId, providerById } from "./providers";
import type { ReferenceFilament } from "./types";

/**
 * A catalog saved as a static file when the site is built (`public/reference/<provider>.json`), so
 * a visitor downloads it from SpoolSync's own host, once, instead of every visitor fetching it from
 * the reference service. Records are stored as rows under a column list: the same data, much
 * smaller, and the constant fields (provider, credit line, license) are kept once.
 */
export const SNAPSHOT_VERSION = 1;

export interface ReferenceSnapshot {
  providerId: string;
  /** Milliseconds since the epoch when the catalog was fetched for this snapshot. */
  generatedAt: number;
  /** The service's freshness token at that time, or `null`. */
  sourceToken: string | null;
  /** The address it was fetched from. */
  source: string;
  attribution: string;
  license: string | null;
  skipped: number;
  filaments: ReferenceFilament[];
}

export function snapshotPath(providerId: string): string {
  return `reference/${providerId}.json`;
}

const COLUMNS = [
  "id",
  "vendor",
  "name",
  "material",
  "colorName",
  "colorHexes",
  "diameter",
  "density",
  "nozzleTempMin",
  "nozzleTempMax",
  "bedTempMin",
  "bedTempMax",
  "initialWeight",
  "emptySpoolWeight",
  "price",
  "barcode",
  "url",
  "sourceUrl",
  "imageUrl",
  "dryingTemp",
  "dryingHours",
  "buyLinks",
] as const satisfies readonly (keyof ReferenceFilament)[];

/** The snapshot as compact JSON text. */
export function encodeSnapshot(snapshot: ReferenceSnapshot): string {
  return JSON.stringify({
    version: SNAPSHOT_VERSION,
    providerId: snapshot.providerId,
    generatedAt: snapshot.generatedAt,
    sourceToken: snapshot.sourceToken,
    source: snapshot.source,
    attribution: snapshot.attribution,
    license: snapshot.license,
    skipped: snapshot.skipped,
    columns: COLUMNS,
    rows: snapshot.filaments.map((filament) => COLUMNS.map((column) => filament[column])),
  });
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Reads a snapshot. Anything that is not a snapshot of a known provider in the current version, and
 * every record that does not validate, is dropped; a snapshot with no usable record is `null`. The
 * records are re-validated like a cached catalog, because the file is data, not code.
 */
export function decodeSnapshot(raw: unknown): ReferenceSnapshot | null {
  if (!isObject(raw) || raw["version"] !== SNAPSHOT_VERSION) return null;
  const providerId = raw["providerId"];
  if (!isProviderId(providerId)) return null;
  const provider = providerById(providerId);
  const generatedAt = raw["generatedAt"];
  const columns = raw["columns"];
  const rows = raw["rows"];
  if (
    !provider ||
    provider.info.kind !== "remote" ||
    typeof generatedAt !== "number" ||
    !Number.isFinite(generatedAt) ||
    Number.isNaN(new Date(generatedAt).getTime()) ||
    !Array.isArray(columns) ||
    !Array.isArray(rows)
  )
    return null;
  const attribution =
    typeof raw["attribution"] === "string" && raw["attribution"].trim()
      ? raw["attribution"].slice(0, 500)
      : provider.info.attribution;
  const license = typeof raw["license"] === "string" ? raw["license"].slice(0, 500) : null;
  const filaments: ReferenceFilament[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const record: Record<string, unknown> = {
      providerId,
      providerLabel: provider.info.label,
      attribution,
      license,
    };
    columns.forEach((column, index) => {
      if (typeof column === "string") record[column] = row[index] ?? null;
    });
    const hexes = record["colorHexes"];
    record["colorHex"] = Array.isArray(hexes) && typeof hexes[0] === "string" ? hexes[0] : null;
    const filament = sanitizeFilament(record);
    if (filament) filaments.push(filament);
  }
  if (!filaments.length) return null;
  const token = raw["sourceToken"];
  const skipped = raw["skipped"];
  return {
    providerId,
    generatedAt,
    sourceToken: typeof token === "string" && token ? token.slice(0, 120) : null,
    source: typeof raw["source"] === "string" ? raw["source"].slice(0, 2000) : "",
    attribution,
    license,
    skipped: typeof skipped === "number" && Number.isFinite(skipped) ? skipped : 0,
    filaments,
  };
}
