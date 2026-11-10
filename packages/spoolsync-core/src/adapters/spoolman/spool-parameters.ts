import type { PlannedCreate, PlannedUpdate } from "../../core/compare";
import { shortIdFromLotNr, spoolstockLotNr } from "../../core/normalize";
import { hasDiameterOverride } from "./filament-policy";
import { limitText, type LimitWarn } from "./limits";
import {
  encodeExtras,
  readExtra,
  truncateComment,
  type SpoolParameters,
  type SpoolmanFilament,
  type SpoolmanSpool,
} from "./schema";
import { linkExtras } from "./spool-links";

export function buildSpoolPatch(
  change: PlannedUpdate,
  current: SpoolmanSpool,
  warn?: LimitWarn,
): Partial<SpoolParameters> {
  const patch: Partial<SpoolParameters> = {};

  for (const { field, to } of change.changes) {
    switch (field) {
      case "location":
        patch.location = limitText("location", to as string | null, warn);
        break;
      case "price":
        patch.price = to as number | null;
        break;
      case "initialWeight":
        // Spoolman cannot use an initial weight of 0 (it refuses it), so 0 means "none".
        patch.initial_weight = (to as number | null) || null;
        break;
      case "remainingWeight":
        // Spoolman derives the remaining weight from the used weight, so it cannot be cleared.
        if (to == null)
          warn?.("remaining weight not cleared: Spoolman has no way to store an unknown one");
        else patch.remaining_weight = to as number;
        break;
      case "emptySpoolWeight":
        patch.spool_weight = to as number | null;
        break;
      case "comment":
        patch.comment = truncateComment(to as string | null);
        break;
      case "archived":
        patch.archived = to as boolean;
        break;
      case "lotNr":
        patch.lot_nr = limitText("lot number", to as string | null, warn);
        break;
      case "diameter":
        // A per-spool override (Spoolman-NG) is the effective diameter; the filament is left alone.
        if (hasDiameterOverride(current)) patch.diameter = to as number | null;
        break;
      default:
        break;
    }
  }

  // Spoolman stores the used weight and derives what is left, so a new initial weight alone would
  // move it. Spoolman applies `initial_weight` first, so this is measured against the new value.
  if (typeof patch.initial_weight === "number" && !("remaining_weight" in patch)) {
    const remaining = current.remaining_weight ?? change.spool.remainingWeight;
    if (remaining !== null && remaining !== undefined) patch.remaining_weight = remaining;
  }

  return withExtras(patch, change, current, warn);
}

/**
 * Makes a remaining weight in `patch` acceptable to Spoolman. Spoolman applies the body's fields in
 * its own declaration order (`filament_id`, `initial_weight`, `remaining_weight`), not the JSON key
 * order, and refuses a remaining weight while the spool has no initial weight of its own.
 *
 * `filamentWeight` is the weight of the filament the spool will have after the patch: the new one
 * when `filament_id` is in the patch (Spoolman inherits its weight first), else the current one.
 * Call this once the target filament is known.
 */
export function settleRemainingWeight(
  patch: Partial<SpoolParameters>,
  current: Pick<SpoolmanSpool, "initial_weight">,
  filamentWeight: number | null | undefined,
  warn?: LimitWarn,
): void {
  if (!("remaining_weight" in patch)) return;
  const drop = () => {
    delete patch.remaining_weight;
    warn?.("remaining weight not set: Spoolman needs an initial weight or a filament weight");
  };
  if ("initial_weight" in patch) {
    // An explicit initial weight is applied before the remaining weight; null clears it.
    if (patch.initial_weight == null) drop();
    return;
  }
  if (current.initial_weight != null) return;
  if (filamentWeight == null) return drop();
  // Moving to another filament inherits that filament's weight before the remaining weight is read.
  // Otherwise stating the inherited weight pins it on the spool, so a later filament weight change
  // no longer reaches it; Spoolman gives no other way to set a remaining weight here.
  if (patch.filament_id === undefined) patch.initial_weight = filamentWeight;
}

function withExtras(
  patch: Partial<SpoolParameters>,
  change: PlannedUpdate,
  current: SpoolmanSpool,
  warn?: LimitWarn,
): Partial<SpoolParameters> {
  const purchased = change.changes.find((c) => c.field === "purchasedOn");
  // Replacing a Spoolstock-style lot number must not lose the link it carried.
  const lostLink =
    "lot_nr" in patch && !readExtra(current.extra, "spoolstock_short_id")
      ? shortIdFromLotNr(current.lot_nr)
      : undefined;
  const newExtras = encodeExtras({
    ...linkExtras(change.links),
    ...(lostLink && !change.links.spoolstockShortId ? { spoolstock_short_id: lostLink } : {}),
    ...(purchased ? { spoolstock_purchased_on: purchased.to as string | null } : {}),
  });
  // Spoolman merges `extra` per key and validates every key it is sent, so only the keys that
  // change are sent: an unrelated or unregistered extra must not be able to reject the patch.
  const changed: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(newExtras))
    if (current.extra?.[key] !== value) changed[key] = value;
  // Only an explicit null clears a value (servers up to ~0.22 type extras as text and refuse null).
  if (purchased && purchased.to == null && current.extra?.spoolstock_purchased_on != null)
    changed.spoolstock_purchased_on = null;
  if (Object.keys(changed).length) patch.extra = changed;
  if (change.links.spoolstockShortId && !current.lot_nr && !("lot_nr" in patch)) {
    patch.lot_nr = limitText("lot number", spoolstockLotNr(change.links.spoolstockShortId), warn);
  }

  return patch;
}

/**
 * Spoolman derives the used weight from the initial weight (the spool's own, else its filament's),
 * so a remaining weight is only sent when one of them exists; otherwise Spoolman would refuse the
 * whole spool. `remainingDropped` tells the caller to say so.
 */
export function createSpoolParameters(
  change: PlannedCreate,
  filament: Pick<SpoolmanFilament, "id" | "weight">,
  warn?: LimitWarn,
): { params: SpoolParameters; remainingDropped: boolean } {
  const { values } = change;
  const links = { ...change.groupIds, ...change.links };
  const hasInitial = (values.initialWeight ?? 0) > 0 || (filament.weight ?? 0) > 0;
  const remainingDropped = values.remainingWeight != null && !hasInitial;
  const params: SpoolParameters = {
    filament_id: filament.id,
    // Spoolman refuses an initial weight of 0, so it is left unset (the filament's applies).
    initial_weight: values.initialWeight || null,
    ...(remainingDropped ? {} : { remaining_weight: values.remainingWeight }),
    spool_weight: values.emptySpoolWeight,
    location: limitText("location", values.location, warn),
    price: values.price,
    comment: truncateComment(values.comment),
    archived: values.archived,
    lot_nr: limitText(
      "lot number",
      values.lotNr ?? (links.spoolstockShortId ? spoolstockLotNr(links.spoolstockShortId) : null),
      warn,
    ),
    extra: encodeExtras({
      ...linkExtras(links),
      spoolstock_purchased_on: values.purchasedOn,
    }),
  };
  return { params, remainingDropped };
}
