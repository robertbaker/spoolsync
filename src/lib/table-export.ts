import { SOURCE_LABELS, type CommonSpool, type LoadResult } from "@spoolsync/core/core/model";

/**
 * Exports of the spools the Load table is showing right now (after search, filters and sort), in
 * table order. Weights are always grams so a file means the same whatever display unit is chosen.
 * The CSV reuses core's combined-inventory writer, which also neutralises spreadsheet formulas.
 */

/** Wraps spools in one load result so core's CSV writer can take them. Order is kept. */
export function asLoadResult(spools: readonly CommonSpool[], loadedAt: string): LoadResult {
  return {
    source: spools[0]?.source ?? "spoolman",
    spools: [...spools],
    warnings: [],
    loadedAt,
  };
}

export interface ViewJsonSpool {
  service: string;
  id: string;
  vendor: string | null;
  material: string | null;
  name: string | null;
  colors: string[];
  diameterMm: number | null;
  density: number | null;
  initialWeightG: number | null;
  remainingWeightG: number | null;
  emptySpoolWeightG: number | null;
  location: string | null;
  price: number | null;
  purchasedOn: string | null;
  lotNr: string | null;
  finish: string | null;
  td: number | null;
  barcode: string | null;
  comment: string | null;
  archived: boolean;
}

export interface ViewJson {
  format: "spoolsync-view";
  version: 1;
  exportedAt: string;
  count: number;
  spools: ViewJsonSpool[];
}

const finite = (value: number | null): number | null =>
  value !== null && Number.isFinite(value) ? value : null;

/** The view as JSON. Source-specific raw records are left out; this is the common model only. */
export function viewJson(spools: readonly CommonSpool[], exportedAt: string): string {
  const document: ViewJson = {
    format: "spoolsync-view",
    version: 1,
    exportedAt,
    count: spools.length,
    spools: spools.map((spool) => ({
      service: SOURCE_LABELS[spool.source],
      id: spool.sourceId,
      vendor: spool.vendor,
      material: spool.material,
      name: spool.name,
      colors: spool.colors.map((color) => `#${color}`),
      diameterMm: finite(spool.diameter),
      density: finite(spool.density),
      initialWeightG: finite(spool.initialWeight),
      remainingWeightG: finite(spool.remainingWeight),
      emptySpoolWeightG: finite(spool.emptySpoolWeight),
      location: spool.location,
      price: finite(spool.price),
      purchasedOn: spool.purchasedOn,
      lotNr: spool.lotNr,
      finish: spool.finish,
      td: finite(spool.td),
      barcode: spool.upc,
      comment: spool.comment,
      archived: spool.archived,
    })),
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** `spoolsync-view-2026-11-03.csv` */
export const viewFilename = (extension: "csv" | "json", now: Date): string =>
  `spoolsync-view-${now.toISOString().slice(0, 10)}.${extension}`;
