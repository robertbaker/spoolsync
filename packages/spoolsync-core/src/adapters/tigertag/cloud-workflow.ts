import type { PlannedChange } from "../../core/compare";
import type { ApplyLogEntry } from "../../core/model";
import { validateTargetChanges } from "../../core/plan";
import { applyEachChange } from "../shared/apply-loop";
import { systemRuntime, type AdapterRuntime } from "../shared/runtime";
import { structuralEqual } from "./firestore";
import type { TigertagInventoryClient } from "./inventory-client";
import { recordsToSpools } from "./map";
import { createdRecord, updatedRecords } from "./records";
import type { TigertagLoadResult, TigertagRaw } from "./schema";

export async function loadTigertagCloud(
  cloud: Pick<TigertagInventoryClient, "uid" | "listInventory">,
  runtime: AdapterRuntime = systemRuntime,
): Promise<TigertagLoadResult> {
  const records = await cloud.listInventory();
  const { spools, warnings } = recordsToSpools(records);
  return {
    source: "tigertag",
    origin: "api",
    connectionId: cloud.uid,
    spools,
    warnings,
    loadedAt: new Date(runtime.now()).toISOString(),
    // As if exported by this account, so a .ttag download restores in place too.
    file: { format: "tigertag", kind: "ttag", version: 1, exportedBy: cloud.uid, records },
  };
}

/** Keys whose value differs between two records, with `undefined` for removed keys. */
function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key.startsWith("__")) continue;
    if (!structuralEqual(before[key], after[key])) out[key] = after[key];
  }
  return out;
}

/**
 * Writes planned changes to the signed-in TigerTag inventory: only the fields that changed, both
 * documents of a twin, and a fresh `last_update`. New spools become chipless `TigerData_`
 * documents.
 */
export async function applyToTigertagCloud(
  cloud: Pick<TigertagInventoryClient, "writeDocument">,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
  runtime: AdapterRuntime = systemRuntime,
): Promise<ApplyLogEntry[]> {
  validateTargetChanges("tigertag", changes);
  // Whether the change being written has already saved one chip of a twin, for its failure message.
  let savedChip = false;
  return applyEachChange(
    changes,
    {
      async write(change) {
        savedChip = false;
        if (change.kind === "update") {
          const { records: originals } = change.spool.raw as TigertagRaw;
          const updated = updatedRecords(change);
          // A twin loads from its first chip, so that one goes last: if a write fails, the next load
          // still shows the difference and a second sync finishes the job.
          for (const [index, record] of updated.entries().toArray().reverse()) {
            const original = originals[index]!;
            const fields = changedFields(original, record);
            if (!Object.keys(fields).length) continue;
            await cloud.writeDocument(String(original["__docId"] ?? original.uid), {
              ...fields,
              last_update: runtime.now(),
            });
            savedChip = true;
          }
          const twin = updated.length > 1 ? " (both chips)" : "";
          return `Updated ${change.spool.name ?? change.spool.sourceId}${twin}`;
        }
        // One instant for the whole document, so its timestamps agree.
        const now = runtime.now();
        const record = createdRecord(change, { now: () => now, randomUUID: runtime.randomUUID });
        await cloud.writeDocument(record.uid, { ...record, last_update: now }, { create: true });
        return `Created ${record.uid}`;
      },
      subject: (change) => (change.kind === "update" ? change.spool.sourceId : "a new spool"),
      partialWrite: () => (savedChip ? " One chip was saved; sync again to finish the other." : ""),
    },
    onProgress,
  );
}
