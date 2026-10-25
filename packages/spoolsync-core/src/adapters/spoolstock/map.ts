import type { CommonSpool } from "../../core/model";
import {
  toBoolean,
  toDate,
  toNumber,
  toPositiveNumber,
  toText,
  uniqueHexes,
} from "../../core/normalize";
import type { SpoolstockRecord } from "./csv";

/** Spoolstock stores colours as a JSON array of `#RRGGBB` strings, occasionally comma-separated. */
function colors(value: string | undefined): string[] {
  const trimmed = value?.trim();
  if (!trimmed) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return uniqueHexes(Array.isArray(parsed) ? parsed : [parsed]);
  } catch {
    return uniqueHexes(trimmed.split(","));
  }
}

/** Recognizes `spoolman-<id>` short IDs in legacy Spoolstock exports to preserve existing matches. */
function spoolmanIdFromShortId(shortId: string): number | undefined {
  const match = /^spoolman-(\d+)$/.exec(shortId);
  return match ? Number(match[1]) : undefined;
}

export function spoolstockToCommon(record: SpoolstockRecord): CommonSpool {
  const shortId = record.short_id.trim();
  const spoolmanId = spoolmanIdFromShortId(shortId);
  const initialWeight = toPositiveNumber(record.size);
  return {
    source: "spoolstock",
    sourceId: shortId,
    crossIds: { spoolstockShortId: shortId, ...(spoolmanId !== undefined ? { spoolmanId } : {}) },
    vendor: toText(record["filament.brand.name"]),
    material: toText(record["filament.material.name"]),
    name: toText(record["filament.name"]),
    colors: colors(record["filament.color_hex_codes"]),
    diameter: toPositiveNumber(record.diameter) ?? toPositiveNumber(record["filament.diameter"]),
    density: toPositiveNumber(record["filament.material.density"]),
    nozzleTempMin: toPositiveNumber(record["filament.material.low_temp"]),
    nozzleTempMax: toPositiveNumber(record["filament.material.high_temp"]),
    bedTempMin: toPositiveNumber(record["filament.material.low_bed_temp"]),
    bedTempMax: toPositiveNumber(record["filament.material.high_bed_temp"]),
    upc: toText(record["filament.upc"]),
    initialWeight,
    remainingWeight: toNumber(record.remaining_weight),
    emptySpoolWeight: toPositiveNumber(record["empty_spool.weight"]),
    location: toText(record.inventory_location),
    price: toNumber(record.price),
    purchasedOn: toDate(record.purchased_on),
    lotNr: null,
    comment: toText(record.notes),
    archived: toBoolean(record.depleted),
    raw: record,
  };
}
