import { field, parseTable } from "../shared/tabular";
import { mapRecord } from "./map";
import { CSV_COLUMNS, type FiladexRecord, type FiladexLoadResult } from "./types";

const isRecord = (value: unknown): value is FiladexRecord =>
  !!value && typeof value === "object" && !Array.isArray(value) && "material" in value;

export function loadFiladexFile(text: string): FiladexLoadResult {
  const warnings: string[] = [];
  let records: FiladexRecord[];
  if (/^\s*[[{]/.test(text)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("This is not valid Filadex JSON. Export again from Filadex and retry.");
    }
    if (!Array.isArray(parsed))
      throw new Error("This does not look like a Filadex export: expected a list of filaments.");
    records = parsed.filter((entry, index) => {
      if (isRecord(entry)) return true;
      warnings.push(`Filament ${index + 1}: not a Filadex filament record.`);
      return false;
    });
  } else {
    const { rows, headers } = parseTable(text);
    if (!headers.includes("colorname") || !headers.includes("material"))
      throw new Error("This CSV does not include Filadex's material and colorName columns.");
    records = rows.map((row, index) => ({
      id: `csv-${index + 1}`,
      ...Object.fromEntries(
        CSV_COLUMNS.map((column) => [column, field(row, column) ?? ""] as const),
      ),
    }));
  }
  return {
    source: "filadex",
    origin: "file",
    file: records,
    spools: records.map(mapRecord),
    warnings,
    loadedAt: new Date().toISOString(),
  };
}
