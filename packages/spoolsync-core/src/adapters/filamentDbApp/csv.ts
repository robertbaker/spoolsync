import type { CommonSpool, ComparableField } from "../../core/model";
import {
  toBoolean,
  toHex,
  toNonNegativeNumber,
  toPositiveNumber,
  toText,
} from "../../core/normalize";
import { field, parseTable } from "../shared/tabular";
import type { FilamentDbAppLoadResult } from "./types";

/** The spool CSV has no columns for these, so a CSV load leaves them out of comparison. */
const CSV_UNAVAILABLE: readonly ComparableField[] = [
  "diameter",
  "density",
  "nozzleTempMin",
  "nozzleTempMax",
  "bedTempMin",
  "bedTempMax",
  "price",
  "td",
];

const text = (row: Record<string, unknown>, ...names: string[]) => toText(field(row, ...names));

/** A purchase date cell is `YYYY-MM-DD`; anything else is left out rather than guessed. */
const date = (value: string | null) =>
  value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;

/**
 * The spool export writes the stored filament name (a variant's is often "Parent - Red"), but
 * SpoolSync names a spool by its color name, as the JSON load does. A variant's name that starts
 * with its parent's name and a separator loses that prefix; anything else is kept whole.
 */
function spoolName(stored: string | null, parent: string | null): string | null {
  if (!stored || !parent || !stored.toLowerCase().startsWith(parent.toLowerCase())) return stored;
  // The prefix only counts when a separator follows it ("PLA+ Red" is not "PLA" + "+ Red").
  const separator = /^[\s\-–—:|/·]+/.exec(stored.slice(parent.length));
  if (!separator) return stored;
  return stored.slice(parent.length + separator[0].length) || stored;
}

/**
 * Reads the spool CSV from Filament DB's `/api/spools/export-csv`: one row per spool, with the
 * filament's resolved vendor, material, color and weights beside it. A legacy single-roll filament
 * has no spool id, so its row is keyed by the filament and cannot be written back.
 */
export function loadFilamentDbAppCsv(csv: string): FilamentDbAppLoadResult {
  const { rows, headers } = parseTable(csv);
  if (!headers.includes("filament") || !headers.includes("totalweight"))
    throw new Error(
      "This CSV is not Filament DB's spool export. Use Import/Export → Spools CSV, or /api/spools/export-csv.",
    );
  const warnings: string[] = [];
  const spools: CommonSpool[] = [];
  rows.forEach((row, index) => {
    const spoolId = text(row, "spoolId");
    const filamentId = text(row, "filamentId");
    const id = spoolId ?? (filamentId ? `legacy:${filamentId}` : text(row, "instanceId"));
    if (!id) {
      warnings.push(`Row ${index + 1}: no spool or filament id, so it was skipped.`);
      return;
    }
    const tare = toNonNegativeNumber(field(row, "spoolWeight"));
    const gross = toNonNegativeNumber(field(row, "totalWeight"));
    const color = toHex(field(row, "color"));
    spools.push({
      source: "filamentDbApp",
      sourceId: id,
      crossIds: { filamentDbAppId: id },
      vendor: text(row, "vendor"),
      material: text(row, "type"),
      name: spoolName(text(row, "filament"), text(row, "parent")),
      colors: color ? [color] : [],
      diameter: null,
      density: null,
      nozzleTempMin: null,
      nozzleTempMax: null,
      bedTempMin: null,
      bedTempMax: null,
      upc: null,
      initialWeight: toPositiveNumber(field(row, "netFilamentWeight")),
      remainingWeight: gross === null ? null : Math.max(0, gross - (tare ?? 0)),
      emptySpoolWeight: tare,
      location: text(row, "location"),
      price: null,
      purchasedOn: date(text(row, "purchaseDate")),
      lotNr: text(row, "lotNumber"),
      finish: null,
      td: null,
      comment: text(row, "label"),
      archived: toBoolean(field(row, "retired")),
      unavailable: CSV_UNAVAILABLE,
      raw: { filamentId, spool: row, legacyRoll: !spoolId },
    });
  });
  return {
    source: "filamentDbApp",
    origin: "file",
    file: { filaments: [], locations: {}, document: null },
    spools,
    warnings,
    loadedAt: new Date().toISOString(),
  };
}
