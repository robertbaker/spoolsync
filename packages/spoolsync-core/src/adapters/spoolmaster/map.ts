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

function text(value: XlsxCell | undefined): string | null {
  if (typeof value === "number") return String(value);
  return toText(value);
}

function date(value: XlsxCell | undefined): string | null {
  if (typeof value === "number") return excelSerialToDate(value);
  return toDate(value);
}

export function spoolmasterToCommon(row: SpoolmasterRow): CommonSpool {
  const { values } = row;
  const id = `row-${row.rowNumber}`;
  const initialWeight = toPositiveNumber(values["initial weight"]);
  const percent = toNonNegativeNumber(values["remaining"]);
  let remainingWeight = toNonNegativeNumber(values["remaining weight"]);
  if (remainingWeight === null && initialWeight !== null && percent !== null)
    remainingWeight = Math.round((initialWeight * Math.min(percent, 100)) / 100);
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
    price: toNonNegativeNumber(values["price"]),
    purchasedOn: date(values["date added"]),
    lotNr: text(values["batch / sku"]),
    comment: text(values["notes"]),
    archived: false,
    raw: { row: row.rowNumber, ...values },
  };
}
