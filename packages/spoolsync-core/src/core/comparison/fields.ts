import { COMPARABLE_FIELDS, type ComparableField, type SourceId } from "../model";

export const FIELD_LABELS: Record<ComparableField, string> = {
  vendor: "Brand",
  material: "Material",
  name: "Name",
  colors: "Color",
  diameter: "Diameter (mm)",
  density: "Density (g/cm³)",
  nozzleTempMin: "Nozzle min (°C)",
  nozzleTempMax: "Nozzle max (°C)",
  bedTempMin: "Bed min (°C)",
  bedTempMax: "Bed max (°C)",
  upc: "Barcode",
  initialWeight: "Net weight (g)",
  remainingWeight: "Remaining (g)",
  emptySpoolWeight: "Empty spool (g)",
  location: "Location",
  price: "Price",
  purchasedOn: "Purchased",
  comment: "Notes",
  archived: "Archived",
};

const without = (...excluded: ComparableField[]): ReadonlySet<ComparableField> =>
  new Set(COMPARABLE_FIELDS.filter((field) => !excluded.includes(field)));

/**
 * Fields each service can store. A service sits out the comparison of a field it has no place for,
 * rather than conflicting on every spool:
 *
 * - Spoolman keeps a single extruder and bed temperature, not a range.
 * - Spoolio has no density, barcode, location or archived flag.
 * - TigerTag records carry no location (rack placement is never applied on import), price, purchase
 *   date or archived flag.
 */
export const SOURCE_FIELDS: Record<SourceId, ReadonlySet<ComparableField>> = {
  spoolman: without("nozzleTempMin", "nozzleTempMax", "bedTempMin", "bedTempMax"),
  spoolstock: without(),
  spoolio: without("density", "upc", "location", "archived"),
  tigertag: without("location", "price", "purchasedOn", "archived"),
  threeDfp: without(
    "diameter",
    "density",
    "nozzleTempMax",
    "bedTempMax",
    "upc",
    "initialWeight",
    "archived",
  ),
  bambuddy: without(
    "emptySpoolWeight",
    "diameter",
    "density",
    "bedTempMin",
    "bedTempMax",
    "upc",
    "purchasedOn",
    "archived",
  ),
  filameter: without(
    "diameter",
    "density",
    "nozzleTempMin",
    "nozzleTempMax",
    "bedTempMin",
    "bedTempMax",
    "upc",
    "emptySpoolWeight",
    "purchasedOn",
    "archived",
  ),
  filadex: without(
    "density",
    "bedTempMin",
    "bedTempMax",
    "emptySpoolWeight",
    "comment",
    "archived",
  ),
  filamentdb: without("location", "price", "purchasedOn"),
};
