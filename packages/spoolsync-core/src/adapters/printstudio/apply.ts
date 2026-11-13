import type { PlannedChange } from "../../core/compare";
import type { ApplyLogEntry } from "../../core/model";
import { validateTargetChanges } from "../../core/plan";
import { applyEachChange, changedFieldNames } from "../shared/apply-loop";
import type { PrintStudioWriteClient } from "./client";
import { createPayload, updatePlan } from "./payload";
import type { PrintStudioLot } from "./types";

const STOCK_REASON = "Synced by SpoolSync";

/**
 * Writes planned changes to PrintStudio. Creating posts a new local lot. Updating only touches lots
 * whose source system is `local`: lots PrintStudio imported from Spoolman, Spoolstock or InvenTree
 * are owned by that sync and are refused. Details go through `PUT /api/materials/{id}`, the
 * quantity through adjust-stock, so the stock history records the change.
 */
export async function applyToPrintStudio(
  client: PrintStudioWriteClient,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyLogEntry[]> {
  validateTargetChanges("printstudio", changes);
  if (!changes.length) return [];
  const fresh = new Map<string, PrintStudioLot>();
  for (const lot of await client.listLots()) fresh.set(lot.id, lot);

  let saved = false;
  return applyEachChange(
    changes,
    {
      async write(change, note) {
        saved = false;
        if (change.kind === "create") {
          const label = `PrintStudio ${change.values.name ?? change.groupId}`;
          const plan = createPayload(change.values, label);
          const lot = await client.createLot(plan.payload);
          plan.notes.forEach(note);
          return `Created local lot ${lot.id} (${String(lot["label"] ?? change.values.name ?? change.groupId)})`;
        }
        const id = change.spool.sourceId;
        const current = fresh.get(id);
        if (!current)
          throw new Error(
            `Lot ${id} no longer exists. Reload the inventory before applying this change.`,
          );
        if (current.sourceSystem !== "local")
          throw new Error(
            `lot ${id} is managed by PrintStudio's ${String(current.sourceSystem ?? "unknown")} sync, which would overwrite an edit. Change it in ${String(current.sourceSystem ?? "its source")} instead; SpoolSync only edits lots created in PrintStudio.`,
          );
        const label = `PrintStudio lot ${id}`;
        const plan = updatePlan(current, change.changes, label);
        if (plan.put) {
          await client.updateLot(id, plan.put);
          saved = true;
        }
        if (plan.clear.length) await client.clearDetails(id, plan.clear);
        const onHand = Number(current["quantityOnHand"]);
        if (plan.quantity !== undefined && plan.quantity !== onHand) {
          await client.adjustStock(id, plan.quantity - onHand, STOCK_REASON);
          saved = true;
        }
        plan.notes.forEach(note);
        return `Updated lot ${id}: ${changedFieldNames(change).join(", ")}`;
      },
      subject: (change) => (change.kind === "update" ? `lot ${change.spool.sourceId}` : "new lot"),
      partialWrite: () => (saved ? " Its other fields were saved." : ""),
    },
    onProgress,
  );
}
