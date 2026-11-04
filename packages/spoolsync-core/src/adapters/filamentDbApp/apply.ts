import { FIELD_LABELS, type PlannedChange } from "../../core/compare";
import type { ApplyLogEntry } from "../../core/model";
import { validateTargetChanges } from "../../core/plan";
import type { FilamentDbAppClient } from "./client";
import { parseFilamentDbApp } from "./load";
import { changePatches } from "./records";
import { findSpoolTarget, newSpoolFields } from "./target";

/** Operations required by the write workflow, without HTTP client internals. */
export interface FilamentDbAppWriteClient extends Pick<
  FilamentDbAppClient,
  "snapshot" | "locationIds" | "updateFilament" | "updateSpool" | "createSpool"
> {}

/**
 * Writes planned changes to Filament DB. An update sends the filament fields first (the spool's
 * remaining weight is converted with the filament's empty-spool weight, so that must land first),
 * then the spool's own fields. A new spool is added to the one existing non-template filament that
 * matches it; filaments themselves are never created. Each change is applied and logged on its
 * own.
 */
export async function applyToFilamentDbApp(
  client: FilamentDbAppWriteClient,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyLogEntry[]> {
  validateTargetChanges("filamentDbApp", changes);
  const log: ApplyLogEntry[] = [];
  if (!changes.length) return log;
  const needsLocations = changes.some((change) =>
    change.kind === "create"
      ? change.values.location !== null
      : change.changes.some((c) => c.field === "location"),
  );
  const locations = needsLocations ? await client.locationIds() : new Map<string, string>();
  const filaments = changes.some((change) => change.kind === "create")
    ? parseFilamentDbApp(await client.snapshot()).filaments
    : [];
  const fail = (message: string) => {
    throw new Error(message);
  };

  let done = 0;
  for (const change of changes) {
    try {
      let message: string;
      if (change.kind === "create") {
        const target = findSpoolTarget(filaments, change.values);
        await client.createSpool(
          target.id,
          newSpoolFields(change.values, target.tare, locations, fail),
        );
        message = `Added a spool to filament ${target.id} (${change.values.name ?? change.groupId})`;
      } else {
        const raw = change.spool.raw as { filamentId?: unknown; legacyRoll?: unknown } | null;
        const filamentId = raw?.filamentId;
        if (raw?.legacyRoll === true)
          throw new Error(
            "This roll is stored on the filament itself, with no spool record to update. Open it in Filament DB and add a spool.",
          );
        if (typeof filamentId !== "string")
          throw new Error("The spool has no filament id. Reload the inventory and try again.");
        const patches = changePatches(change, { locationIdByName: locations, problem: fail });
        const shared = Object.keys(patches.filament).length > 0;
        if (shared) await client.updateFilament(filamentId, patches.filament);
        if (Object.keys(patches.spool).length)
          await client.updateSpool(filamentId, change.spool.sourceId, patches.spool);
        message = `Updated spool ${change.spool.sourceId}: ${change.changes.map((c) => FIELD_LABELS[c.field].toLowerCase()).join(", ")}${shared ? " (filament fields are shared by all its spools)" : ""}`;
      }
      log.push({ groupId: change.groupId, ok: true, message });
    } catch (error) {
      log.push({
        groupId: change.groupId,
        ok: false,
        message: `Failed on ${change.kind === "update" ? `spool ${change.spool.sourceId}` : "new spool"}: ${(error as Error).message}`,
      });
    }
    onProgress?.(++done, changes.length);
  }
  return log;
}
