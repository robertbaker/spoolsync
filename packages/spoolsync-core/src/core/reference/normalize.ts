import { formatMaterial, nameMentions, parseMaterial } from "../cleanup/materials";
import {
  normalizeBarcode,
  normalizeHex,
  parseDecimal,
  parseDiameter,
  parsePrice,
  parseTemperature,
  parseWeight,
} from "../cleanup/numbers";
import { cleanInline } from "../cleanup/text";
import { sanitizeBuyLinks } from "./cache";
import { contentId } from "./content-id";
import { fieldKey, readPath, type ReferenceKey, type ReferenceMapping } from "./mapping";
import {
  BED_RANGE,
  DENSITY_RANGE,
  DIAMETER_RANGE,
  DRYING_HOURS_RANGE,
  DRYING_TEMP_RANGE,
  EMPTY_SPOOL_RANGE,
  inRange,
  NOZZLE_RANGE,
  PRICE_RANGE,
  WEIGHT_RANGE,
} from "./ranges";
import type { ReferenceFilament } from "./types";

export interface RecordContext {
  providerId: string;
  providerLabel: string;
  attribution: string;
  license: string | null;
}

export interface NormalizedRecord {
  filament: ReferenceFilament | null;
  /** Problems with the record: values dropped as unreadable or out of range. */
  warnings: string[];
}

const MAX_TEXT = 200;

