import type { PlannedChange } from "../../core/compare";
import { systemRuntime, type AdapterRuntime } from "../shared/runtime";
import { buildSpoolZip, spoolFileName } from "./files";
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
  const fileNameBefore = new Map(records.map((record) => [record, spoolFileName(record)]));
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
  const renamed = records.filter(
    (record) => fileNameBefore.has(record) && fileNameBefore.get(record) !== spoolFileName(record),
  );
  const missingType = records.filter((record) => !record["type"]);
  const { zip, collisions } = buildSpoolZip(records, new Date(runtime.now()));
  if (renamed.length)
    warnings.push(
      `${renamed.length} spool${renamed.length === 1 ? "" : "s"} changed type, brand, or color, so ${renamed.length === 1 ? "its" : "their"} file name changed. /api/spools/import does not remove the old file, so delete it in FilamentDB or POST the JSON instead.`,
    );
  if (missingType.length)
    warnings.push(
      `${missingType.length} spool${missingType.length === 1 ? " has" : "s have"} no type, which /api/spools/import rejects.`,
    );
  if (collisions.length)
    warnings.push(
      `Spools share the file name ${[...new Set(collisions)].join(", ")}; only the last one survives an import. Give each spool a distinct serial.`,
    );
  return {
    json: JSON.stringify(records, null, 2) + "\n",
    zip,
    total: records.length,
    updated,
    created,
    warnings: [
      ...warnings,
      ...(updated || created
        ? [
            "Send the ZIP to FilamentDB's /api/spools/import (spools with the same serial are replaced), or POST each JSON entry to /api/spools.",
          ]
        : []),
    ],
  };
}
