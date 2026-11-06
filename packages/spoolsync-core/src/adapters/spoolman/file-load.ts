import Papa from "papaparse";

import type { LoadResult } from "../../core/model";
import { csvInput, strictHeaders, validateCsv } from "../shared/tabular";
import { spoolmanToCommon } from "./map";
import { SpoolSchema } from "./schema";
import { unflatten } from "./unflatten";
export { unflatten } from "./unflatten";

/**
 * Spoolman inventories as files, for when the server is out of reach or the user just has an
 * export.
 *
 * Reads:
 *
 * - API-shaped JSON: an array of spools with nested `filament` and `vendor` (what `GET /api/v1/spool`
 *   returns), or `{ "spools": [...] }` (what `tools/tigertag` accepts).
 * - Spoolman's own export (Settings → Export, or `GET /api/v1/export/spools`) in JSON or CSV: one
 *   flat object per spool with dot-separated keys (`filament.vendor.name`, `extra.<key>`) and no
 *   `remaining_weight`, which is derived from `initial_weight - used_weight`.
 *
 * Writes API-shaped JSON, the form other tools read.
 */

function isRowFlat(row: unknown): boolean {
  if (!row || typeof row !== "object") return false;
  for (const key in row as Record<string, unknown>) {
    if (key.startsWith("filament.")) return true;
  }
  return false;
}

/**
 * Spoolman exports spools, filaments and vendors separately. Only the spool export holds inventory,
 * so name the other two instead of reporting every row as invalid.
 */
function wrongExport(keys: string[]): string | undefined {
  if (keys.some((key) => key === "filament" || key.startsWith("filament."))) return undefined;
  const has = (...names: string[]) => names.some((name) => keys.includes(name));
  const kind = has("material", "density", "diameter", "vendor", "vendor.name", "vendor_id")
    ? "filament"
    : has("name") && has("empty_spool_weight", "external_id")
      ? "vendor"
      : undefined;
  return kind
    ? `This looks like a Spoolman ${kind} export, which holds no spools. Export the spools list instead (Settings → Export → Spools).`
    : undefined;
}

function parseRows(text: string): unknown[] {
  const stripped = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const trimmed = stripped.trimStart();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error("This file is not valid JSON.");
    }
    const spools = Array.isArray(parsed) ? parsed : (parsed as { spools?: unknown }).spools;
    if (!Array.isArray(spools))
      throw new Error('A Spoolman JSON file must be a list of spools or {"spools": [...]}.');
    const first: unknown = spools[0];
    if (first && typeof first === "object") {
      const message = wrongExport(Object.keys(first));
      if (message) throw new Error(message);
    }
    return spools;
  }
  const input = csvInput(trimmed);
  const csv = Papa.parse<Record<string, string>>(input.text, {
    delimiter: input.delimiter,
    header: true,
    transformHeader: strictHeaders(),
    skipEmptyLines: "greedy",
  });
  validateCsv(csv);
  if (!csv.meta.fields?.some((field) => field.startsWith("filament."))) {
    const message = wrongExport(csv.meta.fields ?? []);
    if (message) throw new Error(message);
    throw new Error("This does not look like a Spoolman export: there are no filament.* columns.");
  }
  return csv.data;
}

export interface SpoolmanFileLoadResult extends LoadResult {
  origin: "file";
}

export function loadSpoolmanFile(text: string): SpoolmanFileLoadResult {
  const stripped = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const trimmed = stripped.trimStart();
  const spreadsheetEscapes = !trimmed.startsWith("[") && !trimmed.startsWith("{");
  const rows = parseRows(text);
  const warnings: string[] = [];
  const spools = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    let candidate: unknown;
    try {
      candidate = isRowFlat(row)
        ? unflatten(row as Record<string, unknown>, spreadsheetEscapes)
        : row;
    } catch (error) {
      warnings.push(
        `Spool ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    const parsed = SpoolSchema.safeParse(candidate);
    if (parsed.success) {
      spools.push(spoolmanToCommon(parsed.data));
    } else {
      warnings.push(
        `Spool ${index + 1}: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join(", ")}`,
      );
    }
  }
  return {
    source: "spoolman",
    origin: "file",
    spools,
    warnings,
    loadedAt: new Date().toISOString(),
  };
}
