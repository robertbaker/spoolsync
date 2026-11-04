import { loadSpoolmanFile } from "@spoolsync/core/adapters/spoolman/file-load";
import type { LoadResult } from "@spoolsync/core/core/model";
import {
  buildImportReport,
  type ImportReport,
  type ImportReportEntry,
} from "@spoolsync/core/workflow";

import type { ConvertResult } from "./convert";

/**
 * The dry run of a column mapping. The converted CSV is read back with the real Spoolman file
 * importer, so the report shows exactly what loading it would do, without loading anything: no
 * state, storage, or service is touched.
 */
export interface DryRun {
  report: ImportReport;
  /** What the importer would produce, for previews. Never stored. */
  result: LoadResult;
}

const entry = (row: number, reason: string): ImportReportEntry => ({
  location: `Row ${row}`,
  row,
  reason,
});

/**
 * Merges the converter's own skipped rows and adjustments with the importer's, so every entry is
 * named by the row of the original file. The importer numbers spools in the converted file, which
 * leaves out skipped rows, so its locations are translated back through `sourceRows`.
 */
export function mapperImportReport(
  conversion: ConvertResult,
  loaded: LoadResult,
  fileName: string | null,
): ImportReport {
  const base = buildImportReport(loaded, fileName);
  const translate = (item: ImportReportEntry): ImportReportEntry => {
    const match = /^Spool (\d+)$/.exec(item.location);
    const original = match ? conversion.sourceRows[Number(match[1]) - 1] : undefined;
    return original === undefined ? item : { ...item, location: `Row ${original}`, row: original };
  };
  const byRow = (a: ImportReportEntry, b: ImportReportEntry) =>
    (a.row ?? Number.MAX_SAFE_INTEGER) - (b.row ?? Number.MAX_SAFE_INTEGER);
  return {
    ...base,
    rowsRead: conversion.rowsRead,
    skipped: [
      ...conversion.skipped.map((item) => entry(item.row, item.reason)),
      ...base.skipped.map(translate),
    ].sort(byRow),
    changed: [
      ...conversion.changed.map((item) => entry(item.row, item.reason)),
      ...base.changed.map(translate),
    ].sort(byRow),
  };
}

/** Reads the converted CSV with the Spoolman file importer and builds the combined report. */
export function dryRunConversion(conversion: ConvertResult, fileName: string | null): DryRun {
  const result = loadSpoolmanFile(conversion.csv);
  return { report: mapperImportReport(conversion, result, fileName), result };
}
