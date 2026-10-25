import type { SpoolValues } from "../../core/compare";
import type { ComparableField } from "../../core/model";
import { defaultDensity, colorParams, middle } from "./filament-policy";
import { encodeExtras, truncateComment } from "./schema";

export type Spool = Record<string, unknown> & {
  filament: Record<string, unknown> & { vendor?: Record<string, unknown> | null };
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
    case "diameter":
      filament[field] = value;
      break;
    case "colors":
      Object.assign(
        filament,
        colorParams(
          (value as string[]) ?? [],
          filament["multi_color_direction"] === "longitudinal" ? "longitudinal" : "coaxial",
        ),
      );
      break;
    case "upc":
      filament["article_number"] = value;
      break;
    case "initialWeight":
      spool["initial_weight"] = value;
      break;
    case "remainingWeight":
      spool["remaining_weight"] = value;
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

export function newSpool(id: number, values: SpoolValues): Spool {
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
      weight: values.initialWeight,
      spool_weight: values.emptySpoolWeight,
      settings_extruder_temp: middle(values.nozzleTempMin, values.nozzleTempMax),
      settings_bed_temp: middle(values.bedTempMin, values.bedTempMax),
    },
  };
  for (const [field, value] of Object.entries(values)) {
    if (value !== null) setField(spool, field as ComparableField, value);
  }
  if (spool.filament.vendor) spool.filament.vendor["id"] = id;
  return spool;
}
