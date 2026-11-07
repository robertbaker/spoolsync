import type { CommonSpool, ComparableField } from "../../core/model";
import { toNumber, toPositiveNumber, toText, uniqueHexes } from "../../core/normalize";
import type { BambuddyLoadResult, BambuddySpool } from "./types";

export const roundPrice = (value: number) => Math.round(value * 10000) / 10000;

export function numericId(value: unknown): number | null {
  const id = toNumber(value);
  return id !== null && Number.isSafeInteger(id) && id >= 0 ? id : null;
}

/**
 * `syntheticIds` holds IDs this loader invented (a CSV row number, since Bambuddy's CSV export has
 * no ID column). They keep records unique in a snapshot but are not Bambuddy IDs, so they are never
 * stored as `bambuddyId`, and no API write may be sent to them.
 */
export function mapSpool(
  spool: BambuddySpool,
  index: number,
  syntheticIds: ReadonlySet<number> = new Set(),
  unavailable?: readonly ComparableField[],
): CommonSpool {
  const numeric = numericId(spool.id);
  const id = String(numeric ?? index + 1);
  const authoritative = numeric !== null && !syntheticIds.has(numeric);
  const initialWeight = toPositiveNumber(spool.label_weight);
  const costPerKg = toNumber(spool.cost_per_kg);
  const coreWeight = toNumber(spool.core_weight);
  return {
    source: "bambuddy",
    sourceId: id,
    crossIds: authoritative ? { bambuddyId: Number(id) } : {},
    vendor: toText(spool.brand),
    material: toText(spool.material),
    name: toText(spool.color_name),
    colors: uniqueHexes([
      spool.rgba,
      ...(Array.isArray(spool.extra_colors)
        ? spool.extra_colors
        : typeof spool.extra_colors === "string"
          ? spool.extra_colors.split(",")
          : []),
    ]),
    diameter: null,
    density: null,
    nozzleTempMin: toPositiveNumber(spool.nozzle_temp_min),
    nozzleTempMax: toPositiveNumber(spool.nozzle_temp_max),
    bedTempMin: null,
    bedTempMax: null,
    upc: null,
    initialWeight,
    remainingWeight:
      spool.weight_used == null || initialWeight === null
        ? null
        : Math.max(
            0,
            (toPositiveNumber(spool.label_weight) ?? 0) - (toNumber(spool.weight_used) ?? 0),
          ),
    emptySpoolWeight: coreWeight !== null && coreWeight >= 0 ? coreWeight : null,
    location: toText(spool.storage_location),
    price:
      costPerKg === 0
        ? 0
        : costPerKg !== null && initialWeight !== null
          ? roundPrice((costPerKg * initialWeight) / 1000)
          : null,
    purchasedOn: null,
    lotNr: toText(spool.material_number),
    finish: toText(spool.subtype),
    td: null,
    comment: toText(spool.note),
    archived: Boolean(spool.archived_at),
    ...(unavailable?.length ? { unavailable } : {}),
    raw: spool,
  };
}

export function priceWarnings(spools: BambuddySpool[]): string[] {
  return spools.flatMap((spool, index) =>
    toNumber(spool.cost_per_kg) !== null &&
    toNumber(spool.cost_per_kg) !== 0 &&
    toPositiveNumber(spool.label_weight) === null
      ? [
          `Bambuddy spool ${spool.id ?? index + 1}: price per spool is unknown because label weight is missing.`,
        ]
      : [],
  );
}

/** Common assembly for API, JSON, and CSV inventories. */
export function inventoryFromRecords(
  records: BambuddySpool[],
  syntheticIds: ReadonlySet<number> = new Set(),
  unavailable?: readonly ComparableField[],
): BambuddyLoadResult {
  return {
    source: "bambuddy",
    spools: records.map((record, index) => mapSpool(record, index, syntheticIds, unavailable)),
    warnings: priceWarnings(records),
    loadedAt: new Date().toISOString(),
  };
}

export function recordsFrom(value: unknown): BambuddySpool[] {
  const candidate = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? ((value as Record<string, unknown>).items ??
        (value as Record<string, unknown>).spools ??
        (value as Record<string, unknown>).data)
      : undefined;
  if (!Array.isArray(candidate)) throw new Error("Bambuddy response did not contain a spool list.");
  if (
    !candidate.every(
      (spool) =>
        spool && typeof spool === "object" && !Array.isArray(spool) && numericId(spool.id) !== null,
    )
  )
    throw new Error(
      "Bambuddy spool list contains an invalid record: each spool needs a non-negative safe integer ID.",
    );
  const ids = new Set<number>();
  for (const spool of candidate) {
    const id = numericId(spool.id)!;
    if (ids.has(id))
      throw new Error(`Duplicate Bambuddy record ID "${id}". Each spool must have a unique ID.`);
    ids.add(id);
  }
  return candidate as BambuddySpool[];
}
