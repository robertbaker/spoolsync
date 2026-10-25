import { FIELD_LABELS, type PlannedChange } from "../../core/compare";
import type { ApplyLogEntry } from "../../core/model";
import { validateTargetChanges } from "../../core/plan";
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
  const log: ApplyLogEntry[] = [];
  if (!changes.length) return log;
  const fresh = new Map<string, Record<string, unknown>>();
  for (const spool of await client.listSpools())
    if (
      spool &&
      typeof spool === "object" &&
      typeof (spool as { serial?: unknown }).serial === "string"
    )
      fresh.set((spool as { serial: string }).serial, spool as Record<string, unknown>);

  let done = 0;
  for (const change of changes) {
    const noop = () => {};
    try {
      let message: string;
      if (change.kind === "update") {
        const record = fresh.get(change.spool.sourceId);
        if (!record)
          throw new Error(
            `Spool ${change.spool.sourceId} no longer exists. Reload the inventory before applying this change.`,
          );
        updateRecord(record, change, noop);
        await client.saveSpool(record);
        message = `Updated spool ${change.spool.sourceId}: ${change.changes.map((c) => FIELD_LABELS[c.field].toLowerCase()).join(", ")}`;
      } else {
        const record = createRecord(change.values, "FilamentDB", noop);
        await client.saveSpool(record);
        message = `Created spool ${record["serial"]}`;
      }
      log.push({ groupId: change.groupId, ok: true, message });
    } catch (error) {
      const what = change.kind === "update" ? `spool ${change.spool.sourceId}` : "new spool";
      log.push({
        groupId: change.groupId,
        ok: false,
        message: `Failed on ${what}: ${(error as Error).message}`,
      });
    }
    onProgress?.(++done, changes.length);
  }
  return log;
}
