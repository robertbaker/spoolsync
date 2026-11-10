import type { PlannedChange, PlannedCreate, PlannedUpdate } from "../../core/compare";
import type { ApplyLogEntry } from "../../core/model";
import { validateTargetChanges } from "../../core/plan";
import { applyEachChange, changedFieldNames } from "../shared/apply-loop";
import { FilamentCatalog } from "./filament-catalog";
import { applyFilamentChanges } from "./filament-update";
import { SPOOLMAN_SPOOL_EXTRAS } from "./map";
import { isSpoolmanNg } from "./schema";
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
  rawClient: SpoolmanWriteClient,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyLogEntry[]> {
  validateTargetChanges("spoolman", changes);
  if (!changes.length) return [];

  // What the current change has already written to Spoolman, for reporting a later failure.
  let written: string[] = [];
  const client: SpoolmanWriteClient = Object.create(rawClient, {
    createVendor: {
      value: async (...args: Parameters<SpoolmanWriteClient["createVendor"]>) => {
        const vendor = await rawClient.createVendor(...args);
        written.push(`created vendor #${vendor.id}`);
        return vendor;
      },
    },
    createFilament: {
      value: async (...args: Parameters<SpoolmanWriteClient["createFilament"]>) => {
        const filament = await rawClient.createFilament(...args);
        written.push(`created filament #${filament.id}`);
        return filament;
      },
    },
    updateFilament: {
      value: async (...args: Parameters<SpoolmanWriteClient["updateFilament"]>) => {
        const filament = await rawClient.updateFilament(...args);
        written.push(`updated filament #${filament.id}`);
        return filament;
      },
    },
  });

  await client.ensureExtraFields("spool", SPOOLMAN_SPOOL_EXTRAS);
  const [vendors, filaments, spools] = await Promise.all([
    client.listVendors(),
    client.listFilaments(),
    client.listSpools({ allowArchived: true }),
  ]);
  const catalog = new FilamentCatalog(client, vendors, filaments);
  // Spoolman-NG leaves unset fields out of responses, so ranges may not show on any filament.
  // Older servers or test doubles without a usable /info simply stay on the key-based detection.
  try {
    if (isSpoolmanNg(await client.info())) catalog.markRanges();
  } catch {
    /* fall back to detecting ranges from the filaments themselves */
  }
  const spoolsByFilament = new Map<number, number>();
  for (const spool of spools)
    spoolsByFilament.set(spool.filament.id, (spoolsByFilament.get(spool.filament.id) ?? 0) + 1);
  const freshSpools = new Map(spools.map((spool) => [spool.id, spool]));

  async function applyUpdate(change: PlannedUpdate, note: (text: string) => void): Promise<string> {
    const id = Number(change.spool.sourceId);
    const current = freshSpools.get(id);
    if (!current)
      throw new Error(
        `Spool #${id} no longer exists. Reload the inventory before applying this change.`,
      );
    const patch = buildSpoolPatch(change, current, note);
    const shared = (spoolsByFilament.get(current.filament.id) ?? 1) > 1;
    const filamentNote = await applyFilamentChanges(
      change,
      current,
      patch,
      shared,
      client,
      catalog,
      note,
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
    const fields = changedFieldNames(change);
    const linked = Object.keys(change.links).length ? "linked IDs" : "";
    return `Updated spool #${id}: ${[...fields, linked].filter(Boolean).join(", ")}${filamentNote}`;
  }

  async function applyCreate(change: PlannedCreate, note: (text: string) => void): Promise<string> {
    const { values } = change;
    const filament = await catalog.filamentFor(values, undefined, undefined, note);
    const { params, remainingDropped } = createSpoolParameters(change, filament, note);
    if (remainingDropped)
      note("remaining weight not set: Spoolman needs an initial weight or a filament weight");
    const created = await client.createSpool(params);
    spoolsByFilament.set(filament.id, (spoolsByFilament.get(filament.id) ?? 0) + 1);
    const label = [values.vendor, values.material, values.name].filter(Boolean).join(" ");
    return `Created spool #${created.id}${label ? ` (${label})` : ""}`;
  }

  return applyEachChange(
    changes,
    {
      write: (change, note) => {
        written = [];
        return change.kind === "update" ? applyUpdate(change, note) : applyCreate(change, note);
      },
      subject: (change) =>
        change.kind === "update" ? `spool #${change.spool.sourceId}` : "new spool",
      partialWrite: () =>
        written.length
          ? ` Already written to Spoolman: ${written.join(", ")}; the spool itself was not saved. Sync again to finish.`
          : "",
    },
    onProgress,
  );
}
