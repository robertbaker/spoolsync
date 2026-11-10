import type { SpoolValues } from "../../core/compare";
import type { ComparableField } from "../../core/model";
import { shortIdFromLotNr } from "../../core/normalize";
import {
  defaultDensity,
  colorParams,
  existingHexes,
  filamentTemps,
  hasDiameterOverride,
  hasTempRanges,
  storedWeight,
  temperatureParams,
} from "./filament-policy";
import { encodeExtras, readExtra, truncateComment } from "./schema";

export type Spool = Record<string, unknown> & {
  filament: Record<string, unknown> & {
    vendor?: Record<string, unknown> | null;
  };
  extra?: Record<string, string>;
};

export function setField(spool: Spool, field: ComparableField, value: unknown): void {
  const filament = spool.filament;
  switch (field) {
    case "vendor":
      filament.vendor = value == null ? null : { ...(filament.vendor ?? { id: 0 }), name: value };
      if (Object.hasOwn(filament, "vendor_id"))
        filament["vendor_id"] = filament.vendor?.["id"] ?? null;
      break;
    case "material":
    case "name":
    case "density":
      filament[field] = value;
      break;
    case "diameter":
      // Where a spool overrides the diameter, that override is what the inventory shows.
      if (hasDiameterOverride(spool)) spool["diameter"] = value;
      else filament["diameter"] = value;
      break;
    case "nozzleTempMin":
    case "nozzleTempMax":
    case "bedTempMin":
    case "bedTempMax":
      // Applied together by setTemperatures: one value alone cannot tell a range from a point.
      break;
    case "lotNr":
      // Keep the Spoolstock link the old lot number carried before replacing it.
      if (
        shortIdFromLotNr(spool["lot_nr"] as string | null) &&
        !readExtra(spool.extra, "spoolstock_short_id")
      )
        spool.extra = {
          ...spool.extra,
          ...encodeExtras({
            spoolstock_short_id: shortIdFromLotNr(spool["lot_nr"] as string),
          }),
        };
      spool["lot_nr"] = value;
      break;
    case "colors":
      Object.assign(
        filament,
        colorParams(
          (value as string[]) ?? [],
          filament["multi_color_direction"] === "longitudinal" ? "longitudinal" : "coaxial",
          existingHexes(filament as never),
        ),
      );
      break;
    case "upc":
      filament["article_number"] = value;
      break;
    case "initialWeight":
      spool["initial_weight"] = storedWeight(value as number | null);
      break;
    case "remainingWeight":
      spool["remaining_weight"] = value;
      // A file can say the remaining weight is unknown by leaving the used weight out.
      if (value == null) delete spool["used_weight"];
      if (typeof spool["initial_weight"] === "number" && typeof value === "number") {
        spool["used_weight"] = Math.max(0, spool["initial_weight"] - value);
      }
      break;
    case "emptySpoolWeight":
      spool["spool_weight"] = value;
      break;
    case "location":
    case "price":
    case "archived":
      spool[field] = value;
      break;
    case "comment":
      spool["comment"] = truncateComment(value as string | null);
      break;
    case "purchasedOn":
      spool.extra = {
        ...spool.extra,
        ...encodeExtras({ spoolstock_purchased_on: value as string | null }),
      };
      if (value == null) delete spool.extra.spoolstock_purchased_on;
      break;
    default:
      break;
  }
}

/** Applies temperature changes as one set, so a min and a max change do not overwrite each other. */
export function setTemperatures(
  spool: Spool,
  changes: ReadonlyArray<{ field: ComparableField; to: unknown }>,
  ranges = false,
): void {
  const temps = { ...filamentTemps(spool.filament) };
  let touched = false;
  for (const { field, to } of changes) {
    if (field in temps) {
      temps[field as keyof typeof temps] = (to as number | null) ?? null;
      touched = true;
    }
  }
  if (touched)
    Object.assign(
      spool.filament,
      temperatureParams(temps, ranges || hasTempRanges(spool.filament)),
    );
}

export function newSpool(id: number, values: SpoolValues, ranges = false): Spool {
  const spool: Spool = {
    id,
    registered: new Date().toISOString(),
    archived: false,
    extra: {},
    filament: {
      id,
      name: null,
      material: null,
      vendor: null,
      density: defaultDensity(values.material),
      diameter: 1.75,
      weight: storedWeight(values.initialWeight),
      spool_weight: values.emptySpoolWeight,
      ...temperatureParams(values, ranges),
    },
  };
  for (const [field, value] of Object.entries(values)) {
    if (value !== null) setField(spool, field as ComparableField, value);
  }
  if (spool.filament.vendor) spool.filament.vendor["id"] = id;
  return spool;
}
