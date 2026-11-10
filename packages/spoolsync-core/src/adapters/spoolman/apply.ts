import type { PlannedChange, PlannedCreate, PlannedUpdate } from "../../core/compare";
import type { ApplyLogEntry } from "../../core/model";
import { validateTargetChanges } from "../../core/plan";
import { applyEachChange, changedFieldNames } from "../shared/apply-loop";
import { SpoolmanError } from "./connection";
import { FilamentCatalog } from "./filament-catalog";
import { applyFilamentChanges } from "./filament-update";
import { SPOOLMAN_SPOOL_EXTRAS } from "./map";
import { isSpoolmanNg } from "./schema";
import { buildSpoolPatch, createSpoolParameters, settleRemainingWeight } from "./spool-parameters";
import type { SpoolmanWriteClient } from "./write-client";
export { defaultDensity } from "./filament-policy";
export type { ApplyLogEntry } from "../../core/model";

/**
 * Whether a failed `/info` must stop the apply. `/info` only detects Spoolman-NG, so just
 * cancellation and rejected credentials are fatal; anything else (404, 5xx, timeout, network) falls
 * back to detecting ranges from the filaments' keys.
 */
function isFatalInfoError(error: unknown): boolean {
  if ((error as { name?: string } | null)?.name === "AbortError") return true;
  return (
    error instanceof SpoolmanError &&
    (error.kind === "auth" || (error.kind === "http" && [401, 403].includes(error.status ?? 0)))
  );
}

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
  let infoNote: string | undefined;
  try {
    if (isSpoolmanNg(await client.info())) catalog.markRanges();
  } catch (error) {
    if (isFatalInfoError(error)) throw error;
    const missing =
      !(error instanceof SpoolmanError) ||
      error.kind === "parse" ||
      (error.kind === "http" && [404, 405, 501].includes(error.status ?? 0));
    if (!missing)
      infoNote = `Spoolman /info was unavailable (${(error as Error).message}); Spoolman-NG temperature ranges are only detected from existing filaments`;
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
    const { note: filamentNote, movedTo } = await applyFilamentChanges(
      change,
      current,
      patch,
      shared,
      client,
      catalog,
      note,
    );
    settleRemainingWeight(patch, current, (movedTo ?? current.filament).weight, note);

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
      write: async (change, note) => {
        written = [];
        if (infoNote) {
          note(infoNote);
          infoNote = undefined;
        }
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
