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
        patch.initial_weight = to as number | null;
        break;
      case "remainingWeight":
        patch.remaining_weight = to as number | null;
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

  // Spoolman reads `initial_weight` before `remaining_weight` in the body, and it refuses a remaining
  // weight while the spool has no initial weight of its own, so state the one the filament implies.
  if ("remaining_weight" in patch && !("initial_weight" in patch)) {
    const inherited = current.filament.weight;
    // Stating the inherited weight pins it on the spool, so a later filament weight change no longer
    // reaches it; Spoolman gives no other way to set a remaining weight here.
    if (current.initial_weight == null && inherited != null) patch.initial_weight = inherited;
    else if (current.initial_weight == null) {
      // Neither the spool nor its filament has a weight, so Spoolman would refuse the whole patch.
      delete patch.remaining_weight;
      warn?.("remaining weight not set: Spoolman needs an initial weight or a filament weight");
    }
  }
  if ("initial_weight" in patch && "remaining_weight" in patch) {
    const { remaining_weight, ...rest } = patch;
    return withExtras({ ...rest, remaining_weight }, change, current, warn);
  }
  return withExtras(patch, change, current, warn);
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
  if (Object.keys(newExtras).length || purchased) {
    // Spoolman merges `extra` per key and only an explicit null clears a value.
    patch.extra = {
      ...current.extra,
      ...newExtras,
      ...(purchased && purchased.to == null ? { spoolstock_purchased_on: null } : {}),
    };
  }
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
    initial_weight: values.initialWeight,
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