/** A scalar from a record, as text. Numbers are kept; objects, lists and booleans are not values. */
function scalar(value: unknown): string | number | null {
  if (typeof value === "string") {
    const text = cleanInline(value);
    return text ? text.slice(0, MAX_TEXT * 5) : null;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The first non-empty scalar among a key's paths. */
function pick(
  record: unknown,
  mapping: ReferenceMapping,
  key: ReferenceKey,
): string | number | null {
  for (const path of mapping.fields[key] ?? []) {
    const value = scalar(readPath(record, path));
    if (value !== null) return value;
  }
  return null;
}

const text = (value: string | number | null): string | null =>
  value === null ? null : cleanInline(String(value)).slice(0, MAX_TEXT) || null;

/**
 * Reads a color cell as hex. Words that happen to be valid hex digits ("Face", "Deaf") are not
 * colors, so a bare value must be 6 or 8 digits (or carry `#` or `0x`); only a column known to hold
 * hex may use the 3 and 4 digit shorthand.
 */
export function hexFromCell(value: string | number | null, strict: boolean): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const marked = /^(#|0x)/i.test(trimmed);
  const bare = trimmed.replace(/^(#|0x)/i, "");
  if (!/^[0-9a-f]+$/i.test(bare)) return null;
  if (!marked && strict && !/^[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(bare)) return null;
  return normalizeHex(trimmed)?.hex ?? null;
}

/** `rgb(255, 0, 0)` and `255,0,0` as hex. */
function hexFromRgb(value: string): string | null {
  const match =
    /^(?:rgba?\()?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/ ]\s*[\d.]+%?\s*)?\)?$/i.exec(
      value.trim(),
    );
  if (!match) return null;
  const channels = [match[1], match[2], match[3]].map(Number);
  if (channels.some((channel) => channel > 255)) return null;
  return channels
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function colorFromCell(value: string | number | null, strict: boolean): string | null {
  if (typeof value !== "string") return null;
  return hexFromCell(value, strict) ?? hexFromRgb(value);
}

function numberCell(value: string | number | null): number | null {
  if (typeof value === "number") return value;
  if (value === null) return null;
  const parsed = parseDecimal(value);
  return parsed ? parsed.value : null;
}

function temperature(
  value: string | number | null,
  range: readonly [number, number],
  label: string,
  warnings: string[],
): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? { celsius: value } : parseTemperature(value);
  if (!parsed || !inRange(parsed.celsius, range)) {
    warnings.push(`${label} ${JSON.stringify(value)} was not a usable temperature.`);
    return null;
  }
  return Math.round(parsed.celsius);
}

/** `190-220`, `190 – 220 °C`, `190 to 220`: the two ends in Celsius, or `null`. */
export function parseTemperatureRange(
  input: string | number | null,
): { min: number; max: number } | null {
  if (typeof input !== "string") return null;
  const match =
    /^\s*(\d{1,3}(?:[.,]\d+)?)\s*(?:°|º)?\s*([CF])?\s*(?:-|–|—|~|\/|to|\.\.)\s*(\d{1,3}(?:[.,]\d+)?)\s*(?:°|º)?\s*([CF])?\s*$/i.exec(
      input,
    );
  if (!match) return null;
  const unit = (match[4] ?? match[2] ?? "C").toUpperCase();
  const convert = (raw: string) => {
    const value = Number(raw.replace(",", "."));
    return Math.round(unit === "F" ? ((value - 32) * 5) / 9 : value);
  };
  const [a, b] = [convert(match[1]!), convert(match[3]!)];
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

/**
 * Grams from a weight cell. Text that names a unit ("1 kg") is converted by `parseWeight`; a bare
 * number is read in the mapping's unit, where `auto` takes 10 or less as kilograms (no spool or
 * empty spool weighs that little in grams).
 */
function weight(
  value: string | number | null,
  mapping: ReferenceMapping,
  range: readonly [number, number],
  label: string,
  warnings: string[],
): number | null {
  if (value === null) return null;
  const reject = (): null => {
    warnings.push(`${label} ${JSON.stringify(value)} was not a usable weight.`);
    return null;
  };
  let grams: number;
  if (typeof value === "number") grams = value;
  else {
    const parsed = parseWeight(value);
    if (!parsed) return reject();
    if (parsed.unit !== null) return inRange(parsed.grams, range) ? parsed.grams : reject();
    // The exact number, because `parsed.grams` is rounded for grams and this may yet be kilograms.
    grams = numberCell(value) ?? parsed.grams;
  }
  if (mapping.weightUnit === "kg" || (mapping.weightUnit === "auto" && grams > 0 && grams <= 10))
    grams *= 1000;
  grams = Math.round(grams * 10) / 10;
  return inRange(grams, range) ? grams : reject();
}

function httpsUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Turns one provider or file record into a `ReferenceFilament`. Values that cannot be read are left
 * empty with a warning, never guessed; a record with neither a brand nor a barcode, or with nothing
 * to describe the filament, is skipped.
 */
export function normalizeReferenceRecord(
  record: unknown,
  mapping: ReferenceMapping,
  context: RecordContext,
): NormalizedRecord {
  const warnings: string[] = [];
  if (record === null || typeof record !== "object" || Array.isArray(record))
    return { filament: null, warnings: ["Not an object."] };

  const vendor = text(pick(record, mapping, "vendor"));
  let productName = text(pick(record, mapping, "name"));

  // The color name is a name: a hex value in the same column is the color, not its name.
  let colorName: string | null = null;
  for (const path of mapping.fields.colorName ?? []) {
    const value = scalar(readPath(record, path));
    if (typeof value === "string" && !colorFromCell(value, true)) {
      colorName = text(value);
      break;
    }
  }

  let colorHexes: string[] = [];
  let colorHex: string | null = null;
  for (const path of mapping.fields.colorHex ?? []) {
    // Only a column named for hex may use the 3 digit shorthand; "color" might hold a word.
    const hexColumn = /hex|^rgb$|colou?rcode/.test(fieldKey(path));
    const found = colorFromCell(scalar(readPath(record, path)), !hexColumn);
    if (found) {
      colorHex = found;
      break;
    }
  }
  for (const path of mapping.fields.colorHexes ?? []) {
    const raw = readPath(record, path);
    const items = Array.isArray(raw)
      ? raw.map((item) => (typeof item === "string" ? item : ""))
      : typeof raw === "string"
        ? raw.split(/[\s,;|]+/)
        : [];
    const hexes = items
      .map((item) => colorFromCell(item.trim() || null, false))
      .filter((hex): hex is string => hex !== null);
    if (hexes.length) {
      colorHexes = hexes;
      break;
    }
  }
  if (colorHexes.length) colorHex = colorHexes[0]!;
  else if (colorHex) colorHexes = [colorHex];

  let material: string | null = null;
  const rawMaterial = text(pick(record, mapping, "material"));
  if (rawMaterial) {
    const parsed = parseMaterial(rawMaterial);
    if (parsed) {
      material = formatMaterial(parsed, false);
      // A finish ("Silk") belongs to the product, not the polymer; keep it where matching sees it.
      const missing = parsed.variants.filter(
        (variant) => !productName || !nameMentions(productName, variant),
      );
      if (missing.length) productName = [...missing, productName].filter(Boolean).join(" ");
    } else material = rawMaterial;
  }

  const barcodeRaw = text(pick(record, mapping, "barcode"));
  const barcode = barcodeRaw ? normalizeBarcode(barcodeRaw) : null;
  if (barcodeRaw && !barcode)
    warnings.push(`Barcode ${JSON.stringify(barcodeRaw)} was not usable.`);

  if (!vendor && !barcode)
    return {
      filament: null,
      warnings: [...warnings, "No brand or barcode, so it cannot be matched."],
    };
  if (!productName && !colorName && !colorHex && !material)
    return {
      filament: null,
      warnings: [...warnings, `${vendor ?? barcode} has nothing that describes a filament.`],
    };

  const diameterRaw = pick(record, mapping, "diameter");
  let diameter: number | null = null;
  if (diameterRaw !== null) {
    diameter = typeof diameterRaw === "number" ? diameterRaw : parseDiameter(diameterRaw);
    if (diameter === null || !inRange(diameter, DIAMETER_RANGE)) {
      warnings.push(`Diameter ${JSON.stringify(diameterRaw)} was not usable.`);
      diameter = null;
    }
  }
  const densityRaw = numberCell(pick(record, mapping, "density"));
  let density: number | null = null;
  if (densityRaw !== null) {
    if (inRange(densityRaw, DENSITY_RANGE)) density = densityRaw;
    else warnings.push(`Density ${densityRaw} was not usable.`);
  }

  let nozzleTempMin = temperature(
    pick(record, mapping, "nozzleTempMin"),
    NOZZLE_RANGE,
    "Nozzle temperature",
    warnings,
  );
  let nozzleTempMax = temperature(
    pick(record, mapping, "nozzleTempMax"),
    NOZZLE_RANGE,
    "Nozzle temperature",
    warnings,
  );
  let bedTempMin = temperature(
    pick(record, mapping, "bedTempMin"),
    BED_RANGE,
    "Bed temperature",
    warnings,
  );
  let bedTempMax = temperature(
    pick(record, mapping, "bedTempMax"),
    BED_RANGE,
    "Bed temperature",
    warnings,
  );
  // A written range fills only the ends the record does not state itself.
  const nozzleRange = parseTemperatureRange(pick(record, mapping, "nozzleTempRange"));
  if (
    nozzleRange &&
    inRange(nozzleRange.min, NOZZLE_RANGE) &&
    inRange(nozzleRange.max, NOZZLE_RANGE)
  ) {
    nozzleTempMin ??= nozzleRange.min;
    nozzleTempMax ??= nozzleRange.max;
  }
  const bedRange = parseTemperatureRange(pick(record, mapping, "bedTempRange"));
  if (bedRange && inRange(bedRange.min, BED_RANGE) && inRange(bedRange.max, BED_RANGE)) {
    bedTempMin ??= bedRange.min;
    bedTempMax ??= bedRange.max;
  }
  if (nozzleTempMin !== null && nozzleTempMax !== null && nozzleTempMin > nozzleTempMax) {
    warnings.push("Nozzle temperatures were reversed; both were dropped.");
    nozzleTempMin = nozzleTempMax = null;
  }
  if (bedTempMin !== null && bedTempMax !== null && bedTempMin > bedTempMax) {
    warnings.push("Bed temperatures were reversed; both were dropped.");
    bedTempMin = bedTempMax = null;
  }

  const initialWeight = weight(
    pick(record, mapping, "initialWeight"),
    mapping,
    WEIGHT_RANGE,
    "Net weight",
    warnings,
  );
  const emptySpoolWeight = weight(
    pick(record, mapping, "emptySpoolWeight"),
    mapping,
    EMPTY_SPOOL_RANGE,
    "Spool weight",
    warnings,
  );

  const priceRaw = pick(record, mapping, "price");
  let price: number | null = null;
  if (priceRaw !== null) {
    const parsed = typeof priceRaw === "number" ? priceRaw : parsePrice(priceRaw)?.amount;
    if (parsed !== undefined && parsed !== null && inRange(parsed, PRICE_RANGE))
      price = Math.round(parsed * 100) / 100;
    else warnings.push(`Price ${JSON.stringify(priceRaw)} was not usable.`);
  }

  const dryingTempRaw = numberCell(pick(record, mapping, "dryingTemp"));
  const dryingTemp =
    dryingTempRaw !== null && inRange(dryingTempRaw, DRYING_TEMP_RANGE)
      ? Math.round(dryingTempRaw)
      : null;
  const dryingHoursRaw = numberCell(pick(record, mapping, "dryingHours"));
  const dryingHours =
    dryingHoursRaw !== null && inRange(dryingHoursRaw, DRYING_HOURS_RANGE)
      ? Math.round(dryingHoursRaw * 10) / 10
      : null;

  const idRaw = text(pick(record, mapping, "id"));
  const id =
    idRaw ??
    `${context.providerId}:${contentId([vendor, productName, material, colorName, colorHex, barcode, diameter, initialWeight])}`;

  return {
    filament: {
      id,
      providerId: context.providerId,
      providerLabel: context.providerLabel,
      vendor,
      name: productName,
      material,
      colorName,
      colorHex,
      colorHexes,
      diameter,
      density,
      nozzleTempMin,
      nozzleTempMax,
      bedTempMin,
      bedTempMax,
      initialWeight,
      emptySpoolWeight,
      price,
      barcode,
      url: httpsUrl(text(pick(record, mapping, "url"))),
      sourceUrl: httpsUrl(text(pick(record, mapping, "sourceUrl"))),
      imageUrl: httpsUrl(text(pick(record, mapping, "imageUrl"))),
      dryingTemp,
      dryingHours,
      buyLinks: sanitizeBuyLinks(
        (mapping.fields.buyLinks ?? []).map((path) => readPath(record, path)).find(Array.isArray),
      ),
      attribution: context.attribution,
      license: context.license,
    },
    warnings,
  };
}

export interface NormalizedBatch {
  filaments: ReferenceFilament[];
  warnings: string[];
  skipped: number;
}

/**
 * Normalizes many records. Ids are made unique (a repeated id gets `#2`, `#3`, ...) so two rows
 * never share a choice, and the order of the input is kept.
 */
export function normalizeReferenceRecords(
  records: readonly unknown[],
  mapping: ReferenceMapping,
  context: RecordContext,
  /** Row numbers start here, for messages (a CSV file's first data row is 2). */
  firstPosition = 1,
): NormalizedBatch {
  const filaments: ReferenceFilament[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;
  records.forEach((record, index) => {
    const result = normalizeReferenceRecord(record, mapping, context);
    warnings.push(
      ...result.warnings.map((warning) => `Record ${firstPosition + index}: ${warning}`),
    );
    if (!result.filament) {
      skipped += 1;
      return;
    }
    const baseId = result.filament.id;
    let count = (seen.get(baseId) ?? 0) + 1;
    let candidate = count === 1 ? baseId : `${baseId}#${count}`;
    while (count > 1 && seen.has(candidate)) {
      count += 1;
      candidate = `${baseId}#${count}`;
    }
    seen.set(baseId, count);
    seen.set(candidate, 1);
    filaments.push(candidate === baseId ? result.filament : { ...result.filament, id: candidate });
  });
  return { filaments, warnings, skipped };
}
