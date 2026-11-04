import { COMPARABLE_FIELDS, SOURCE_IDS, type ComparableField, type SourceId } from "../model";

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
  lotNr: "Lot / batch",
  finish: "Finish",
  td: "TD (transmission distance)",
  comment: "Notes",
  archived: "Archived",
};

/**
 * Fields added after the first adapters; a service takes part only once it is in
 * `ENABLED_EXTRA_FIELDS`.
 */
const OPT_IN_FIELDS: readonly ComparableField[] = ["lotNr", "finish", "td"];

/**
 * Opt-in fields each service reads and writes. An adapter adds its fields here once it maps them on
 * load and writes them back (see "Adding a comparable field" in `docs/architecture.md`).
 */
export const ENABLED_EXTRA_FIELDS: Partial<Record<SourceId, readonly ComparableField[]>> = {
  spoolman: ["lotNr"],
  bambuddy: ["lotNr", "finish"],
  spoolio: ["lotNr", "finish"],
  tigertag: ["finish", "td"],
  threeDfp: ["finish", "td"],
  spoolstock: ["finish"],
  spoolmaster: ["lotNr"],
  spoolhoarder: ["td"],
  filamentdb: ["lotNr", "finish", "td"],
  filamentDbApp: ["lotNr", "td"],
};

const without = (...excluded: ComparableField[]): ReadonlySet<ComparableField> =>
  new Set(
    COMPARABLE_FIELDS.filter(
      (field) => !excluded.includes(field) && !OPT_IN_FIELDS.includes(field),
    ),
  );

const withExtras = (
  source: SourceId,
  fields: ReadonlySet<ComparableField>,
): ReadonlySet<ComparableField> => {
  const extras = ENABLED_EXTRA_FIELDS[source] ?? [];
  return new Set(COMPARABLE_FIELDS.filter((f) => fields.has(f) || extras.includes(f)));
};

/**
 * Fields each service can store. A service sits out the comparison of a field it has no place for,
 * rather than conflicting on every spool:
 *
 * - Spoolman keeps a single extruder and bed temperature, not a range.
 * - Spoolio has no density, barcode, location or archived flag.
 * - TigerTag records carry no location (rack placement is never applied on import), price, purchase
 *   date or archived flag.
 */
const BASE_SOURCE_FIELDS: Record<SourceId, ReadonlySet<ComparableField>> = {
  spoolman: without("nozzleTempMin", "nozzleTempMax", "bedTempMin", "bedTempMax"),
  spoolstock: without(),
  spoolio: without("density", "upc", "location", "archived"),
  tigertag: without("location", "price", "purchasedOn", "archived"),
  // 3DFP keeps one preferred nozzle and bed temperature per spool, not a range (like Spoolman).
  threeDfp: without(
    "diameter",
    "density",
    "nozzleTempMin",
    "nozzleTempMax",
    "bedTempMin",
    "bedTempMax",
    "upc",
    "initialWeight",
    "archived",
  ),
  // Empty spool weight (core_weight) and archived state are written through the API; the CSV
  // importer accepts neither and warns.
  bambuddy: without("diameter", "density", "bedTempMin", "bedTempMax", "upc", "purchasedOn"),
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
  // Filament DB has no barcode field and keeps one bed temperature, not a range.
  filamentDbApp: without("upc", "bedTempMax"),
  spoolmaster: without("density", "upc", "emptySpoolWeight", "archived"),
  spoolhoarder: without(
    "density",
    "upc",
    "nozzleTempMin",
    "nozzleTempMax",
    "bedTempMin",
    "bedTempMax",
    "purchasedOn",
  ),
  spoolapp: without(
    "density",
    "upc",
    "nozzleTempMin",
    "nozzleTempMax",
    "bedTempMin",
    "bedTempMax",
    "location",
  ),
  spoolkeep: without(
    "density",
    "initialWeight",
    "remainingWeight",
    "emptySpoolWeight",
    "location",
    "purchasedOn",
    "archived",
  ),
};

export const SOURCE_FIELDS = Object.fromEntries(
  SOURCE_IDS.map((source) => [source, withExtras(source, BASE_SOURCE_FIELDS[source])]),
) as Record<SourceId, ReadonlySet<ComparableField>>;
