import type { PlannedChange } from "../../core/compare";
import type { ApplyLogEntry } from "../../core/model";
import { validateTargetChanges } from "../../core/plan";
import { applyEachChange, changedFieldNames } from "../shared/apply-loop";
import type { FilamentDbClient } from "./client";
import { createRecord, updateRecord } from "./records";

/** Operations required by the write workflow, without HTTP client internals. */
export interface FilamentDbWriteClient extends Pick<FilamentDbClient, "listSpools" | "saveSpool"> {}

/**
 * Writes planned changes to FilamentDB. A POST replaces a whole spool, so each update starts from a
 * freshly fetched copy. Each change is applied and logged on its own.
 */
export async function applyToFilamentDb(
  client: FilamentDbWriteClient,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyLogEntry[]> {
  validateTargetChanges("filamentdb", changes);
  if (!changes.length) return [];
  const fresh = new Map<string, Record<string, unknown>>();
  for (const spool of await client.listSpools())
    if (
      spool &&
      typeof spool === "object" &&
      typeof (spool as { serial?: unknown }).serial === "string"
    )
      fresh.set((spool as { serial: string }).serial, spool as Record<string, unknown>);

  return applyEachChange(
    changes,
    {
      async write(change, note) {
        if (change.kind === "update") {
          const record = fresh.get(change.spool.sourceId);
          if (!record)
            throw new Error(
              `Spool ${change.spool.sourceId} no longer exists. Reload the inventory before applying this change.`,
            );
          updateRecord(record, change, note);
          await client.saveSpool(record);
          return `Updated spool ${change.spool.sourceId}: ${changedFieldNames(change).join(", ")}`;
        }
        const record = createRecord(change.values, "FilamentDB", note);
        await client.saveSpool(record);
        return `Created spool ${record["serial"]}`;
      },
      subject: (change) =>
        change.kind === "update" ? `spool ${change.spool.sourceId}` : "new spool",
    },
    onProgress,
  );
}
