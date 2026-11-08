import type { PlannedChange } from "../../core/compare";
import type { ApplyLogEntry } from "../../core/model";
import { validateTargetChanges } from "../../core/plan";
import { applyEachChange, changedFieldNames } from "../shared/apply-loop";
import type { BambuddyWriteClient } from "./client";
import { numericId } from "./map";
import { createPayload, updatePayload, type BambuddyWritePlan } from "./payload";
import type { BambuddySpool, BambuddySpoolPayload } from "./types";

/** Same value as far as Bambuddy cares: absent and empty are alike, hex case does not matter. */
const same = (a: unknown, b: unknown) =>
  String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();

/** Keeps only the fields that differ from the stored record, so an update sends what moved. */
function moved(payload: BambuddySpoolPayload, current: BambuddySpool): BambuddySpoolPayload {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => !same(value, current[key])),
  );
}

const spoolName = (spool: BambuddySpool | undefined, fallback: string) =>
  String(spool?.["color_name"] ?? spool?.["material"] ?? fallback);

/**
 * Writes planned changes to Bambuddy's inventory API. Creating posts the spool (then archives it
 * when the plan says so), updating patches only the fields that moved, and the archived flag goes
 * through the archive and restore endpoints. Each change is applied and logged on its own; when a
 * spool's fields are saved but its archive state is not, the entry says so.
 */
export async function applyToBambuddy(
  client: BambuddyWriteClient,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyLogEntry[]> {
  validateTargetChanges("bambuddy", changes);
  if (!changes.length) return [];
  const fresh = new Map<number, BambuddySpool>();
  for (const spool of await client.listSpools()) fresh.set(Number(spool.id), spool);

  // What the change being written has already done, for its failure message.
  let saved = false;
  let created = false;
  return applyEachChange(
    changes,
    {
      async write(change, note) {
        saved = false;
        created = false;
        if (change.kind === "update") {
          const id = change.spool.crossIds.bambuddyId;
          if (id === undefined || numericId(change.spool.sourceId) !== id)
            throw new Error(
              "this record came from a CSV file and has no Bambuddy ID. Load the inventory from the Bambuddy API before applying.",
            );
          const current = fresh.get(id);
          if (!current)
            throw new Error(
              `Spool ${id} no longer exists. Reload the inventory before applying this change.`,
            );
          const label = `Bambuddy spool ${id}`;
          const plan = updatePayload(change.spool, change.changes, label, current);
          const payload = moved(plan.payload, current);
          const wasArchived = Boolean(current["archived_at"]);
          if (Object.keys(payload).length) {
            await client.updateSpool(id, payload);
            saved = true;
          }
          await setArchived(client, id, wasArchived, plan);
          plan.notes.forEach(note);
          return `Updated spool ${id}: ${changedFieldNames(change).join(", ")}`;
        }
        const label = `Bambuddy ${change.values.name ?? change.groupId}`;
        const plan = createPayload(change.values, label);
        const spool = await client.createSpool(plan.payload);
        created = true;
        const id = Number(spool.id);
        await setArchived(client, id, false, plan);
        plan.notes.forEach(note);
        return `Created spool ${id} (${spoolName(spool, String(change.values.name ?? change.groupId))})`;
      },
      subject: (change) =>
        change.kind === "update" ? `spool ${change.spool.sourceId}` : "new spool",
      partialWrite: () =>
        created
          ? " The spool was created without its archived state; archive it in Bambuddy."
          : saved
            ? " Its other fields were saved."
            : "",
    },
    onProgress,
  );
}

async function setArchived(
  client: BambuddyWriteClient,
  id: number,
  wasArchived: boolean,
  plan: BambuddyWritePlan,
): Promise<void> {
  if (plan.archived === undefined || plan.archived === wasArchived) return;
  await (plan.archived ? client.archiveSpool(id) : client.restoreSpool(id));
}
