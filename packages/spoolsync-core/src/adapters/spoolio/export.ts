import type { PlannedChange } from "../../core/compare";
import { spoolstockLotNr } from "../../core/normalize";
import { systemRuntime, type AdapterRuntime } from "../shared/runtime";
import { MATERIAL_TYPES, materialNote } from "./material-notes";
import { newFilament, setField } from "./records";
import { SpoolioFilamentSchema, type SpoolioLoadResult } from "./schema";

export interface SpoolioExportResult {
  json: string;
  updated: number;
  created: number;
  total: number;
  warnings: string[];
}

/**
 * The full Spoolio export with changes applied: updated filaments, new ones, and everything else
 * from the loaded file as it was. Cross-ids are written into `spoolmanId` and `batchNumber` so the
 * next run links them directly.
 */
export function exportSpoolioJson(
  loaded: SpoolioLoadResult,
  changes: PlannedChange[],
  runtime: AdapterRuntime = systemRuntime,
): SpoolioExportResult {
  const filaments = structuredClone(loaded.file.filaments);
  const byId = new Map<string, Record<string, unknown>>();
  let unrecognized = 0;
  for (const entry of filaments) {
    if (!SpoolioFilamentSchema.safeParse(entry).success) {
      unrecognized++;
      continue;
    }
    const filament = entry as Record<string, unknown>;
    const id = String(filament["id"]);
    if (byId.has(id))
      throw new Error(
        `Cannot export Spoolio filaments with duplicate ID "${id}". Reload an inventory with unique IDs.`,
      );
    byId.set(id, filament);
  }
  let updated = 0;
  let created = 0;

  for (const change of changes) {
    if (change.source !== "spoolio") continue;
    let target: Record<string, unknown>;
    if (change.kind === "update") {
      const existing = byId.get(change.spool.sourceId);
      if (!existing)
        throw new Error(
          `Spoolio filament ${change.spool.sourceId} is missing. Reload the inventory and try again.`,
        );
      target = existing;
      for (const { field, to } of change.changes) setField(target, field, to);
      updated++;
    } else {
      target = newFilament(change.values, runtime);
      filaments.push(target);
      created++;
    }
    const links = change.kind === "create" ? { ...change.groupIds, ...change.links } : change.links;
    if (links.spoolmanId !== undefined && target["spoolmanId"] == null)
      target["spoolmanId"] = links.spoolmanId;
    if (links.spoolstockShortId && !target["batchNumber"])
      target["batchNumber"] = spoolstockLotNr(links.spoolstockShortId);
  }

  const file = { ...loaded.file, exportedAt: new Date(runtime.now()).toISOString(), filaments };
  const materials = [
    ...new Set(
      filaments.flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const material = materialNote((entry as Record<string, unknown>)["notes"]);
        return material ? [material] : [];
      }),
    ),
  ];
  return {
    json: `${JSON.stringify(file, null, 2)}\n`,
    updated,
    created,
    total: byId.size + created,
    warnings: [
      ...(unrecognized
        ? [
            `${unrecognized} unrecognized filament record${unrecognized === 1 ? " was" : "s were"} preserved unchanged and could not be synced.`,
          ]
        : []),
      ...materials.map(
        (material) =>
          `Spoolio stores ${material} as ${MATERIAL_TYPES[material!]}; the original material is preserved in notes.`,
      ),
    ],
  };
}
