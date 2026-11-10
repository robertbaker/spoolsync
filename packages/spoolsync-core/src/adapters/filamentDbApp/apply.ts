import type { PlannedChange } from "../../core/compare";
import type { ApplyLogEntry } from "../../core/model";
import { validateTargetChanges } from "../../core/plan";
import { applyEachChange, changedFieldNames } from "../shared/apply-loop";
import type { FilamentDbAppClient } from "./client";
import { parseFilamentDbApp } from "./load";
import { idOf } from "./map";
import { changePatches, remainingToWrite } from "./records";
import { findSpoolTarget, newSpoolFields } from "./target";

/** Operations required by the write workflow, without HTTP client internals. */
export interface FilamentDbAppWriteClient extends Pick<
  FilamentDbAppClient,
  "snapshot" | "locationIds" | "updateFilament" | "updateSpool" | "createSpool"
> {}

type Bag = Record<string, unknown>;
type UpdateChange = Extract<PlannedChange, { kind: "update" }>;

const rawOf = (change: UpdateChange) =>
  change.spool.raw as { filamentId?: unknown; legacyRoll?: unknown } | null;

/** Whether a spool is still in a live filament of the freshly read snapshot. */
function spoolStillExists(filaments: readonly Bag[], filamentId: string, change: UpdateChange) {
  const filament = filaments.find((entry) => idOf(entry["_id"]) === filamentId);
  if (!filament || filament["_deletedAt"] || filament["_purged"] === true) return false;
  if (rawOf(change)?.legacyRoll === true) return true;
  const spools = Array.isArray(filament["spools"]) ? (filament["spools"] as Bag[]) : [];
  return spools.some(
    (spool) =>
      idOf(spool["_id"]) === change.spool.sourceId || spool["instanceId"] === change.spool.sourceId,
  );
}

/**
 * Filament fields are shared by every spool of a filament, so two planned updates of one filament
 * must agree on each field. Returns, per change, the shared fields the other updates contradict.
 */
function sharedConflicts(
  changes: readonly UpdateChange[],
  filamentPatch: (change: UpdateChange) => Bag,
): Map<UpdateChange, string> {
  const byFilament = new Map<string, UpdateChange[]>();
  for (const change of changes) {
    const raw = rawOf(change);
    if (raw?.legacyRoll === true || typeof raw?.filamentId !== "string") continue;
    byFilament.set(raw.filamentId, [...(byFilament.get(raw.filamentId) ?? []), change]);
  }
  const conflicts = new Map<UpdateChange, string>();
  for (const [filamentId, group] of byFilament) {
    if (group.length < 2) continue;
    const seen = new Map<string, Set<string>>();
    for (const change of group)
      for (const [key, value] of Object.entries(filamentPatch(change)))
        seen.set(key, (seen.get(key) ?? new Set()).add(JSON.stringify(value)));
    const disagree = [...seen].filter(([, values]) => values.size > 1).map(([key]) => key);
    if (!disagree.length) continue;
    for (const change of group)
      if (Object.keys(filamentPatch(change)).some((key) => disagree.includes(key)))
        conflicts.set(
          change,
          `Filament ${filamentId} is shared by several spools in this plan that want different ${disagree.join(", ")}. Change those fields on one spool, or apply the spools separately.`,
        );
  }
  return conflicts;
}

/**
 * Writes planned changes to Filament DB. An update sends the filament fields first (the spool's
 * remaining weight is converted with the filament's empty-spool weight, so that must land first),
 * then the spool's own fields. A new spool is added to the one existing non-template filament that
 * matches it; filaments themselves are never created. Each change is applied and logged on its own.
 * Filament fields are shared, so updates of one filament that disagree are refused and ones that
 * agree write the filament once. The snapshot is read again first, so a spool deleted since the
 * inventory loaded is reported instead of written.
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
  const filaments = parseFilamentDbApp(await client.snapshot()).filaments;
  const fail = (message: string) => {
    throw new Error(message);
  };
  const updates = changes.filter((change): change is UpdateChange => change.kind === "update");
  const patchOf = (change: UpdateChange) =>
    changePatches(change, {
      locationIdByName: locations,
      legacyRoll: rawOf(change)?.legacyRoll === true,
      problem: () => {},
    });
  const conflicts = sharedConflicts(updates, (change) => ({ ...patchOf(change).filament }));
  /** Filament fields already written this run, by filament, with the value sent. */
  const written = new Map<string, Map<string, string>>();
  let filamentWritten = false;

  return applyEachChange(
    changes,
    {
      async write(change, note) {
        filamentWritten = false;
        if (change.kind === "create") {
          const target = findSpoolTarget(filaments, change.values);
          await client.createSpool(
            target.id,
            newSpoolFields(change.values, target.tare, locations, fail, note),
          );
          return `Added a spool to filament ${target.id} (${change.values.name ?? change.groupId})`;
        }
        const raw = rawOf(change);
        const filamentId = raw?.filamentId;
        const legacyRoll = raw?.legacyRoll === true;
        if (typeof filamentId !== "string")
          throw new Error("The spool has no filament id. Reload the inventory and try again.");
        const conflict = conflicts.get(change);
        if (conflict) throw new Error(conflict);
        if (!spoolStillExists(filaments, filamentId, change))
          throw new Error(
            `Spool ${change.spool.sourceId} no longer exists. Reload the inventory before applying this change.`,
          );
        const patches = changePatches(change, {
          locationIdByName: locations,
          legacyRoll,
          problem: fail,
          warn: note,
        });
        // A legacy roll's own weight is not shared with other spools.
        const shared = Object.keys(patches.filament).some((key) => key !== "totalWeight");
        // Fields another spool of this filament already wrote with the same value are not resent.
        const done = written.get(filamentId) ?? new Map<string, string>();
        const filamentPatch = Object.fromEntries(
          Object.entries(patches.filament).filter(
            ([key, value]) => legacyRoll || done.get(key) !== JSON.stringify(value),
          ),
        );
        if (Object.keys(filamentPatch).length) {
          await client.updateFilament(filamentId, filamentPatch);
          filamentWritten = true;
          if (!legacyRoll) {
            for (const [key, value] of Object.entries(filamentPatch))
              done.set(key, JSON.stringify(value));
            written.set(filamentId, done);
          }
        }
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
      partialWrite: () =>
        filamentWritten
          ? " The filament fields were already saved; the spool fields were not."
          : "",
    },
    onProgress,
  );
}
