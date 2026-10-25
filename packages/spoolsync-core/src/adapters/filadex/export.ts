import type { PlannedChange } from "../../core/compare";
import { csvText } from "../shared/tabular";
import { mapRecord } from "./map";
import { createRecord, updateRecord, text, type Warn } from "./records";
import { CSV_COLUMNS, type FiladexLoadResult } from "./types";

export function exportFiladex(loaded: FiladexLoadResult, changes: PlannedChange[]) {
  const warnings: string[] = [];
  const warn: Warn = (message) => warnings.push(message);
  const records = loaded.file.map((record) => ({ ...record }));
  const byId = new Map(records.map((record, index) => [mapRecord(record, index).sourceId, record]));
  if (byId.size !== records.length)
    throw new Error(
      "Cannot export Filadex filaments with duplicate IDs. Give each filament a unique ID and reload the file.",
    );
  let updated = 0;
  let created = 0;
  const names = new Set(records.map((record) => text(record["name"]).toLowerCase()));

  for (const change of changes) {
    if (change.source !== "filadex") continue;
    if (change.kind === "update") {
      const record = byId.get(change.spool.sourceId);
      if (!record)
        throw new Error(
          `Filadex filament ${change.spool.sourceId} is missing. Reload the inventory and try again.`,
        );
      updateRecord(record, change, warn);
      updated++;
    } else {
      records.push(createRecord(change.values, change.groupId, names, warn));
      created++;
    }
  }
  if (created)
    warnings.push(
      "Filadex import skips filaments whose name already exists. Import new spools into Filadex; edit existing ones there.",
    );
  const csv = csvText(
    records.map((record) => Object.fromEntries(CSV_COLUMNS.map((c) => [c, record[c]]))),
    CSV_COLUMNS,
  );
  return {
    json: JSON.stringify(records, null, 2) + "\n",
    csv,
    total: records.length,
    updated,
    created,
    warnings,
  };
}
