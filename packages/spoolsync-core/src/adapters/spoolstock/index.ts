import type { LoadResult } from "../../core/model";
import { parseSpoolstockCsv } from "./csv";
import { spoolstockToCommon } from "./map";

export { parseSpoolstockCsv, SPOOLSTOCK_HEADERS } from "./csv";
export type { SpoolstockRecord } from "./csv";
export { spoolstockToCommon } from "./map";

/** Loads a Spoolstock CSV export into common spools. */
export function loadSpoolstockCsv(csvText: string): LoadResult {
  const { records, warnings } = parseSpoolstockCsv(csvText);
  const seen = new Set<string>();
  const spools = [];
  for (const record of records) {
    if (seen.has(record.short_id)) {
      warnings.push(`Spool ${record.short_id} appears more than once; using the first row.`);
      continue;
    }
    seen.add(record.short_id);
    spools.push(spoolstockToCommon(record));
  }
  return { source: "spoolstock", spools, warnings, loadedAt: new Date().toISOString() };
}
