import { field, parseTable } from "../shared/tabular";
import { mapRecord } from "./map";
import { CSV_COLUMNS, type FiladexRecord, type FiladexLoadResult } from "./types";

const isRecord = (value: unknown): value is FiladexRecord =>
  !!value && typeof value === "object" && !Array.isArray(value) && "material" in value;

function result(records: FiladexRecord[], warnings: string[]): FiladexLoadResult {
  return {
    source: "filadex",
    origin: "file",
    file: records,
    spools: records.map(mapRecord),
    warnings,
    loadedAt: new Date().toISOString(),
  };
}

/**
 * Loads already-parsed Filadex JSON (the list a server returned), through the same validation and
 * mapping as {@link loadFiladexFile}, without serialising it to text and parsing it again.
 */
export function loadFiladexRecords(parsed: unknown): FiladexLoadResult {
  if (!Array.isArray(parsed))
    throw new Error("This does not look like a Filadex export: expected a list of filaments.");
  const warnings: string[] = [];
  const records = parsed.filter((entry, index) => {
    if (isRecord(entry)) return true;
    warnings.push(`Filament ${index + 1}: not a Filadex filament record.`);
    return false;
  });
  return result(records, warnings);
}

export function loadFiladexFile(text: string): FiladexLoadResult {
  if (/^\s*[[{]/.test(text)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("This is not valid Filadex JSON. Export again from Filadex and retry.");
    }
    return loadFiladexRecords(parsed);
  }
  const { rows, headers } = parseTable(text);
  if (!headers.includes("colorname") || !headers.includes("material"))
    throw new Error("This CSV does not include Filadex's material and colorName columns.");
  const records = rows.map((row, index) => {
    const record: Record<string, unknown> = { id: `csv-${index + 1}` };
    for (let i = 0; i < CSV_COLUMNS.length; i++) {
      const column = CSV_COLUMNS[i]!;
      record[column] = field(row, column) ?? "";
    }
    return record as unknown as FiladexRecord;
  });
  return result(records, []);
}
