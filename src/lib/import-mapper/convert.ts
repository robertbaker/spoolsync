import { csvInput, csvText } from "@spoolsync/core/adapters/shared/tabular";
import Papa from "papaparse";

import {
  GRAMS_PER_UNIT,
  validateMapping,
  type ColumnMapping,
  type MapField,
  type MapWeightUnit,
} from "./fields";

/**
 * Turns a CSV or JSON file SpoolSync does not recognise into a Spoolman-format CSV, using a column
 * mapping the person confirmed. The result is a file to download, not an inventory: it is never
 * loaded as a service of its own (see docs/architecture.md, "Generic import column mapper").
 * Reasons are written in English, like every importer warning.
 */

export const MAX_MAPPER_ROWS = 50_000;
const MAX_COLUMNS = 200;
const MAX_FLATTEN_DEPTH = 3;
const RECORD_KEYS = [
  "spools",
  "items",
  "data",
  "filaments",
  "inventory",
  "records",
  "rows",
  "results",
];

/**
 * One record, keyed by column header. The prototype is null so a header such as `__proto__` is just
 * a name.
 */
export type SourceRow = Record<string, string>;

export interface SourceTable {
  kind: "csv" | "json";
  headers: string[];
  rows: SourceRow[];
}

const newRow = (): SourceRow => Object.create(null) as SourceRow;

// ---- Reading a source file ------------------------------------------------------------------

function parseCsvTable(text: string): SourceTable {
  const input = csvInput(text);
  const parsed = Papa.parse<string[]>(input.text, {
    delimiter: input.delimiter,
    header: false,
    skipEmptyLines: true,
  });
  const fatal = parsed.errors.find((error) => error.type === "Quotes");
  if (fatal) throw new Error(`The CSV has an unclosed quote near row ${(fatal.row ?? 0) + 1}.`);
  const [headerRow, ...dataRows] = parsed.data;
  if (!headerRow || !headerRow.length) throw new Error("The file is empty.");
  const headers = headerRow.map((header) => String(header ?? "").trim());
  if (headers.some((header) => !header))
    throw new Error("The CSV has an unnamed column. Give each column a name and try again.");
  if (new Set(headers).size !== headers.length)
    throw new Error(
      "The CSV has duplicate column names. Give each column a unique name and try again.",
    );
  if (headers.length > MAX_COLUMNS)
    throw new Error(`The CSV has more than ${MAX_COLUMNS} columns.`);
  if (!dataRows.length) throw new Error("The file has a header but no rows.");
  if (dataRows.length > MAX_MAPPER_ROWS)
    throw new Error(`The file has more than ${MAX_MAPPER_ROWS.toLocaleString("en")} rows.`);
  const rows = dataRows.map((cells) => {
    const row = newRow();
    headers.forEach((header, index) => {
      row[header] = String(cells[index] ?? "").trim();
    });
    return row;
  });
  return { kind: "csv", headers, rows };
}

function flatten(value: unknown, prefix: string, depth: number, into: SourceRow): void {
  if (value === null || value === undefined) {
    if (prefix) into[prefix] = "";
    return;
  }
  if (typeof value !== "object") {
    if (prefix) into[prefix] = String(value).trim();
    return;
  }
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || typeof item !== "object")) {
      into[prefix] = value
        .filter((item) => item !== null && item !== undefined)
        .map((item) => String(item).trim())
        .join("; ");
      return;
    }
    if (depth >= MAX_FLATTEN_DEPTH) return;
    value.forEach((item, index) =>
      flatten(item, prefix ? `${prefix}.${index}` : String(index), depth + 1, into),
    );
    return;
  }
  if (depth >= MAX_FLATTEN_DEPTH) return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>))
    flatten(item, prefix ? `${prefix}.${key}` : key, depth + 1, into);
}

