import type { PlannedChange } from "../../core/compare";
import { csvText } from "../shared/tabular";
import { changePatches } from "./records";
import type { FilamentDbAppLoadResult } from "./types";

/**
 * The columns Filament DB's spool importer reads (`POST /api/spools/import`). A row with a
 * `spoolId` updates that spool; a row without one adds a spool to the filament named in
 * `filament`.
 */
const COLUMNS = [
  "filament",
  "vendor",
  "label",
  "totalWeight",
  "lotNumber",
  "purchaseDate",
  "openedDate",
  "location",
  "spoolId",
  "instanceId",
] as const;

type Row = Record<string, unknown>;

/**
 * Writes the changed spools as a CSV that Filament DB's spool importer applies: it carries only the
 * rows that changed, so importing it leaves every other spool alone. The importer reads spool
 * fields only, so changes to a filament's own fields (brand, color, temperatures, ...) are reported
 * rather than silently dropped; use the snapshot or the CLI for those.
 */
export function exportFilamentDbAppCsv(loaded: FilamentDbAppLoadResult, changes: PlannedChange[]) {
  const warnings: string[] = [];
  const problem = (message: string) => warnings.push(message);
  const rows: Row[] = [];
  let updated = 0;
  let created = 0;
  let filamentFields = 0;
  let legacy = 0;

  for (const change of changes) {
    if (change.source !== "filamentDbApp") continue;
    if (change.kind === "create") {
      const v = change.values;
      const remaining = v.remainingWeight ?? v.initialWeight;
      rows.push({
        filament: v.name ?? "",
        vendor: v.vendor ?? "",
        label: v.comment ?? "",
        lotNumber: v.lotNr ?? "",
        totalWeight: remaining === null ? "" : remaining + (v.emptySpoolWeight ?? 0),
        purchaseDate: v.purchasedOn ?? "",
        location: v.location ?? "",
      });
      created++;
      continue;
    }
    const raw = change.spool.raw as { spool?: Row; legacyRoll?: boolean } | null;
    const source = raw?.spool;
    if (!source) throw new Error("This spool has no CSV row. Reload the inventory and try again.");
    if (raw.legacyRoll) {
      legacy++;
      continue;
    }
    const { filament, spool } = changePatches(change, {
      locationIdByName: new Map(),
      problem,
    });
    if (Object.keys(filament).length) filamentFields++;
    const row: Row = {};
    for (const column of COLUMNS) row[column] = source[column.toLowerCase()] ?? "";
    if (spool.remainingWeight !== undefined)
      row["totalWeight"] =
        spool.remainingWeight === null
          ? ""
          : spool.remainingWeight + (change.spool.emptySpoolWeight ?? 0);
    if (spool.purchaseDate !== undefined) row["purchaseDate"] = spool.purchaseDate ?? "";
    if (spool.label !== undefined) row["label"] = spool.label;
    if (spool.lotNumber !== undefined) row["lotNumber"] = spool.lotNumber ?? "";
    if (spool.retired !== undefined)
      problem("The spool CSV importer ignores the retired flag, so it was not written.");
    for (const { field, to } of change.changes)
      if (field === "location") row["location"] = typeof to === "string" ? to : "";
    rows.push(row);
    updated++;
  }
  if (filamentFields)
    warnings.push(
      `${filamentFields} spool${filamentFields === 1 ? " has" : "s have"} changes to filament fields (brand, color, temperatures, weights, price) that a spool CSV cannot carry. Use the snapshot JSON or the CLI for those.`,
    );
  if (legacy)
    warnings.push(
      `${legacy} roll${legacy === 1 ? " is" : "s are"} stored on the filament itself, with no spool record, so ${legacy === 1 ? "it was" : "they were"} left out.`,
    );
  if (created)
    warnings.push(
      "New rows are added only when Filament DB has a filament with the same name; the importer reports the rest.",
    );
  return {
    csv: csvText(rows, COLUMNS),
    total: loaded.spools.length + created,
    updated,
    created,
    warnings: [...new Set(warnings)],
  };
}
