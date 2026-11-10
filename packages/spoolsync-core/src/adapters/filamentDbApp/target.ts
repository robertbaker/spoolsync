import type { SpoolValues } from "../../core/compare";
import { filamentProfile, idOf } from "./map";
import { withinTextLimit } from "./records";
import type { FilamentDbAppFilament } from "./types";

type Bag = Record<string, unknown>;

export interface SpoolTarget {
  filament: FilamentDbAppFilament;
  id: string;
  /** Empty-spool weight the filament resolves to, if it has one. */
  tare: number | null;
}

const same = (a: string | null, b: string | null) =>
  a !== null && b !== null && a.toLowerCase() === b.toLowerCase();

/**
 * Finds the one existing filament a new spool belongs on. Filament DB refuses a spool on a template
 * (a filament with color variants), so templates are never candidates; the spool goes on a variant
 * or standalone filament with the same brand, material, color and name. Anything other than exactly
 * one match is an error rather than a guess.
 */
export function findSpoolTarget(
  filaments: readonly FilamentDbAppFilament[],
  values: Pick<SpoolValues, "vendor" | "material" | "name" | "colors">,
): SpoolTarget {
  const live = filaments.filter((f) => !f["_deletedAt"] && f["_purged"] !== true);
  const byId = new Map(live.map((f) => [idOf(f["_id"]), f] as const));
  const templates = new Set(live.map((f) => idOf(f["parentId"])).filter((id) => id !== null));
  const matches: SpoolTarget[] = [];
  for (const filament of live) {
    const id = idOf(filament["_id"]);
    if (!id || templates.has(id)) continue;
    const parentId = idOf(filament["parentId"]);
    const profile = filamentProfile(filament, parentId ? byId.get(parentId) : undefined);
    if (!same(profile.vendor, values.vendor) || !same(profile.material, values.material)) continue;
    if (values.name && !profile.names.some((name) => same(name, values.name))) continue;
    if (values.colors[0] && profile.colors[0] !== values.colors[0]) continue;
    matches.push({ filament, id, tare: profile.tare });
  }
  const label = [values.vendor, values.material, values.name].filter(Boolean).join(" ");
  if (matches.length === 0)
    throw new Error(
      `No filament in Filament DB matches ${label || "this spool"}. Add the filament (or a color variant of its template) there first.`,
    );
  if (matches.length > 1)
    throw new Error(
      `${matches.length} filaments in Filament DB match ${label}. Make the name or color unique, or add the spool in Filament DB.`,
    );
  return matches[0]!;
}

/**
 * The body for a new spool; `tare` turns the remaining grams into the scale weight Filament DB
 * keeps.
 */
export function newSpoolFields(
  values: SpoolValues,
  tare: number | null,
  locationIdByName: ReadonlyMap<string, string>,
  problem: (message: string) => void,
  warn: (message: string) => void = problem,
): Bag {
  const body: Bag = {};
  const remaining = values.remainingWeight ?? values.initialWeight;
  // Filament DB stores the weight verbatim and adds the filament's own empty-spool weight back only
  // when reading, so a tare the filament lacks must not be added here or remaining would reload high.
  if (remaining !== null) body["totalWeight"] = remaining + (tare ?? 0);
  for (const note of newSpoolDrops(values, tare)) warn(note);
  if (values.purchasedOn) body["purchaseDate"] = values.purchasedOn;
  if (values.archived) body["retired"] = true;
  const label = withinTextLimit(values.comment || null, "label", warn);
  if (label) body["label"] = label;
  const lot = withinTextLimit(values.lotNr || null, "lot number", warn);
  if (lot) body["lotNumber"] = lot;
  if (values.location) {
    const id = locationIdByName.get(values.location.toLowerCase());
    if (id) body["locationId"] = id;
    else
      problem(
        `Location "${values.location}" does not exist in Filament DB. Create it there first.`,
      );
  }
  if (Object.keys(body).length === 0)
    throw new Error(
      "Filament DB needs at least a weight, label, lot number, purchase date or location to add a spool, and this one has none.",
    );
  return body;
}

/** Messages for new-spool values that are filament-level (or unpreservable) and so are not sent. */
export function newSpoolDrops(values: SpoolValues, tare: number | null): string[] {
  const notes: string[] = [];
  const shared = [
    values.price !== null && "price",
    values.density !== null && "density",
    values.diameter !== null && "diameter",
    (values.nozzleTempMin !== null ||
      values.nozzleTempMax !== null ||
      values.bedTempMin !== null ||
      values.bedTempMax !== null) &&
      "temperatures",
    values.td !== null && "TD",
  ].filter((name): name is string => typeof name === "string");
  if (shared.length)
    notes.push(
      `Filament DB keeps ${shared.join(", ")} on the filament, not the spool, so ${shared.length === 1 ? "it was" : "they were"} not sent for the new spool.`,
    );
  if (values.emptySpoolWeight !== null && values.emptySpoolWeight !== tare)
    notes.push(
      tare === null
        ? `The filament has no empty-spool weight in Filament DB, so the spool's ${values.emptySpoolWeight} g empty weight could not be kept; the weight was written without it.`
        : `The filament's empty-spool weight in Filament DB is ${tare} g, not ${values.emptySpoolWeight} g; the remaining weight was converted with ${tare} g.`,
    );
  return notes;
}
