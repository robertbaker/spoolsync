import type { CommonSpool } from "../../core/model";
import {
  toBoolean,
  toNonNegativeNumber,
  toPositiveNumber,
  toText,
  uniqueHexes,
} from "../../core/normalize";
import { field } from "../shared/tabular";

type Row = Record<string, unknown>;

const DEPLETED_STATUSES = new Set(["depleted", "empty", "finished", "archived", "used up", "gone"]);

/** Colours arrive as a JSON array, a comma/semicolon/pipe list, or one bare `RRGGBB` value. */
function colors(value: unknown): string[] {
  const trimmed = toText(value);
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return uniqueHexes(parsed);
    } catch {
      // Fall through to delimiter splitting.
    }
  }
  return uniqueHexes(trimmed.split(/[,;|\s]+/));
}

function text(value: unknown): string | null {
  return typeof value === "number" ? String(value) : toText(value);
}

/**
 * Maps a row of Spool Hoarder's inventory CSV. `weightBasis` says whether `remainingWeight`
 * includes the empty spool; gross weights are reduced to net filament when the tare is known.
 */
export function templateRowToCommon(row: Row, index: number): CommonSpool {
  const id = text(field(row, "spoolId")) ?? `row-${index + 1}`;
  const initialWeight = toPositiveNumber(field(row, "spoolSize"));
  const emptySpoolWeight = toNonNegativeNumber(field(row, "emptySpoolWeight"));
  let remainingWeight = toNonNegativeNumber(field(row, "remainingWeight"));
  const basis = text(field(row, "weightBasis"))?.toLowerCase() ?? "";
  if (remainingWeight !== null && emptySpoolWeight !== null && /gross|total|with/.test(basis))
    remainingWeight = Math.max(0, remainingWeight - emptySpoolWeight);
  const status = text(field(row, "status"))?.toLowerCase() ?? "";
  const temperature = toPositiveNumber(field(row, "extruderTemp"));
  const bedTemperature = toPositiveNumber(field(row, "bedTemp"));
  const hexes = colors(field(row, "colorHexCodes"));
  return {
    source: "spoolhoarder",
    sourceId: id,
    crossIds: { spoolhoarderId: id },
    vendor: text(field(row, "brand")),
    material: text(field(row, "material")),
    name: text(field(row, "name")) ?? text(field(row, "colors")),
    colors: hexes,
    diameter: toPositiveNumber(field(row, "diameter")),
    density: null,
    nozzleTempMin: temperature,
    nozzleTempMax: temperature,
    bedTempMin: bedTemperature,
    bedTempMax: bedTemperature,
    upc: null,
    initialWeight,
    remainingWeight,
    emptySpoolWeight,
    location: text(field(row, "inventoryLocation")),
    price: toNonNegativeNumber(field(row, "price")),
    purchasedOn: null,
    lotNr: null,
    comment: text(field(row, "notes")),
    archived: toBoolean(field(row, "depleted")) || DEPLETED_STATUSES.has(status),
    raw: row,
  };
}

/**
 * Maps a row of the HueForge library export Spool Hoarder writes. It describes filament colours and
 * transmission distance rather than spools, so weights are absent and un-owned entries are
 * archived.
 */
export function hueforgeRowToCommon(row: Row, index: number): CommonSpool {
  const id = text(field(row, "uuid")) ?? `row-${index + 1}`;
  const owned = field(row, "owned");
  return {
    source: "spoolhoarder",
    sourceId: id,
    crossIds: { spoolhoarderId: id },
    vendor: text(field(row, "brand")),
    material: text(field(row, "type")),
    name: text(field(row, "name")),
    colors: uniqueHexes([field(row, "color")]),
    diameter: null,
    density: null,
    nozzleTempMin: null,
    nozzleTempMax: null,
    bedTempMin: null,
    bedTempMax: null,
    upc: null,
    initialWeight: null,
    remainingWeight: null,
    emptySpoolWeight: null,
    location: null,
    price: null,
    purchasedOn: null,
    lotNr: null,
    comment: null,
    archived: owned !== undefined && !toBoolean(owned),
    raw: row,
  };
}
