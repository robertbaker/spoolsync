import type { PlannedCreate, PlannedUpdate } from "../../core/compare";
import { spoolstockLotNr } from "../../core/normalize";
import { encodeExtras, truncateComment, type SpoolParameters, type SpoolmanSpool } from "./schema";
import { linkExtras } from "./spool-links";

export function buildSpoolPatch(
  change: PlannedUpdate,
  current: SpoolmanSpool,
): Partial<SpoolParameters> {
  const patch: Partial<SpoolParameters> = {};

  for (const { field, to } of change.changes) {
    switch (field) {
      case "location":
        patch.location = (to as string | null) ?? null;
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
      default:
        break;
    }
  }

  const purchased = change.changes.find((c) => c.field === "purchasedOn");
  const newExtras = encodeExtras({
    ...linkExtras(change.links),
    ...(purchased ? { spoolstock_purchased_on: purchased.to as string | null } : {}),
  });
  if (Object.keys(newExtras).length || purchased) {
    // Spoolman replaces the whole extra map on PATCH, so keep what is already there.
    patch.extra = { ...current.extra, ...newExtras };
    if (purchased && purchased.to == null) delete patch.extra.spoolstock_purchased_on;
  }
  if (change.links.spoolstockShortId && !current.lot_nr) {
    patch.lot_nr = spoolstockLotNr(change.links.spoolstockShortId);
  }

  return patch;
}

export function createSpoolParameters(change: PlannedCreate, filamentId: number): SpoolParameters {
  const { values, links } = change;
  return {
    filament_id: filamentId,
    initial_weight: values.initialWeight,
    remaining_weight: values.remainingWeight,
    spool_weight: values.emptySpoolWeight,
    location: values.location,
    price: values.price,
    comment: truncateComment(values.comment),
    archived: values.archived,
    lot_nr: links.spoolstockShortId ? spoolstockLotNr(links.spoolstockShortId) : null,
    extra: encodeExtras({ ...linkExtras(links), spoolstock_purchased_on: values.purchasedOn }),
  };
}
