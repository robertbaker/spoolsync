import type { CommonSpool } from "../../core/model";
import {
  toDate,
  toNonNegativeNumber,
  toPositiveNumber,
  toText,
  uniqueHexes,
} from "../../core/normalize";
import { excelSerialToDate, type XlsxCell } from "../shared/xlsx";

/** One data row keyed by normalized header (`"initial weight"`, `"extruder min"`, ...). */
export interface SpoolmasterRow {
  /** 1-based worksheet row, used to build a stable per-file ID. */
  rowNumber: number;
  values: Record<string, XlsxCell>;
}

/** Lowercases a header and drops units and currency, so `Price (CHF)` becomes `price`. */
export function normalizeHeader(header: XlsxCell): string {
  return String(header ?? "")
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The key a column is read under. Like `normalizeHeader`, except a bare "Remaining" whose unit is
 * grams ("Remaining (g)") is a weight, not a percentage.
 */
export function columnKey(header: XlsxCell): string {
  const name = normalizeHeader(header);
  if (name === "remaining" && /\(\s*(g|gr|grams?)\s*\)/i.test(String(header)))
    return "remaining weight";
  return name;
}

/**
 * Numeric columns whose unit suffix changes meaning ("Remaining (g)" vs "Remaining (%)", prices in
 * two currencies). Two of these colliding is ambiguous, so the file is refused; any other duplicate
 * column (Notes, Location, ...) is harmless and the first one wins.
 */
export const AMBIGUOUS_HEADERS: ReadonlySet<string> = new Set([
  "initial weight",
  "remaining weight",
  "remaining",
  "price",
  "price / kg",
  "diameter",
  "extruder min",
  "extruder max",
  "bed min",
  "bed max",
]);

function text(value: XlsxCell | undefined): string | null {
  if (typeof value === "number") return String(value);
  return toText(value);
}

function date(value: XlsxCell | undefined): string | null {
  if (typeof value === "number") return excelSerialToDate(value);
  return toDate(value);
}

/**
 * Excel stores percent-formatted cells as fractions (50% is 0.5) but plain numbers as typed (50).
 * The workbook reader cannot tell them apart, so values above 1 are percentage points and values
 * from 0 up to 1 are fractions. A 1 or a fraction is therefore reported, because it could also be a
 * literal 1% or 0.5%.
 */
function remainingFraction(
  percent: number,
  rowNumber: number,
  warnings: string[] | undefined,
): number {
  if (percent > 1) return Math.min(percent, 100) / 100;
  if (percent > 0)
    warnings?.push(
      `Row ${rowNumber}: Remaining ${percent} is read as ${Math.round(percent * 10000) / 100}% (Excel stores percent cells as fractions); check this row if it meant ${percent}%.`,
    );
  return percent;
}

export function spoolmasterToCommon(row: SpoolmasterRow, warnings?: string[]): CommonSpool {
  const { values } = row;
  const id = `row-${row.rowNumber}`;
  const initialWeight = toPositiveNumber(values["initial weight"]);
  const percent = toNonNegativeNumber(values["remaining"]);
  let remainingWeight = toNonNegativeNumber(values["remaining weight"]);
  if (remainingWeight === null && initialWeight !== null && percent !== null)
    remainingWeight = Math.round(
      initialWeight * remainingFraction(percent, row.rowNumber, warnings),
    );
  let price = toNonNegativeNumber(values["price"]);
  const perKilo = toNonNegativeNumber(values["price / kg"]);
  if (price === null && perKilo !== null && initialWeight !== null)
    price = Math.round(((perKilo * initialWeight) / 1000) * 100) / 100;
  return {
    source: "spoolmaster",
    sourceId: id,
    crossIds: { spoolmasterId: id },
    vendor: text(values["brand"]),
    material: text(values["material"]),
    name: text(values["color"]),
    colors: uniqueHexes([values["color code"]]),
    diameter: toPositiveNumber(values["diameter"]),
    density: null,
    nozzleTempMin: toPositiveNumber(values["extruder min"]),
    nozzleTempMax: toPositiveNumber(values["extruder max"]),
    bedTempMin: toPositiveNumber(values["bed min"]),
    bedTempMax: toPositiveNumber(values["bed max"]),
    upc: null,
    initialWeight,
    remainingWeight,
    emptySpoolWeight: null,
    location: text(values["location"]),
    price,
    purchasedOn: date(values["date added"]),
    lotNr: text(values["batch / sku"]),
    finish: null,
    td: null,
    comment: text(values["notes"]),
    archived: false,
    raw: { row: row.rowNumber, ...values },
  };
}
