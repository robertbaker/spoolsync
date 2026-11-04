/**
 * The vocabulary of the generic column mapper: the SpoolSync fields a column can feed, how column
 * names are guessed, how a column layout is recognised again, and what makes a mapping valid. Pure
 * and free of parsing libraries, so the saved-settings code can import it on every page.
 */

export const MAP_FIELDS = [
  "vendor",
  "material",
  "name",
  "color",
  "remainingWeight",
  "usedWeight",
  "initialWeight",
  "emptySpoolWeight",
  "price",
  "location",
  "lotNr",
  "comment",
  "archived",
  "diameter",
  "density",
  "articleNumber",
] as const;
export type MapField = (typeof MAP_FIELDS)[number];

export const isMapField = (value: unknown): value is MapField =>
  typeof value === "string" && (MAP_FIELDS as readonly string[]).includes(value);

/** What weights in the source file are measured in. */
export const WEIGHT_UNITS = ["g", "kg", "oz", "lb"] as const;
export type MapWeightUnit = (typeof WEIGHT_UNITS)[number];

export const isWeightUnit = (value: unknown): value is MapWeightUnit =>
  typeof value === "string" && (WEIGHT_UNITS as readonly string[]).includes(value);

/** Grams in one of each unit. */
export const GRAMS_PER_UNIT: Record<MapWeightUnit, number> = {
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
};

/** Spool fields whose value is a weight, so the file's unit applies. */
export const WEIGHT_FIELDS: readonly MapField[] = [
  "remainingWeight",
  "usedWeight",
  "initialWeight",
  "emptySpoolWeight",
];

/** Field to the source header that feeds it. A field absent from the object is not mapped. */
export type ColumnMapping = Partial<Record<MapField, string>>;

/** Column names a field is usually called, compared after `normalizeHeader`. */
const ALIASES: Record<MapField, readonly string[]> = {
  vendor: [
    "vendor",
    "brand",
    "brandname",
    "manufacturer",
    "maker",
    "producer",
    "filamentbrand",
    "vendorname",
  ],
  material: ["material", "materialtype", "filamenttype", "type", "polymer", "filamentmaterial"],
  name: [
    "name",
    "colorname",
    "colourname",
    "filamentname",
    "variant",
    "title",
    "product",
    "colorlabel",
  ],
  color: ["color", "colour", "hex", "colorhex", "hexcolor", "hexcode", "colorcode", "colourhex"],
  remainingWeight: [
    "remaining",
    "remainingweight",
    "weightremaining",
    "remaininggrams",
    "gramsleft",
    "weightleft",
    "left",
    "currentweight",
    "weight",
  ],
  usedWeight: ["used", "usedweight", "weightused", "consumed", "usedgrams"],
  initialWeight: [
    "initialweight",
    "fullweight",
    "startweight",
    "netweight",
    "filamentweight",
    "capacity",
  ],
  emptySpoolWeight: [
    "spoolweight",
    "emptyspool",
    "emptyspoolweight",
    "emptyweight",
    "tare",
    "tareweight",
  ],
  price: ["price", "cost", "purchaseprice", "paid", "spoolprice"],
  location: ["location", "storage", "shelf", "place", "box", "bin", "storagelocation"],
  lotNr: ["lot", "lotnr", "lotnumber", "batch", "batchnumber"],
  comment: ["comment", "comments", "notes", "note", "remarks", "description"],
  archived: ["archived", "isarchived", "archive", "finished", "usedup"],
  diameter: ["diameter", "dia", "filamentdiameter"],
  density: ["density"],
  articleNumber: ["articlenumber", "sku", "upc", "ean", "barcode", "partnumber", "productcode"],
};

/** Lower case with everything but letters and digits removed: `Remaining (g)` becomes `remainingg`. */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** The same, with a trailing unit in brackets or after an underscore dropped first: `Weight (g)`. */
function stripUnit(header: string): string {
  return header
    .replace(/[([{]\s*(g|kg|oz|lb|lbs|grams?|mm|%|usd|eur|gbp|\$|€|£)\s*[)\]}]\s*$/i, "")
    .replace(/[_\s-]+(g|kg|oz|lb|lbs|mm)$/i, "");
}

const aliasIndex: Map<string, MapField> = (() => {
  const index = new Map<string, MapField>();
  // Earlier fields win a shared alias, which keeps the guess deterministic.
  for (const field of MAP_FIELDS)
    for (const alias of ALIASES[field]) {
      const key = normalizeHeader(alias);
      if (!index.has(key)) index.set(key, field);
    }
  return index;
})();

