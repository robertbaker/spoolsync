import { csvText } from "../adapters/shared/tabular";
import { SOURCE_LABELS, type LoadResult } from "../core/model";

/** Why a row did not become a spool, or what the importer had to assume while reading it. */
export interface ImportReportEntry {
  /** "Row 7", "Spool 3" or "Filament abc": the location as the adapter named it. */
  location: string;
  /** The row or record position when the adapter gave one; null for IDs and free-text labels. */
  row: number | null;
  reason: string;
}

export interface ImportReport {
  source: LoadResult["source"];
  fileName: string | null;
  /** Spools loaded plus rows that were skipped. */
  rowsRead: number;
  spoolsLoaded: number;
  /** Rows left out of the inventory. */
  skipped: ImportReportEntry[];
  /** Values the importer filled in or normalized; the spool was kept. */
  changed: ImportReportEntry[];
  /** Notes about the whole file. */
  warnings: string[];
  /** Spools that loaded with no remaining weight. */
  unknownWeight: number;
}

/** "Row 4: ...", "Spool 3: ...", "Filament abc: ...". */
const LOCATION = /^(Row|Spool|Filament)\s+(\S+?):\s*(.*)$/s;
/** "Record 55 is not a filament (type 3); skipped.", "Spool abc appears more than once; ..." */
const RECORD = /^(Record|Spool|Filament)\s+(\S+)\s+(.*)$/s;

/** Warnings about a value the importer assumed. The spool is kept. */
const CHANGED = [
  /initial weight was unknown/i,
  /remaining weight was unknown/i,
  /unknown remaining/i,
  /only the primary color/i,
];

/** Free-text-labelled warnings that mean a row was left out. */
const NOT_LOADED = [/skipped/i, /appears more than once/i, /^no serial/i, /^not a /i];

const matches = (patterns: RegExp[], text: string) => patterns.some((pattern) => pattern.test(text));

function located(kind: string, ref: string, reason: string): ImportReportEntry {
  return {
    location: `${kind} ${ref}`,
    row: kind !== "Record" && /^\d+$/.test(ref) ? Number(ref) : null,
    reason,
  };
}

/**
 * Sorts a load result's warnings into skipped rows, assumed values, and file-wide notes. Adapters
 * keep writing the same warning text; this only reads it, so `LoadResult` is unchanged. A warning
 * that names a row or record without being an assumption is a row that failed validation, and
 * those rows are not in `spools`.
 */
export function buildImportReport(
  result: LoadResult,
  fileName: string | null = null,
): ImportReport {
  const skipped: ImportReportEntry[] = [];
  const changed: ImportReportEntry[] = [];
  const warnings: string[] = [];
  for (const warning of result.warnings) {
    const match = LOCATION.exec(warning);
    if (match) {
      const [, kind = "", ref = "", reason = ""] = match;
      (matches(CHANGED, reason) ? changed : skipped).push(located(kind, ref, reason));
      continue;
    }
    const record = RECORD.exec(warning);
    if (record) {
      const [, kind = "", ref = "", reason = ""] = record;
      if (matches(CHANGED, reason) || matches(NOT_LOADED, reason)) {
        (matches(CHANGED, reason) ? changed : skipped).push(located(kind, ref, reason));
        continue;
      }
    }
    // "Eggs Red: initial weight was unknown..." has a free-text label instead of a row.
    const colon = warning.indexOf(": ");
    if (colon > 0) {
      const reason = warning.slice(colon + 2);
      const label = warning.slice(0, colon);
      if (matches(CHANGED, reason)) {
        changed.push({ location: label, row: null, reason });
        continue;
      }
      if (matches(NOT_LOADED, reason)) {
        skipped.push({ location: label, row: null, reason });
        continue;
      }
    }
    warnings.push(warning);
  }
  return {
    source: result.source,
    fileName,
    rowsRead: result.spools.length + skipped.length,
    spoolsLoaded: result.spools.length,
    skipped,
    changed,
    warnings,
    unknownWeight: result.spools.filter((spool) => spool.remainingWeight === null).length,
  };
}

/** True when there is nothing to tell the user beyond the row counts. */
export function isCleanImport(report: ImportReport): boolean {
  return !report.skipped.length && !report.changed.length && !report.warnings.length;
}

/** Spreadsheets read cells starting with these characters as formulas; inventory files are untrusted. */
function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** The report as CSV with one line per skipped row, assumed value, or note. */
export function importReportCsv(report: ImportReport): string {
  const service = SOURCE_LABELS[report.source];
  const file = safeCell(report.fileName ?? "");
  const line = (outcome: string, location: string, row: number | null, reason: string) => ({
    file,
    service,
    outcome,
    location: safeCell(location),
    row: row ?? "",
    reason: safeCell(reason),
  });
  const rows = [
    ...report.skipped.map((item) => line("skipped", item.location, item.row, item.reason)),
    ...report.changed.map((item) => line("changed", item.location, item.row, item.reason)),
    ...report.warnings.map((text) => line("note", "", null, text)),
  ];
  return csvText(rows, ["file", "service", "outcome", "location", "row", "reason"]);
}
