import type { CommonSpool } from "../../core/model";
import { shortIdFromLotNr, toDate, toHex, toText, uniqueHexes } from "../../core/normalize";
import { readExtra, type SpoolmanSpool } from "./schema";

/**
 * Extra keys SpoolSync reads for cross-ids. `spoolstock_*` are the keys the printstudio importer
 * already writes; `spoolsync_*` are written by SpoolSync itself.
 */
export const SPOOLMAN_SPOOL_EXTRAS = {
  spoolstock_short_id: "Spoolstock ID",
  spoolstock_purchased_on: "Purchased on",
  spoolsync_spoolio_id: "Spoolio ID",
  spoolsync_tigertag_uid: "TigerTag UID",
} as const;

function colors(filament: SpoolmanSpool["filament"]): string[] {
  const multi = uniqueHexes((filament.multi_color_hexes ?? "").split(","));
  if (multi.length) return multi;
  const single = toHex(filament.color_hex);
  return single ? [single] : [];
}

export function spoolmanToCommon(spool: SpoolmanSpool): CommonSpool {
  const { filament } = spool;
  const shortId = readExtra(spool.extra, "spoolstock_short_id") ?? shortIdFromLotNr(spool.lot_nr);
  const spoolioId = readExtra(spool.extra, "spoolsync_spoolio_id");
  const tigertagUid = readExtra(spool.extra, "spoolsync_tigertag_uid");
  const initialWeight = spool.initial_weight ?? filament.weight ?? null;
  const remainingWeight =
    spool.remaining_weight ??
    (initialWeight !== null && spool.used_weight !== undefined
      ? Math.max(0, initialWeight - spool.used_weight)
      : null);

  return {
    source: "spoolman",
    sourceId: String(spool.id),
    crossIds: {
      spoolmanId: spool.id,
      ...(shortId ? { spoolstockShortId: shortId } : {}),
      ...(spoolioId ? { spoolioId } : {}),
      ...(tigertagUid ? { tigertagUid } : {}),
    },
    vendor: toText(filament.vendor?.name),
    material: toText(filament.material),
    name: toText(filament.name),
    colors: colors(filament),
    diameter: filament.diameter ?? null,
    density: filament.density ?? null,
    nozzleTempMin: filament.settings_extruder_temp ?? null,
    nozzleTempMax: filament.settings_extruder_temp ?? null,
    bedTempMin: filament.settings_bed_temp ?? null,
    bedTempMax: filament.settings_bed_temp ?? null,
    upc: toText(filament.article_number),
    initialWeight,
    remainingWeight,
    emptySpoolWeight:
      spool.spool_weight ?? filament.spool_weight ?? filament.vendor?.empty_spool_weight ?? null,
    location: toText(spool.location),
    price: spool.price ?? filament.price ?? null,
    purchasedOn: toDate(readExtra(spool.extra, "spoolstock_purchased_on")),
    lotNr: toText(spool.lot_nr),
    comment: toText(spool.comment),
    archived: spool.archived ?? false,
    raw: spool,
  };
}
