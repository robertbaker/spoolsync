import {
  FIELD_LABELS,
  type PlannedChange,
  type PlannedCreate,
  type PlannedUpdate,
} from "../../core/compare";
import type { ApplyLogEntry } from "../../core/model";
import { validateTargetChanges } from "../../core/plan";
import { FilamentCatalog } from "./filament-catalog";
import { applyFilamentChanges } from "./filament-update";
import { SPOOLMAN_SPOOL_EXTRAS } from "./map";
import { buildSpoolPatch, createSpoolParameters } from "./spool-parameters";
import type { SpoolmanWriteClient } from "./write-client";
export { defaultDensity } from "./filament-policy";
export type { ApplyLogEntry } from "../../core/model";

/**
 * Writes planned changes to Spoolman. Each change is applied on its own and logged, so one failure
 * does not stop the rest.
 *
 * Filament fields (brand, material, colour…) live on the Spoolman filament, which other spools may
 * share. A filament used only by this spool is edited in place; a shared one is left alone and the
 * spool is moved to a matching filament, created if none exists.
 */
export async function applyToSpoolman(
  client: SpoolmanWriteClient,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyLogEntry[]> {
  validateTargetChanges("spoolman", changes);
  const log: ApplyLogEntry[] = [];
  if (!changes.length) return log;

  await client.ensureExtraFields("spool", SPOOLMAN_SPOOL_EXTRAS);
  const [vendors, filaments, spools] = await Promise.all([
    client.listVendors(),
    client.listFilaments(),
    client.listSpools({ allowArchived: true }),
  ]);
  const catalog = new FilamentCatalog(client, vendors, filaments);
  const spoolsByFilament = new Map<number, number>();
  for (const spool of spools)
    spoolsByFilament.set(spool.filament.id, (spoolsByFilament.get(spool.filament.id) ?? 0) + 1);
  const freshSpools = new Map(spools.map((spool) => [spool.id, spool]));

  async function applyUpdate(change: PlannedUpdate): Promise<string> {
    const id = Number(change.spool.sourceId);
    const current = freshSpools.get(id);
    if (!current)
      throw new Error(
        `Spool #${id} no longer exists. Reload the inventory before applying this change.`,
      );
    const patch = buildSpoolPatch(change, current);
    const shared = (spoolsByFilament.get(current.filament.id) ?? 1) > 1;
    const filamentNote = await applyFilamentChanges(
      change,
      current,
      patch,
      shared,
      client,
      catalog,
    );

    if (Object.keys(patch).length) {
      const updated = await client.updateSpool(id, patch);
      // Only a successful move changes which filaments are safe to edit in place.
      if (updated.filament.id !== current.filament.id) {
        spoolsByFilament.set(
          current.filament.id,
          (spoolsByFilament.get(current.filament.id) ?? 1) - 1,
        );
        spoolsByFilament.set(
          updated.filament.id,
          (spoolsByFilament.get(updated.filament.id) ?? 0) + 1,
        );
      }
      freshSpools.set(id, updated);
    }
    const fields = change.changes.map((c) => FIELD_LABELS[c.field].toLowerCase());
    const linked = Object.keys(change.links).length ? "linked IDs" : "";
    return `Updated spool #${id}: ${[...fields, linked].filter(Boolean).join(", ")}${filamentNote}`;
  }

  async function applyCreate(change: PlannedCreate): Promise<string> {
    const { values } = change;
    const filament = await catalog.filamentFor(values);
    const created = await client.createSpool(createSpoolParameters(change, filament.id));
    spoolsByFilament.set(filament.id, (spoolsByFilament.get(filament.id) ?? 0) + 1);
    const label = [values.vendor, values.material, values.name].filter(Boolean).join(" ");
    return `Created spool #${created.id}${label ? ` (${label})` : ""}`;
  }

  let done = 0;
  for (const change of changes) {
    try {
      const message =
        change.kind === "update" ? await applyUpdate(change) : await applyCreate(change);
      log.push({ groupId: change.groupId, ok: true, message });
    } catch (error) {
      const what = change.kind === "update" ? `spool #${change.spool.sourceId}` : "new spool";
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
