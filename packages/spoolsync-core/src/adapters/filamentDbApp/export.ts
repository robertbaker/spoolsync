import type { PlannedChange } from "../../core/compare";
import { systemRuntime, type AdapterRuntime } from "../shared/runtime";
import { idOf, isLegacyRoll, legacySpoolId } from "./map";
import { changePatches, patchSnapshotFilament, patchSnapshotSpool } from "./records";
import { findSpoolTarget, newSpoolFields } from "./target";
import type { FilamentDbAppLoadResult } from "./types";

type Bag = Record<string, unknown>;

/**
 * Writes the planned spool changes into a copy of the loaded document, so a snapshot keeps its
 * trash, locations and every other collection untouched. A new spool goes onto the one matching
 * non-template filament; Filament DB filaments are never created or edited here.
 */
export function exportFilamentDbApp(
  loaded: FilamentDbAppLoadResult,
  changes: PlannedChange[],
  runtime: AdapterRuntime = systemRuntime,
) {
  const warnings: string[] = [];
  if (!loaded.file.document)
    throw new Error(
      "A Filament DB spool CSV cannot be updated. Load a snapshot JSON, or use --filament-db-url with --apply.",
    );
  const document = structuredClone(loaded.file.document) as unknown;
  const filaments = Array.isArray(document)
    ? document
    : (((document as Bag).collections as Bag | undefined)?.["filaments"] ??
      (document as Bag)["filaments"]);
  if (!Array.isArray(filaments)) throw new Error("The loaded Filament DB file has no filaments.");

  const spools = new Map<string, Bag>();
  const filamentOf = new Map<Bag, string | null>();
  const legacyRolls = new Map<string, Bag>();
  const templates = new Set(
    (filaments as Bag[]).map((filament) => idOf(filament["parentId"])).filter((id) => id !== null),
  );
  for (const filament of filaments as Bag[]) {
    const filamentId = idOf(filament["_id"]);
    if (filamentId && !filament["_deletedAt"] && isLegacyRoll(filament, templates.has(filamentId)))
      legacyRolls.set(legacySpoolId(filamentId), filament);
  }
  for (const filament of filaments as Bag[])
    if (Array.isArray(filament["spools"]))
      for (const spool of filament["spools"] as Bag[]) {
        filamentOf.set(spool, idOf(filament["_id"]));
        const id =
          idOf(spool["_id"]) ??
          (typeof spool["instanceId"] === "string" ? spool["instanceId"] : null);
        if (id) spools.set(id, spool);
      }
  const locationIds = new Map(
    Object.entries(loaded.file.locations).map(([id, name]) => [name.toLowerCase(), id] as const),
  );
  const problem = (message: string) => warnings.push(message);

  let updated = 0;
  let created = 0;
  for (const change of changes) {
    if (change.source !== "filamentDbApp") continue;
    if (change.kind === "create") {
      const target = findSpoolTarget(filaments as Bag[], change.values);
      const host = (filaments as Bag[]).find((filament) => idOf(filament["_id"]) === target.id)!;
      const ids = runtime.randomUUID().replaceAll("-", "");
      const fields = newSpoolFields(change.values, target.tare, locationIds, problem);
      const spool: Bag = {
        _id: ids.slice(0, 24),
        instanceId: ids.slice(22, 32),
        label: "",
        totalWeight: null,
        lotNumber: null,
        purchaseDate: null,
        openedDate: null,
        createdAt: new Date(runtime.now()).toISOString(),
        locationId: null,
        photoDataUrl: null,
        retired: false,
        dryCycles: [],
        usageHistory: [],
        ...fields,
      };
      if (!Array.isArray(host["spools"])) host["spools"] = [];
      (host["spools"] as Bag[]).push(spool);
      spools.set(String(spool["_id"]), spool);
      created++;
      continue;
    }
    const legacyHost = legacyRolls.get(change.spool.sourceId);
    if (legacyHost) {
      const patches = changePatches(change, {
        locationIdByName: locationIds,
        legacyRoll: true,
        problem,
      });
      patchSnapshotFilament(legacyHost, patches.filament);
      updated++;
      continue;
    }
    const spool = spools.get(change.spool.sourceId);
    if (!spool)
      throw new Error(
        `Filament DB spool ${change.spool.sourceId} is missing. Reload the inventory and try again.`,
      );
    const patches = changePatches(change, { locationIdByName: locationIds, problem });
    const host = (filaments as Bag[]).find(
      (filament) => idOf(filament["_id"]) === filamentOf.get(spool),
    );
    if (host) patchSnapshotFilament(host, patches.filament);
    const remainingWeight =
      patches.spool.remainingWeight !== undefined
        ? patches.spool.remainingWeight
        : patches.filament.spoolWeight !== undefined
          ? change.spool.remainingWeight
          : undefined;
    patchSnapshotSpool(
      spool,
      remainingWeight !== undefined ? { ...patches.spool, remainingWeight } : patches.spool,
      patches.filament.spoolWeight !== undefined
        ? patches.filament.spoolWeight
        : change.spool.emptySpoolWeight,
    );
    updated++;
  }
  if (updated || created)
    warnings.push(
      "Restoring a snapshot replaces everything in Filament DB. Prefer the CLI (--filament-db-url with --apply), which changes only the spools that differ.",
    );
  return {
    json: JSON.stringify(document, null, 2) + "\n",
    total: spools.size + legacyRolls.size,
    updated,
    created,
    warnings,
  };
}