const HEX_LIKE = /^(#|0x)?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Share of the non-empty sample values in a column that look like hex colors. */
function hexShare(rows: ReadonlyArray<Record<string, string>>, header: string): number {
  const values = rows
    .slice(0, 50)
    .map((row) => (Object.hasOwn(row, header) ? (row[header] ?? "").trim() : ""))
    .filter(Boolean);
  return values.length ? values.filter((value) => HEX_LIKE.test(value)).length / values.length : 0;
}

/**
 * Guesses a mapping from the column names. Each field takes at most one column and each column at
 * most one field, with the exact alias match listed earliest in a field's aliases winning. When
 * sample rows are given, a "color" column that holds words rather than hex codes becomes the name
 * and a neighbouring hex column becomes the color. The person always confirms the guess; nothing
 * here is applied silently.
 */
export function suggestMapping(
  headers: readonly string[],
  rows: ReadonlyArray<Record<string, string>> = [],
): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  const ranked: Array<{ header: string; field: MapField; rank: number }> = [];
  for (const header of headers) {
    const key = normalizeHeader(stripUnit(header));
    const field = aliasIndex.get(key);
    if (field)
      ranked.push({ header, field, rank: ALIASES[field].map(normalizeHeader).indexOf(key) });
  }
  ranked.sort((a, b) => a.rank - b.rank || headers.indexOf(a.header) - headers.indexOf(b.header));
  for (const { header, field } of ranked) {
    if (mapping[field] !== undefined || used.has(header)) continue;
    mapping[field] = header;
    used.add(header);
  }
  if (rows.length && mapping.color !== undefined && hexShare(rows, mapping.color) < 0.5) {
    const words = mapping.color;
    delete mapping.color;
    if (mapping.name === undefined) mapping.name = words;
    const taken = new Set(Object.values(mapping));
    const hexColumn = headers.find((header) => {
      const key = normalizeHeader(header);
      return (
        !taken.has(header) &&
        (key.includes("hex") || key.includes("colo")) &&
        hexShare(rows, header) >= 0.5
      );
    });
    if (hexColumn !== undefined) mapping.color = hexColumn;
  }
  return mapping;
}

/** 32-bit FNV-1a, as eight hex digits. Not a security measure; a compact key for a column layout. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * A key for a column layout: the same set of headers gives the same key whatever their order or
 * letter case, so a re-export of the same sheet finds its saved mapping.
 */
export function headerSignature(headers: readonly string[]): string {
  const names = [...new Set(headers.map((header) => header.trim().toLowerCase()))].sort();
  return `${names.length}-${fnv1a(names.join("\u0000"))}`;
}

export interface MappingProblem {
  kind: "identity" | "duplicate" | "missing";
  /** The header concerned, for `duplicate` and `missing`. */
  header?: string;
  fields?: [MapField, MapField];
}

export interface MappingCheck {
  /** Reasons the mapping cannot be used. */
  problems: MappingProblem[];
  /** Things worth knowing that do not block it. */
  notes: Array<"no-weight" | "both-weights">;
}

/**
 * Checks a mapping against the file's headers. It is usable when every mapped header exists, no
 * header feeds two fields, and at least one of brand, material or name is mapped (otherwise the
 * spools would be indistinguishable).
 */
export function validateMapping(mapping: ColumnMapping, headers: readonly string[]): MappingCheck {
  const problems: MappingProblem[] = [];
  const known = new Set(headers);
  const seen = new Map<string, MapField>();
  for (const field of MAP_FIELDS) {
    const header = mapping[field];
    if (header === undefined) continue;
    if (!known.has(header)) {
      problems.push({ kind: "missing", header });
      continue;
    }
    const other = seen.get(header);
    if (other) problems.push({ kind: "duplicate", header, fields: [other, field] });
    else seen.set(header, field);
  }
  if (!mapping.vendor && !mapping.material && !mapping.name) problems.push({ kind: "identity" });
  const notes: MappingCheck["notes"] = [];
  const weighs = (["remainingWeight", "usedWeight", "initialWeight"] as const).some(
    (field) => mapping[field] !== undefined,
  );
  if (!weighs) notes.push("no-weight");
  if (mapping.remainingWeight !== undefined && mapping.usedWeight !== undefined)
    notes.push("both-weights");
  return { problems, notes };
}

/** Drops mapped headers the file does not have, so a saved mapping never points at nothing. */
export function mappingForHeaders(
  mapping: ColumnMapping,
  headers: readonly string[],
): ColumnMapping {
  const known = new Set(headers);
  const result: ColumnMapping = {};
  for (const field of MAP_FIELDS) {
    const header = mapping[field];
    if (header !== undefined && known.has(header)) result[field] = header;
  }
  return result;
}