function recordList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const container = value as Record<string, unknown>;
    for (const key of RECORD_KEYS) {
      const candidate = Object.hasOwn(container, key) ? container[key] : undefined;
      if (Array.isArray(candidate)) return candidate;
    }
    const first = Object.values(container).find(
      (candidate) =>
        Array.isArray(candidate) &&
        candidate.some((item) => item && typeof item === "object" && !Array.isArray(item)),
    );
    if (Array.isArray(first)) return first;
  }
  throw new Error(
    "The JSON has no list of records. Expect an array of objects, or an object holding one.",
  );
}

function parseJsonTable(text: string): SourceTable {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  const records = recordList(value).filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === "object" && !Array.isArray(item),
  );
  if (!records.length) throw new Error("The JSON list has no records.");
  if (records.length > MAX_MAPPER_ROWS)
    throw new Error(`The file has more than ${MAX_MAPPER_ROWS.toLocaleString("en")} records.`);
  const headers: string[] = [];
  const seen = new Set<string>();
  const rows = records.map((record, index) => {
    const row = newRow();
    flatten(record, "", 0, row);
    for (const header of Object.keys(row)) {
      // Headers come from the first records, which is enough to describe a list of similar records.
      if (index < 500 && !seen.has(header) && headers.length < MAX_COLUMNS) {
        seen.add(header);
        headers.push(header);
      }
    }
    return row;
  });
  if (!headers.length) throw new Error("The JSON records have no fields to map.");
  for (const row of rows)
    for (const header of headers) if (!Object.hasOwn(row, header)) row[header] = "";
  return { kind: "json", headers, rows };
}

