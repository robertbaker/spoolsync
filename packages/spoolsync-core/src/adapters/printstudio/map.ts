import type { CommonSpool } from "../../core/model";
import { toNonNegativeNumber, toText, uniqueHexes } from "../../core/normalize";
import type { PrintStudioLoadResult, PrintStudioLot } from "./types";

/** Lots PrintStudio's Spoolman sync wrote are `spoolman-<id>`; the id is Spoolman's spool id. */
const SPOOLMAN_LOT = /^spoolman-(\d+)$/;

export const isLocalLot = (lot: { sourceSystem?: unknown }): boolean =>
  lot.sourceSystem === "local";

export function spoolmanIdOf(lot: PrintStudioLot): number | undefined {
  if (lot.sourceSystem !== "spoolman") return undefined;
  const match = SPOOLMAN_LOT.exec(lot.id);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) ? id : undefined;
}

/** Whether this lot is a gram-counted filament spool, the only kind SpoolSync models. */
export const isFilamentSpool = (lot: PrintStudioLot): boolean =>
  lot.family === "filament" && lot.unit === "g";

export function mapLot(lot: PrintStudioLot): CommonSpool {
  const appearance =
    lot["appearance"] && typeof lot["appearance"] === "object"
      ? (lot["appearance"] as Record<string, unknown>)
      : {};
  const spoolmanId = spoolmanIdOf(lot);
  return {
    source: "printstudio",
    sourceId: lot.id,
    crossIds: {
      printstudioId: lot.id,
      ...(spoolmanId === undefined ? {} : { spoolmanId }),
    },
    vendor: toText(lot["brand"]),
    material: toText(lot["material"]),
    name: toText(lot["colorName"]) ?? toText(appearance["colorName"]),
    colors: uniqueHexes(Array.isArray(appearance["colors"]) ? appearance["colors"] : []),
    diameter: null,
    density: null,
    nozzleTempMin: null,
    nozzleTempMax: null,
    bedTempMin: null,
    bedTempMax: null,
    upc: null,
    // A lot stores the quantity on hand and a price per gram, not the spool's full weight.
    initialWeight: null,
    remainingWeight: toNonNegativeNumber(lot["quantityOnHand"]),
    emptySpoolWeight: null,
    location: null,
    price: null,
    purchasedOn: null,
    lotNr: null,
    finish: null,
    td: null,
    comment: null,
    archived: false,
    raw: lot,
  };
}

/** Pulls the lot list out of a bare array or a `{ materials | items | data }` wrapper. */
export function lotsFrom(value: unknown): PrintStudioLot[] {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const candidate = Array.isArray(value)
    ? value
    : (record["materials"] ?? record["items"] ?? record["data"]);
  if (!Array.isArray(candidate))
    throw new Error("PrintStudio response did not contain a material lot list.");
  const ids = new Set<string>();
  for (const lot of candidate) {
    if (
      !lot ||
      typeof lot !== "object" ||
      Array.isArray(lot) ||
      typeof lot.id !== "string" ||
      !lot.id
    )
      throw new Error(
        "PrintStudio material list contains an invalid record: each lot needs a text id.",
      );
    if (ids.has(lot.id))
      throw new Error(`Duplicate PrintStudio lot ID "${lot.id}". Each lot must have a unique ID.`);
    ids.add(lot.id);
  }
  return candidate as PrintStudioLot[];
}

/** Common assembly for API and file inventories. Non-spool lots become warnings. */
export function inventoryFromLots(lots: PrintStudioLot[]): PrintStudioLoadResult {
  const spools: CommonSpool[] = [];
  const warnings: string[] = [];
  for (const lot of lots) {
    if (isFilamentSpool(lot)) spools.push(mapLot(lot));
    else
      warnings.push(
        `PrintStudio lot ${lot.id}: skipped because it is ${String(lot.family ?? "unknown")} counted in ${String(lot.unit ?? "unknown units")}; only filament counted in grams maps to a spool.`,
      );
  }
  return {
    source: "printstudio",
    spools,
    warnings,
    loadedAt: new Date().toISOString(),
  };
}
