import type { LoadResult } from "../../core/model";
import { readXlsx, type XlsxCell, type XlsxSheet } from "../shared/xlsx";
import { ZipError } from "../shared/zip";
import { normalizeHeader, spoolmasterToCommon, type SpoolmasterRow } from "./map";

const REQUIRED_HEADERS = ["brand", "material"] as const;

function headerMap(row: readonly XlsxCell[]): Map<string, number> | null {
  const columns = new Map<string, number>();
  row.forEach((cell, index) => {
    const name = normalizeHeader(cell);
    if (name && !columns.has(name)) columns.set(name, index);
  });
  return REQUIRED_HEADERS.every((name) => columns.has(name)) ? columns : null;
}

/** The stock sheet is named "Stock"; otherwise use the first sheet with SpoolMaster's columns. */
function findStockSheet(sheets: readonly XlsxSheet[]): XlsxSheet | undefined {
  const named = sheets.find((sheet) => sheet.name.trim().toLowerCase() === "stock");
  if (named && sheet0Header(named)) return named;
  return sheets.find((sheet) => sheet0Header(sheet));
}

function sheet0Header(sheet: XlsxSheet): Map<string, number> | null {
  return sheet.rows[0] ? headerMap(sheet.rows[0]) : null;
}

/** Loads a SpoolMaster `.xlsx` export (Stock sheet) into common spools. */
export async function loadSpoolmasterXlsx(bytes: Uint8Array): Promise<LoadResult> {
  let sheets: XlsxSheet[];
  try {
    sheets = (await readXlsx(bytes)).sheets;
  } catch (error) {
    if (error instanceof ZipError)
      throw new Error(`${error.message} Export your stock from SpoolMaster as an Excel workbook.`);
    throw error;
  }
  const sheet = findStockSheet(sheets);
  const columns = sheet ? sheet0Header(sheet) : null;
  if (!sheet || !columns)
    throw new Error(
      "This does not look like a SpoolMaster export: no Stock sheet with Brand and Material columns was found.",
    );

  const spools = [];
  const warnings: string[] = [];
  for (let index = 1; index < sheet.rows.length; index++) {
    const cells = sheet.rows[index]!;
    const rowNumber = sheet.rowNumbers[index]!;
    const values: Record<string, XlsxCell> = {};
    for (const [name, column] of columns) values[name] = cells[column] ?? null;
    if (Object.values(values).every((value) => value === null || value === "")) continue;
    const row: SpoolmasterRow = { rowNumber, values };
    const spool = spoolmasterToCommon(row);
    if (!spool.vendor && !spool.material && !spool.name) {
      warnings.push(`Row ${rowNumber}: no brand, material, or color; skipped.`);
      continue;
    }
    spools.push(spool);
  }
  return {
    source: "spoolmaster",
    origin: "file",
    spools,
    warnings,
    loadedAt: new Date().toISOString(),
  };
}
