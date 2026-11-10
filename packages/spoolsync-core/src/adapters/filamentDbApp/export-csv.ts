import type { PlannedChange } from "../../core/compare";
import { csvText } from "../shared/tabular";
import { sanitizeCsvCell } from "./csv";
import { changePatches, withinTextLimit } from "./records";
import { newSpoolDrops } from "./target";
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

const lower = (value: unknown) => (typeof value === "string" ? value.toLowerCase() : "");

/**
 * The importer finds a filament by its stored name and, when a vendor is given, its stored vendor.
 * The export writes the vendor a variant inherits, which no stored vendor matches, so a variant's
 * row leaves the vendor blank and is matched by name alone.
 */
const importVendor = (row: Row) =>
  String(row["parent"] ?? "").trim() ? "" : (row["vendor"] ?? "");

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
      // The importer matches the stored filament name, which a color name only equals for a
      // standalone filament; borrow the stored name of a loaded spool of the same filament.
      const twin = loaded.spools.find(
        (s) =>
          lower(s.name) === lower(v.name) &&
          lower(s.vendor) === lower(v.vendor) &&
          lower(s.material) === lower(v.material),
      );
      const twinRow = (twin?.raw as { spool?: Row } | null)?.spool;
      const label = withinTextLimit(v.comment || null, "label", problem);
      const lot = withinTextLimit(v.lotNr || null, "lot number", problem);
      const remaining = v.remainingWeight ?? v.initialWeight;
      // The importer stores totalWeight as given; only the filament's own tare is added on reading.
      const tare = twin?.emptySpoolWeight ?? null;
      for (const note of newSpoolDrops(v, tare)) problem(note);
      if (remaining === null && !label && !lot && !v.purchasedOn && !v.location) {
        // The importer would add an empty spool for a row like this.
        problem(
          `Skipped a new spool (${v.name ?? change.groupId}): Filament DB needs at least a weight, label, lot number, purchase date or location to add a spool, and this one has none.`,
        );
        continue;
      }
      rows.push({
        filament: twinRow ? (twinRow["filament"] ?? "") : sanitizeCsvCell(v.name ?? ""),
        vendor: twinRow ? importVendor(twinRow) : sanitizeCsvCell(v.vendor ?? ""),
        label: sanitizeCsvCell(label ?? ""),
        lotNumber: sanitizeCsvCell(lot ?? ""),
        totalWeight: remaining === null ? "" : remaining + (tare ?? 0),
        purchaseDate: v.purchasedOn ?? "",
        location: sanitizeCsvCell(v.location ?? ""),
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
    row["vendor"] = importVendor(source);
    let wroteSpoolField = false;
    if (spool.remainingWeight !== undefined) {
      row["totalWeight"] =
        spool.remainingWeight === null
          ? ""
          : spool.remainingWeight + (change.spool.emptySpoolWeight ?? 0);
      wroteSpoolField = true;
    }
    if (spool.purchaseDate !== undefined) {
      row["purchaseDate"] = spool.purchaseDate ?? "";
      wroteSpoolField = true;
    }
    if (spool.label !== undefined) {
      row["label"] = sanitizeCsvCell(spool.label);
      wroteSpoolField = true;
    }
    if (spool.lotNumber !== undefined) {
      row["lotNumber"] = sanitizeCsvCell(spool.lotNumber ?? "");
      wroteSpoolField = true;
    }
    if (spool.retired !== undefined)
      problem("The spool CSV importer ignores the retired flag, so it was not written.");
    for (const { field, to } of change.changes)
      if (field === "location") {
        row["location"] = typeof to === "string" ? sanitizeCsvCell(to) : "";
        wroteSpoolField = true;
      }
    if (!wroteSpoolField) continue;
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
