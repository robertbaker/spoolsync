import type { CommonSpool, ComparableField } from "../../core/model";
import {
  toBoolean,
  toHex,
  toNonNegativeNumber,
  toPositiveNumber,
  toText,
} from "../../core/normalize";
import { field, parseTable } from "../shared/tabular";
import { spoolName } from "./map";
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

/** A text cell with the export's formula guard removed. */
const plain = (row: Record<string, unknown>, ...names: string[]) => {
  const value = text(row, ...names);
  return value === null ? null : unsanitizeCsvCell(value);
};

/** A purchase date cell is `YYYY-MM-DD`; anything else is left out rather than guessed. */
const date = (value: string | null) =>
  value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;

const FORMULA_TRIGGERS = ["=", "+", "-", "@", String.fromCharCode(9), String.fromCharCode(13)];

/**
 * Undoes the `'` that Filament DB's CSV export puts before a cell starting with a formula character
 * (`csvCell`/`unsanitizeCsvCell` upstream): one apostrophe, or one of a longer apostrophe run, is
 * stripped only when a formula character follows. Other apostrophes are real.
 */
export function unsanitizeCsvCell(value: string): string {
  let n = 0;
  while (n < value.length && value[n] === "'") n++;
  return n >= 1 && n < value.length && FORMULA_TRIGGERS.includes(value[n]!)
    ? value.slice(1)
    : value;
}

/** The export's guard for a cell the importer will unguard again, so the stored text survives. */
export function sanitizeCsvCell(value: string): string {
  if (value && FORMULA_TRIGGERS.includes(value[0]!)) return `'${value}`;
  let n = 0;
  while (n < value.length && value[n] === "'") n++;
  return n >= 1 && n < value.length && FORMULA_TRIGGERS.includes(value[n]!) ? `'${value}` : value;
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
      vendor: plain(row, "vendor"),
      material: text(row, "type"),
      name: spoolName(plain(row, "filament"), plain(row, "parent")),
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
      location: plain(row, "location"),
      price: null,
      purchasedOn: date(text(row, "purchaseDate")),
      lotNr: plain(row, "lotNumber"),
      finish: null,
      td: null,
      comment: plain(row, "label"),
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
