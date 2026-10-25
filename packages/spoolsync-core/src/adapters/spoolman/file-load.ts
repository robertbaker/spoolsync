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

function isFlat(rows: unknown[]): boolean {
  const first = rows[0];
  return (
    !!first &&
    typeof first === "object" &&
    Object.keys(first).some((key) => key.startsWith("filament."))
  );
}

function parseRows(text: string): unknown[] {
  const trimmed = text.replace(/^﻿/, "").trimStart();
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
    throw new Error("This does not look like a Spoolman export: there are no filament.* columns.");
  }
  return csv.data;
}

export interface SpoolmanFileLoadResult extends LoadResult {
  origin: "file";
}

export function loadSpoolmanFile(text: string): SpoolmanFileLoadResult {
  const trimmed = text.replace(/^\uFEFF/, "").trimStart();
  const spreadsheetEscapes = !trimmed.startsWith("[") && !trimmed.startsWith("{");
  const rows = parseRows(text);
  const warnings: string[] = [];
  const spools = rows.flatMap((row, index) => {
    let candidate: unknown;
    try {
      candidate = isFlat([row])
        ? unflatten(row as Record<string, unknown>, spreadsheetEscapes)
        : row;
    } catch (error) {
      warnings.push(
        `Spool ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
    const parsed = SpoolSchema.safeParse(candidate);
    if (parsed.success) return [spoolmanToCommon(parsed.data)];
    warnings.push(
      `Spool ${index + 1}: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join(", ")}`,
    );
    return [];
  });
  return {
    source: "spoolman",
    origin: "file",
    spools,
    warnings,
    loadedAt: new Date().toISOString(),
  };
}
