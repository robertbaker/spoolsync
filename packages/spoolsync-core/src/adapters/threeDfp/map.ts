import type { CommonSpool } from "../../core/model";
import {
  shortIdFromLotNr,
  toDate,
  toNumber,
  toPositiveNumber,
  toNonNegativeNumber,
  toText,
  uniqueHexes,
} from "../../core/normalize";
import { field } from "../shared/tabular";

export const JSON_NUMERIC_FIELDS = [
  "remaining_grams",
  "empty_spool_weight",
  "td_value",
  "filament_id",
] as const;
export const CSV_NUMERIC_FIELDS = [
  ...JSON_NUMERIC_FIELDS,
  "spool_purchase_price",
  "spool_preferred_nozzle_temp",
  "spool_preferred_bed_temp",
] as const;

export function jsonNumber(value: unknown, column: string, row: number): number | null {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  const number = toNumber(value);
  if (number === null)
    throw new Error(
      `3DFilamentProfiles data row ${row}: ${column} must contain a finite number or be blank.`,
    );
  return number;
}

export function mapRecord(record: Record<string, unknown>, index: number): CommonSpool {
  const properties =
    record.spool_properties && typeof record.spool_properties === "object"
      ? (record.spool_properties as Record<string, unknown>)
      : {};
  // filament_id identifies the shared catalog entry, not a physical spool.
  const rawId = field(record, "short_code", "id", "spool_id", "uuid");
  const id =
    toText(rawId) ??
    (typeof rawId === "number" && Number.isFinite(rawId) ? String(rawId) : `row-${index + 1}`);
  const color = field(record, "rgb", "color_hex", "rgba", "hex", "color_hex_code");
  const colors = Array.isArray(color) ? uniqueHexes(color) : uniqueHexes([color]);
  const extra = field(record, "extra_colors", "colors");
  if (Array.isArray(extra))
    colors.push(...uniqueHexes(extra).filter((hex) => !colors.includes(hex)));
  const spoolmanId = toNumber(field(record, "spool_spoolman_id") ?? properties.spoolman_id);
  const remaining = toNumber(
    field(record, "remaining_grams", "remaining_weight", "remaining", "weight_remaining"),
  );
  const note = toText(field(record, "notes", "comment", "description"));
  const lotNr = /^Lot:\s*(.+)$/im.exec(note ?? "")?.[1]?.trim() ?? null;
  return {
    source: "threeDfp",
    sourceId: id,
    crossIds: {
      threeDfpId: id,
      ...(spoolmanId ? { spoolmanId } : {}),
      ...(shortIdFromLotNr(lotNr) ? { spoolstockShortId: shortIdFromLotNr(lotNr) } : {}),
    },
    vendor: toText(field(record, "brand", "vendor", "manufacturer")),
    material: toText(field(record, "material", "type", "filament_type")),
    name: toText(field(record, "color", "name", "filament", "color_name", "colour_name")),
    colors,
    diameter: null,
    density: null,
    nozzleTempMin: toPositiveNumber(
      field(record, "spool_preferred_nozzle_temp") ?? properties.preferred_nozzle_temp,
    ),
    nozzleTempMax: null,
    bedTempMin: toPositiveNumber(
      field(record, "spool_preferred_bed_temp") ?? properties.preferred_bed_temp,
    ),
    bedTempMax: null,
    upc: toText(field(record, "upc", "barcode")),
    initialWeight: null,
    remainingWeight: remaining,
    emptySpoolWeight: toNonNegativeNumber(field(record, "empty_spool_weight", "spool_weight")),
    location: toText(field(record, "location", "storage_location")),
    price: toNumber(field(record, "spool_purchase_price") ?? properties.purchase_price),
    purchasedOn: toDate(field(record, "spool_purchase_date") ?? properties.purchase_date),
    lotNr,
    comment: note?.replace(/^Lot:\s*.+(?:\r?\n|$)/im, "").trim() || null,
    archived: false,
    raw: record,
  };
}
