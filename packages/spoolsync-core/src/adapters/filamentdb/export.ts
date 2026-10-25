import type { PlannedChange } from "../../core/compare";
import { systemRuntime, type AdapterRuntime } from "../shared/runtime";
import { createRecord, updateRecord, type Warn } from "./records";
import type { FilamentDbLoadResult } from "./types";

export function exportFilamentDb(
  loaded: FilamentDbLoadResult,
  changes: PlannedChange[],
  runtime: AdapterRuntime = systemRuntime,
) {
  const warnings: string[] = [];
  const warn: Warn = (message) => warnings.push(message);
  const records = loaded.file.map((record) => ({ ...record }));
  const byId = new Map(records.map((record) => [String(record["serial"]), record]));
  if (byId.size !== records.length)
    throw new Error(
      "Cannot export FilamentDB spools with duplicate serials. Give each spool a unique serial and reload the file.",
    );
  let updated = 0;
  let created = 0;

  for (const change of changes) {
    if (change.source !== "filamentdb") continue;
    if (change.kind === "update") {
      const record = byId.get(change.spool.sourceId);
      if (!record)
        throw new Error(
          `FilamentDB spool ${change.spool.sourceId} is missing. Reload the inventory and try again.`,
        );
      updateRecord(record, change, warn, runtime.now());
      updated++;
    } else {
      records.push(
        createRecord(
          change.values,
          `FilamentDB ${change.values.name ?? change.groupId}`,
          warn,
          runtime.now(),
          () => runtime.randomUUID(),
        ),
      );
      created++;
    }
  }
  return {
    json: JSON.stringify(records, null, 2) + "\n",
    total: records.length,
    updated,
    created,
    warnings: [
      ...warnings,
      ...(updated || created
        ? [
            "FilamentDB takes spools one at a time: POST each entry to /api/spools, or save each as <serial>.json in its data/spools folder.",
          ]
        : []),
    ],
  };
}
