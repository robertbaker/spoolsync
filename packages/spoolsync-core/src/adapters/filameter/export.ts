import type { PlannedChange } from "../../core/compare";
import { systemRuntime, type AdapterRuntime } from "../shared/runtime";
import { csvText } from "../shared/tabular";
import { isFilament, mapDoc } from "./map";
import { createDoc, updateDoc } from "./records";
import type { FilameterBackup, FilameterDoc, FilameterLoadResult } from "./types";

export function exportFilameter(
  loaded: FilameterLoadResult,
  changes: PlannedChange[],
  runtime: AdapterRuntime = systemRuntime,
) {
  const warnings: string[] = [];
  const isBackup = !Array.isArray(loaded.file);
  const regular = isBackup
    ? [...(loaded.file as FilameterBackup).regular]
    : [...(loaded.file as FilameterDoc[])];
  const filamentDocs = regular.filter(isFilament);
  const byId = new Map(filamentDocs.map((doc, index) => [mapDoc(doc, index).sourceId, doc]));
  if (byId.size !== filamentDocs.length)
    throw new Error(
      "Cannot export FilaMeter spools with duplicate IDs. Give each spool a unique ID and reload the file.",
    );
  let updated = 0,
    created = 0;
  for (const change of changes) {
    if (change.source !== "filameter") continue;
    let doc: FilameterDoc;
    if (change.kind === "update") {
      const existing = byId.get(change.spool.sourceId);
      if (!existing)
        throw new Error(
          `FilaMeter spool ${change.spool.sourceId} is missing. Reload the inventory and try again.`,
        );
      doc = updateDoc(existing, change, warnings);
      updated++;
    } else {
      doc = createDoc(change, warnings, runtime);
      regular.push(doc);
      created++;
    }
    if (change.kind === "update") {
      const index = regular.indexOf(byId.get(change.spool.sourceId)!);
      if (index >= 0) regular[index] = doc;
    }
  }
  const jsonValue = isBackup
    ? { ...(loaded.file as FilameterBackup), regular }
    : { regular, local: [] };
  const csv = csvText(
    regular.filter(isFilament).map((doc) => ({
      brand: doc.brand,
      filament: doc.filament,
      material: doc.material,
      color: doc.color,
      used_weight: doc.used_weight,
      total_weight: doc.total_weight,
      price: doc.price,
      location: doc.location,
      comments: doc.comments,
    })),
    [
      "brand",
      "filament",
      "material",
      "color",
      "used_weight",
      "total_weight",
      "price",
      "location",
      "comments",
    ],
  );
  return {
    json: JSON.stringify(jsonValue, null, 2) + "\n",
    csv,
    total: regular.filter(isFilament).length,
    updated,
    created,
    warnings,
  };
}
