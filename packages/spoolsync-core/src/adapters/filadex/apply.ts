import { FIELD_LABELS, type PlannedChange } from "../../core/compare";
import type { ApplyLogEntry } from "../../core/model";
import { validateTargetChanges } from "../../core/plan";
import type { FiladexClient } from "./client";
import { createRecord, updateRecord } from "./records";

/** Remote operations required by the write workflow, without login or transport internals. */
export interface FiladexWriteClient extends Pick<
  FiladexClient,
  "listFilaments" | "createFilament" | "updateFilament"
> {}

/** Columns Filadex stores as nullable; an emptied value is sent as null, not an empty string. */
const NULLABLE = new Set([
  "manufacturer",
  "colorCode",
  "diameter",
  "purchaseDate",
  "purchasePrice",
  "status",
  "spoolType",
  "lastDryingDate",
  "storageLocation",
  "barcode",
]);

const WRITABLE = [
  "name",
  "manufacturer",
  "material",
  "colorName",
  "colorCode",
  "printTemp",
  "diameter",
  "totalWeight",
  "remainingPercentage",
  "purchaseDate",
  "purchasePrice",
  "status",
  "spoolType",
  "dryerCount",
  "lastDryingDate",
  "storageLocation",
  "barcode",
] as const;

function payload(record: Record<string, unknown>, only?: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of WRITABLE) {
    if (only && !only.has(key)) continue;
    const value = record[key];
    if (value === undefined) continue;
    if (value === "" || value === null) {
      if (NULLABLE.has(key) && only) out[key] = null;
      else if (!NULLABLE.has(key) && only) out[key] = "";
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Writes planned changes to Filadex. Updates send only the fields that moved; each change is
 * applied and logged on its own.
 */
export async function applyToFiladex(
  client: FiladexWriteClient,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyLogEntry[]> {
  validateTargetChanges("filadex", changes);
  const log: ApplyLogEntry[] = [];
  if (!changes.length) return log;
  const fresh = new Map<string, Record<string, unknown>>();
  const names = new Set<string>();
  for (const entry of await client.listFilaments()) {
    const record = entry as Record<string, unknown>;
    fresh.set(String(record["id"]), record);
    names.add(String(record["name"] ?? "").toLowerCase());
  }

  let done = 0;
  const noop = () => {};
  for (const change of changes) {
    try {
      let message: string;
      if (change.kind === "update") {
        const current = fresh.get(change.spool.sourceId);
        if (!current)
          throw new Error(
            `Filament ${change.spool.sourceId} no longer exists. Reload the inventory before applying this change.`,
          );
        const next = { ...current };
        updateRecord(next, change, noop);
        const moved = new Set(
          WRITABLE.filter((key) => String(next[key] ?? "") !== String(current[key] ?? "")),
        );
        if (moved.size) await client.updateFilament(change.spool.sourceId, payload(next, moved));
        message = `Updated filament ${change.spool.sourceId}: ${change.changes.map((c) => FIELD_LABELS[c.field].toLowerCase()).join(", ")}`;
      } else {
        const record = createRecord(change.values, change.groupId, names, noop);
        const created = (await client.createFilament(payload(record))) as { id?: unknown };
        message = `Created filament${created?.id != null ? ` ${created.id}` : ""} (${record["name"]})`;
      }
      log.push({ groupId: change.groupId, ok: true, message });
    } catch (error) {
      const what = change.kind === "update" ? `filament ${change.spool.sourceId}` : "new filament";
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
