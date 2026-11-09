import type { PlannedChange } from "../../core/compare";
import type { ApplyLogEntry } from "../../core/model";
import { validateTargetChanges } from "../../core/plan";
import { applyEachChange, changedFieldNames } from "../shared/apply-loop";
import type { FilamentDbAppClient } from "./client";
import { parseFilamentDbApp } from "./load";
import { changePatches, remainingToWrite } from "./records";
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
  if (!changes.length) return [];
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

  return applyEachChange(
    changes,
    {
      async write(change) {
        if (change.kind === "create") {
          const target = findSpoolTarget(filaments, change.values);
          await client.createSpool(
            target.id,
            newSpoolFields(change.values, target.tare, locations, fail),
          );
          return `Added a spool to filament ${target.id} (${change.values.name ?? change.groupId})`;
        }
        const raw = change.spool.raw as { filamentId?: unknown; legacyRoll?: unknown } | null;
        const filamentId = raw?.filamentId;
        const legacyRoll = raw?.legacyRoll === true;
        if (typeof filamentId !== "string")
          throw new Error("The spool has no filament id. Reload the inventory and try again.");
        const patches = changePatches(change, {
          locationIdByName: locations,
          legacyRoll,
          problem: fail,
        });
        // A legacy roll's own weight is not shared with other spools.
        const shared = Object.keys(patches.filament).some((key) => key !== "totalWeight");
        if (Object.keys(patches.filament).length)
          await client.updateFilament(filamentId, patches.filament);
        // Sent after the filament, because the server converts this with the new empty weight.
        const remainingWeight = legacyRoll ? undefined : remainingToWrite(change, patches);
        const spoolPatch =
          remainingWeight === undefined ? patches.spool : { ...patches.spool, remainingWeight };
        if (Object.keys(spoolPatch).length)
          await client.updateSpool(filamentId, change.spool.sourceId, spoolPatch);
        return `Updated spool ${change.spool.sourceId}: ${changedFieldNames(change).join(", ")}${shared ? " (filament fields are shared by all its spools)" : ""}`;
      },
      subject: (change) =>
        change.kind === "update" ? `spool ${change.spool.sourceId}` : "new spool",
    },
    onProgress,
  );
}