/** Reads a CSV or JSON file into headers and rows, or throws a message fit for the person. */
export function parseSourceTable(text: string): SourceTable {
  const clean = text.replace(/^﻿/, "");
  if (!clean.trim()) throw new Error("The file is empty.");
  return /^\s*[[{]/.test(clean) ? parseJsonTable(clean) : parseCsvTable(clean);
}

// ---- Reading values -------------------------------------------------------------------------

/**
 * Reads a number the way people write it: `1,234.5`, `1.234,5`, `12,5`, `$20`, `850 g`, `20 €`.
 * Returns null for anything else, including `1e3` and text with digits mixed into words.
 */
export function parseLooseNumber(raw: string): number | null {
  let text = raw
    .trim()
    .replace(/^[^\d+\-.,]+/, "")
    .replace(/[^\d]+$/, "");
  if (!text || !/^[+-]?[\d.,\s'’]+$/.test(text)) return null;
  text = text.replace(/[\s'’]/g, "");
  const sign = text.startsWith("-") ? -1 : 1;
  text = text.replace(/^[+-]/, "");
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    normalized = text.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    const parts = text.split(",");
    const last = parts.at(-1)!;
    // "1,234" reads as a thousands group; "0,125" and "12,5" are decimals.
    const thousands =
      parts.length > 2 || (last.length === 3 && parts[0] !== "0" && parts[0]!.length <= 3);
    normalized = thousands ? parts.join("") : `${parts.slice(0, -1).join("")}.${last}`;
  } else {
    const parts = text.split(".");
    normalized = parts.length > 2 ? parts.join("") : text;
  }
  if (!/^\d*\.?\d+$|^\d+\.$/.test(normalized)) return null;
  const value = Number(normalized) * sign;
  return Number.isFinite(value) ? value : null;
}

/**
 * `RRGGBB` (upper case) from `#FF0000`, `ff0000`, `#f00`, `0xFF0000` or `#FF0000CC`; null
 * otherwise.
 */
export function parseHexColor(raw: string): string | null {
  const text = raw.trim().replace(/^#|^0x/i, "");
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(text)) return text.slice(0, 6).toUpperCase();
  if (/^[0-9a-f]{3}$/i.test(text))
    return [...text]
      .map((digit) => digit + digit)
      .join("")
      .toUpperCase();
  return null;
}

const TRUE_WORDS = new Set(["true", "yes", "y", "1", "x", "archived", "finished", "empty", "done"]);
const FALSE_WORDS = new Set(["false", "no", "n", "0", "active", "in use"]);

/** True, false, or null when the text is neither (a blank counts as false). */
export function parseFlag(raw: string): boolean | null {
  const text = raw.trim().toLowerCase();
  if (!text || FALSE_WORDS.has(text)) return false;
  return TRUE_WORDS.has(text) ? true : null;
}

/** Spoolman's CSV escape: text a spreadsheet would run as a formula gets a leading apostrophe. */
function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

// ---- Converting -----------------------------------------------------------------------------

export interface ConvertNote {
  /** 1-based number of the record: the first data row (or JSON record) is row 1. */
  row: number;
  reason: string;
}

export interface ConvertResult {
  csv: string;
  rowsRead: number;
  spoolCount: number;
  /** For each converted spool in order, the source row it came from. */
  sourceRows: number[];
  skipped: ConvertNote[];
  changed: ConvertNote[];
}

export interface ConvertOptions {
  weightUnit: MapWeightUnit;
}

const COLUMNS = [
  "id",
  "price",
  "initial_weight",
  "spool_weight",
  "remaining_weight",
  "location",
  "lot_nr",
  "comment",
  "archived",
  "filament.id",
  "filament.name",
  "filament.vendor.id",
  "filament.vendor.name",
  "filament.material",
  "filament.density",
  "filament.diameter",
  "filament.weight",
  "filament.color_hex",
  "filament.multi_color_hexes",
  "filament.multi_color_direction",
  "filament.article_number",
] as const;

const FIELD_NAMES: Record<MapField, string> = {
  vendor: "brand",
  material: "material",
  name: "name",
  color: "color",
  remainingWeight: "remaining weight",
  usedWeight: "used weight",
  initialWeight: "full spool weight",
  emptySpoolWeight: "empty spool weight",
  price: "price",
  location: "location",
  lotNr: "lot",
  comment: "notes",
  archived: "archived",
  diameter: "diameter",
  density: "density",
  articleNumber: "article number",
};

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

/**
 * Converts the rows with a confirmed mapping. Rows that cannot become a spool are listed with the
 * reason; values that had to be dropped or reinterpreted are listed as adjustments. Throws when the
 * mapping itself is invalid, so a bad mapping can never produce a file.
 */
export function convertToSpoolmanCsv(
  table: SourceTable,
  mapping: ColumnMapping,
  options: ConvertOptions,
): ConvertResult {
  const check = validateMapping(mapping, table.headers);
  if (check.problems.length)
    throw new Error("The column mapping has problems; fix them before converting.");

  const skipped: ConvertNote[] = [];
  const changed: ConvertNote[] = [];
  const sourceRows: number[] = [];
  const output: Record<string, string | number>[] = [];
  const filamentIds = new Map<string, number>();
  const vendorIds = new Map<string, number>();
  const factor = GRAMS_PER_UNIT[options.weightUnit];

  table.rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const cell = (field: MapField): string => {
      const header = mapping[field];
      return header !== undefined && Object.hasOwn(row, header) ? (row[header] ?? "").trim() : "";
    };
    const note = (reason: string) => changed.push({ row: rowNumber, reason });
    const number = (
      field: MapField,
      accept: (value: number) => boolean,
      why: string,
    ): number | null => {
      const raw = cell(field);
      if (!raw) return null;
      const value = parseLooseNumber(raw);
      if (value === null) {
        note(`${FIELD_NAMES[field]} "${raw.slice(0, 40)}" is not a number; left empty.`);
        return null;
      }
      if (!accept(value)) {
        note(`${FIELD_NAMES[field]} ${why}; left empty.`);
        return null;
      }
      return value;
    };
    const grams = (field: MapField): number | null => {
      const value = number(field, (candidate) => candidate >= 0, "is negative");
      return value === null ? null : round(value * factor);
    };

    const vendor = cell("vendor");
    const material = cell("material");
    const name = cell("name");
    const mapped = (Object.keys(mapping) as MapField[]).some((field) => cell(field));
    if (!mapped) {
      skipped.push({ row: rowNumber, reason: "Every mapped column is empty." });
      return;
    }
    if (!vendor && !material && !name) {
      skipped.push({
        row: rowNumber,
        reason: "No brand, material, or name, so the spool cannot be told apart.",
      });
      return;
    }

    const initial = grams("initialWeight");
    const empty = grams("emptySpoolWeight");
    let remaining = grams("remainingWeight");
    let used = grams("usedWeight");
    if (remaining !== null && used !== null) used = null;
    if (used !== null && initial === null) {
      note(
        "used weight needs a full spool weight to work out what is left; remaining weight left unknown.",
      );
      used = null;
    }
    if (used !== null && initial !== null) {
      if (used > initial)
        note("used weight is more than the full spool weight; remaining weight set to 0.");
      // Spoolman's importer rejects an empty `used_weight` cell, so the converter works it out here.
      remaining = round(Math.max(0, initial - used));
    }

    const colors: string[] = [];
    const rawColor = cell("color");
    if (rawColor) {
      for (const part of rawColor.split(/[\s,;/|]+/).filter(Boolean)) {
        const hex = parseHexColor(part);
        if (hex) colors.push(hex);
        else note(`color "${part.slice(0, 20)}" is not a hex color; ignored.`);
      }
    }

    const flagText = cell("archived");
    const archived = parseFlag(flagText);
    if (archived === null)
      note(`archived "${flagText.slice(0, 20)}" is not yes or no; treated as not archived.`);

    const price = number("price", (value) => value >= 0, "is negative");
    const diameter = number(
      "diameter",
      (value) => value > 0 && value <= 10,
      "is outside 0 to 10 mm",
    );
    const density = number(
      "density",
      (value) => value > 0 && value <= 30,
      "is outside 0 to 30 g/cm3",
    );

    const filamentKey = [
      vendor,
      material,
      name,
      colors.join(","),
      diameter ?? "",
      density ?? "",
      cell("articleNumber"),
      initial ?? "",
    ].join("\u0000");
    let filamentId = filamentIds.get(filamentKey);
    if (filamentId === undefined) {
      filamentId = filamentIds.size + 1;
      filamentIds.set(filamentKey, filamentId);
    }
    let vendorId: number | "" = "";
    if (vendor) {
      const key = vendor.toLowerCase();
      let existing = vendorIds.get(key);
      if (existing === undefined) {
        existing = vendorIds.size + 1;
        vendorIds.set(key, existing);
      }
      vendorId = existing;
    }

    sourceRows.push(rowNumber);
    output.push({
      id: output.length + 1,
      price: price ?? "",
      initial_weight: initial ?? "",
      spool_weight: empty ?? "",
      remaining_weight: remaining ?? "",
      location: safeText(cell("location")),
      lot_nr: safeText(cell("lotNr")),
      comment: safeText(cell("comment")),
      archived: archived ? "true" : "false",
      "filament.id": filamentId,
      "filament.name": safeText(name),
      "filament.vendor.id": vendorId,
      "filament.vendor.name": safeText(vendor),
      "filament.material": safeText(material),
      "filament.density": density ?? "",
      "filament.diameter": diameter ?? "",
      "filament.weight": initial ?? "",
      "filament.color_hex": colors[0] ?? "",
      "filament.multi_color_hexes": colors.length > 1 ? colors.join(",") : "",
      "filament.multi_color_direction": colors.length > 1 ? "coaxial" : "",
      "filament.article_number": safeText(cell("articleNumber")),
    });
  });

  return {
    csv: csvText(output, COLUMNS),
    rowsRead: table.rows.length,
    spoolCount: output.length,
    sourceRows,
    skipped,
    changed,
  };
}

/** A few distinct non-empty example values per column, for the mapping table. */
export function sampleValues(table: SourceTable, header: string, count = 3): string[] {
  const samples: string[] = [];
  for (const row of table.rows) {
    const value = Object.hasOwn(row, header) ? (row[header] ?? "") : "";
    if (value && !samples.includes(value))
      samples.push(value.length > 40 ? `${value.slice(0, 39)}…` : value);
    if (samples.length >= count) break;
  }
  return samples;
}
