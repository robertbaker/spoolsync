/**
 * How a provider's (or a file's) records map onto `ReferenceFilament`. A mapping is plain data: for
 * each reference key, the paths to try in order. The built-in generic mapping reads the documented
 * reference-file schema (see docs/architecture.md); a provider whose real schema is known gets its
 * own preset, which is nothing more than another `ReferenceMapping`.
 */

export const REFERENCE_KEYS = [
  "id",
  "vendor",
  "name",
  "material",
  "colorName",
  "colorHex",
  "colorHexes",
  "diameter",
  "density",
  "nozzleTempMin",
  "nozzleTempMax",
  "nozzleTempRange",
  "bedTempMin",
  "bedTempMax",
  "bedTempRange",
  "initialWeight",
  "emptySpoolWeight",
  "price",
  "barcode",
  "url",
] as const;
export type ReferenceKey = (typeof REFERENCE_KEYS)[number];

export type WeightUnitSetting = "g" | "kg" | "auto";

export interface ReferenceMapping {
  /**
   * Where the list of records is in a JSON document: a path such as `data.filaments`, `""` for a
   * document that is itself a list, or `"auto"` to look for the one list of objects. Ignored for CSV.
   */
  records: string;
  /** Paths to try, in order, per key. The first one that holds a value wins. */
  fields: Partial<Record<ReferenceKey, readonly string[]>>;
  /** How to read a weight written as a bare number. `auto` reads 10 or less as kilograms. */
  weightUnit: WeightUnitSetting;
}

/**
 * Preset field aliases for the generic reference file. Header and key names are compared ignoring
 * case, spacing, punctuation and a trailing unit in brackets ("Nozzle Temp Min (C)" matches
 * `nozzle_temp_min`), so each alias only needs to be spelled once.
 */
export const GENERIC_FIELD_ALIASES: Readonly<Record<ReferenceKey, readonly string[]>> = {
  id: ["id", "uuid", "guid", "slug", "reference_id", "ref_id", "key"],
  vendor: ["vendor", "brand", "manufacturer", "maker", "producer", "company", "brand_name"],
  name: ["product_name", "product", "product_line", "line", "series", "filament_name", "filament"],
  material: ["material", "material_type", "filament_type", "type", "polymer"],
  colorName: ["color_name", "colour_name", "colorname", "color", "colour", "shade", "name"],
  colorHex: [
    "color_hex",
    "colour_hex",
    "colorhex",
    "hex",
    "hex_color",
    "hex_colour",
    "color_code",
    "rgb",
    "color",
    "colour",
  ],
  colorHexes: ["color_hexes", "colour_hexes", "hexes", "multi_color_hex", "multi_color_hexes"],
  diameter: ["diameter", "diameter_mm", "filament_diameter"],
  density: ["density", "density_g_cm3", "density_gcm3"],
  nozzleTempMin: [
    "nozzle_temp_min",
    "nozzle_min",
    "min_nozzle_temp",
    "print_temp_min",
    "min_print_temp",
    "extruder_temp_min",
    "hotend_temp_min",
    "settings_extruder_temp_min",
  ],
  nozzleTempMax: [
    "nozzle_temp_max",
    "nozzle_max",
    "max_nozzle_temp",
    "print_temp_max",
    "max_print_temp",
    "extruder_temp_max",
    "hotend_temp_max",
    "settings_extruder_temp_max",
  ],
  nozzleTempRange: [
    "nozzle_temp",
    "nozzle_temperature",
    "print_temp",
    "print_temperature",
    "extruder_temp",
    "hotend_temp",
    "nozzle_temp_range",
    "print_temp_range",
  ],
  bedTempMin: [
    "bed_temp_min",
    "bed_min",
    "min_bed_temp",
    "bed_temperature_min",
    "settings_bed_temp_min",
  ],
  bedTempMax: [
    "bed_temp_max",
    "bed_max",
    "max_bed_temp",
    "bed_temperature_max",
    "settings_bed_temp_max",
  ],
  bedTempRange: ["bed_temp", "bed_temperature", "bed_temp_range"],
  initialWeight: [
    "net_weight",
    "filament_weight",
    "initial_weight",
    "weight_net",
    "spool_net_weight",
    "weight",
    "weight_g",
    "size",
  ],
  emptySpoolWeight: [
    "empty_spool_weight",
    "spool_empty_weight",
    "spool_weight",
    "empty_weight",
    "tare",
    "spool_tare",
  ],
  price: ["price", "list_price", "msrp", "retail_price", "cost"],
  barcode: ["barcode", "upc", "ean", "ean13", "gtin", "upc_ean", "gtin13"],
  url: ["url", "link", "product_url", "product_link", "page", "website"],
};

