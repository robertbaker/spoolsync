import type { PlannedChange } from "../../core/compare";
import { systemRuntime, type AdapterRuntime } from "../shared/runtime";
import { csvText } from "../shared/tabular";
import { mapRecord } from "./map";
import { createRecord, updateRecord, setLinks } from "./records";
import { serializeRows } from "./serialize";
import type { ThreeDfpLoadResult } from "./types";
import { csvLossWarnings } from "./warnings";

export function exportThreeDfp(
  loaded: ThreeDfpLoadResult,
  changes: PlannedChange[],
  runtime: AdapterRuntime = systemRuntime,
) {
  const warnings: string[] = [];
  const container = Array.isArray(loaded.file)
    ? undefined
    : (loaded.file as Record<string, unknown>);
  const recordKey = container
    ? (["spools", "filaments", "items", "data"].find((key) => Array.isArray(container[key])) ??
      "spools")
    : undefined;
  const records = (
    Array.isArray(loaded.file) ? loaded.file : ((container?.[recordKey!] as unknown[]) ?? [])
  ) as Record<string, unknown>[];
  const byId = new Map(
    records.map((record, index) => [mapRecord(record, index).sourceId, structuredClone(record)]),
  );
  if (byId.size !== records.length)
    throw new Error(
      "Cannot export 3DFilamentProfiles rows with duplicate IDs. Give each spool a unique ID and reload the file.",
    );
  let updated = 0,
    created = 0;
  const output = [...byId.values()];
  for (const change of changes) {
    if (change.source !== "threeDfp") continue;
    let row: Record<string, unknown>;
    if (change.kind === "update") {
      const existing = byId.get(change.spool.sourceId);
      if (!existing)
        throw new Error(
          `3DFilamentProfiles spool ${change.spool.sourceId} is missing. Reload the inventory and try again.`,
        );
      row = existing;
      updateRecord(row, change, loaded.format, warnings);
      updated++;
    } else {
      row = createRecord(change, loaded.format, warnings, runtime);
      created++;
      output.push(row);
    }
    setLinks(row, change, loaded.format);
  }
  const { jsonRows, csvRows } = serializeRows(output, loaded.format);
  const file = Array.isArray(loaded.file)
    ? jsonRows
    : { ...container, [recordKey ?? "spools"]: jsonRows };
  const csvWarnings = csvLossWarnings(output, container, recordKey);
  return {
    json: JSON.stringify(file, null, 2) + "\n",
    csv: csvText(csvRows, [
      "short_code",
      "brand",
      "material",
      "color",
      "rgb",
      "remaining_grams",
      "empty_spool_weight",
      "location",
      "notes",
      "spool_spoolman_id",
      "spool_purchase_date",
      "spool_purchase_price",
      "spool_preferred_nozzle_temp",
      "spool_preferred_bed_temp",
    ]),
    total: output.length,
    updated,
    created,
    csvWarnings,
    warnings,
  };
}