export const GENERIC_MAPPING: ReferenceMapping = {
  records: "auto",
  fields: GENERIC_FIELD_ALIASES,
  weightUnit: "auto",
};

/** A mapping for a provider whose real schema is known. None is verified yet; see `PROVIDERS`. */
export interface ReferencePreset {
  id: string;
  label: string;
  providerId: string;
  mapping: ReferenceMapping;
}

/** Presets that ship with SpoolSync: only the generic file schema. */
export const REFERENCE_PRESETS: readonly ReferencePreset[] = [
  { id: "generic", label: "Generic reference file", providerId: "file", mapping: GENERIC_MAPPING },
];

/** Names compare without case, accents, punctuation, or a unit in brackets at the end. */
export function fieldKey(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[([{][^)\]}]*[)\]}]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

const MAX_PATH_LENGTH = 200;
const MAX_SEGMENTS = 12;
const PATH_PATTERN = /^[\p{L}\p{N}_\-. [\]$:]+$/u;

/** Splits `a.b[0].c` into `["a", "b", 0, "c"]`. Returns `null` for a path that does not parse. */
export function parsePath(path: string): Array<string | number> | null {
  const text = path.trim();
  if (!text || text.length > MAX_PATH_LENGTH || !PATH_PATTERN.test(text)) return null;
  const segments: Array<string | number> = [];
  for (const part of text.split(".")) {
    const match = /^([^[\]]*)((?:\[\d{1,6}\])*)$/.exec(part);
    if (!match) return null;
    if (match[1]) segments.push(match[1]);
    else if (!match[2]) return null;
    for (const index of match[2]!.matchAll(/\[(\d{1,6})\]/g)) segments.push(Number(index[1]));
  }
  return segments.length && segments.length <= MAX_SEGMENTS ? segments : null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function child(value: unknown, segment: string | number): unknown {
  if (typeof segment === "number") return Array.isArray(value) ? value[segment] : undefined;
  if (!isRecord(value)) return undefined;
  if (Object.hasOwn(value, segment)) return value[segment];
  const wanted = fieldKey(segment);
  if (!wanted) return undefined;
  const key = Object.keys(value)
    .sort()
    .find((candidate) => fieldKey(candidate) === wanted);
  return key === undefined ? undefined : value[key];
}

/** Reads a path from parsed JSON or a CSV row; segments match exactly, then by `fieldKey`. */
export function readPath(value: unknown, path: string): unknown {
  const segments = parsePath(path);
  if (!segments) return undefined;
  let current: unknown = value;
  for (const segment of segments) {
    current = child(current, segment);
    if (current === undefined || current === null) return undefined;
  }
  return current;
}

const isKey = (key: string): key is ReferenceKey => (REFERENCE_KEYS as readonly string[]).includes(key);

export type MappingResult =
  | { ok: true; mapping: ReferenceMapping }
  | { ok: false; errors: string[] };

/**
 * Validates a mapping a person wrote (or loaded from settings): `{ "records": "data.items",
 * "fields": { "vendor": ["manufacturer.name"], "colorHex": "hex" }, "weightUnit": "g" }`. Keys that
 * are left out use the generic aliases, so a mapping only names what differs. Unknown keys, bad
 * paths and wrong types are reported, never ignored silently.
 */
export function parseMapping(raw: unknown): MappingResult {
  if (!isRecord(raw)) return { ok: false, errors: ["The mapping must be a JSON object."] };
  const errors: string[] = [];
  const known = new Set(["records", "fields", "weightUnit"]);
  for (const key of Object.keys(raw))
    if (!known.has(key)) errors.push(`Unknown mapping key "${key}". Use records, fields, weightUnit.`);

  let records = GENERIC_MAPPING.records;
  if (raw["records"] !== undefined) {
    const value = raw["records"];
    if (typeof value !== "string") errors.push('"records" must be text: a path, "" or "auto".');
    else if (value !== "" && value !== "auto" && !parsePath(value))
      errors.push(`"records" is not a valid path: ${JSON.stringify(value)}.`);
    else records = value;
  }

  let weightUnit = GENERIC_MAPPING.weightUnit;
  if (raw["weightUnit"] !== undefined) {
    const value = raw["weightUnit"];
    if (value === "g" || value === "kg" || value === "auto") weightUnit = value;
    else errors.push('"weightUnit" must be "g", "kg" or "auto".');
  }

  const fields: Partial<Record<ReferenceKey, readonly string[]>> = { ...GENERIC_FIELD_ALIASES };
  const given = raw["fields"];
  if (given !== undefined) {
    if (!isRecord(given)) errors.push('"fields" must be an object of key to path(s).');
    else
      for (const [key, value] of Object.entries(given)) {
        if (!isKey(key)) {
          errors.push(`Unknown field "${key}". Choose from: ${REFERENCE_KEYS.join(", ")}.`);
          continue;
        }
        const paths = typeof value === "string" ? [value] : value;
        if (
          !Array.isArray(paths) ||
          !paths.length ||
          paths.some((path) => typeof path !== "string" || !parsePath(path))
        ) {
          errors.push(`"${key}" needs a path or a list of paths such as "brand.name".`);
          continue;
        }
        fields[key] = [...new Set(paths as string[])];
      }
  }
  return errors.length ? { ok: false, errors } : { ok: true, mapping: { records, fields, weightUnit } };
}

/** The part of a mapping that differs from the generic one, for storing in settings. */
export function mappingOverrides(mapping: ReferenceMapping): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (mapping.records !== GENERIC_MAPPING.records) out["records"] = mapping.records;
  if (mapping.weightUnit !== GENERIC_MAPPING.weightUnit) out["weightUnit"] = mapping.weightUnit;
  const fields: Record<string, readonly string[]> = {};
  for (const key of REFERENCE_KEYS) {
    const paths = mapping.fields[key];
    const generic = GENERIC_FIELD_ALIASES[key];
    if (paths && (paths.length !== generic.length || paths.some((path, i) => path !== generic[i])))
      fields[key] = paths;
  }
  if (Object.keys(fields).length) out["fields"] = fields;
  return out;
}

const CONTAINER_KEYS = [
  "filaments",
  "items",
  "results",
  "data",
  "records",
  "entries",
  "products",
  "colors",
  "swatches",
  "spools",
];

const isListOfObjects = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.length > 0 && value.every(isRecord);

/** Finds the list of records in a JSON document according to the mapping. */
export function recordsOf(document: unknown, mapping: ReferenceMapping): unknown[] | null {
  if (mapping.records === "") return Array.isArray(document) ? document : null;
  if (mapping.records !== "auto") {
    const found = readPath(document, mapping.records);
    return Array.isArray(found) ? found : null;
  }
  if (Array.isArray(document)) return document;
  if (!isRecord(document)) return null;
  for (const wanted of CONTAINER_KEYS) {
    const key = Object.keys(document)
      .sort()
      .find((candidate) => fieldKey(candidate) === wanted);
    if (key === undefined) continue;
    const value = document[key];
    if (Array.isArray(value)) return value;
    if (isRecord(value)) {
      const nested = recordsOf(value, mapping);
      if (nested) return nested;
    }
  }
  const lists = Object.values(document).filter(isListOfObjects);
  return lists.length === 1 ? lists[0]! : null;
}
