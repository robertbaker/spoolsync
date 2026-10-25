import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CliError } from "./errors";
import type { ReferenceRow } from "./types";

const DATABASE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/spoolsync-core/src/adapters/tigertag/reference-data",
);

export async function loadReference(filename: string): Promise<ReferenceRow[]> {
  const file = path.join(DATABASE, filename);
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("expected an array");
    return parsed;
  } catch (error: any) {
    throw new CliError(`Cannot load TigerTag reference ${filename}: ${error.message}`);
  }
}

function key(value: unknown): string {
  // "+" survives as a word: "PLA+ Silk" and "PLA Silk" are different materials.
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function pickId(
  rows: ReferenceRow[],
  value: unknown,
  labelField: "name" | "label" | "material_type",
  fallback: number,
): number {
  const needle = key(value);
  if (!needle) return fallback;
  const exact = rows.find((row) => key(row[labelField]) === needle);
  if (exact) return Number(exact.id);
  const compatible = rows.find((row) => key(row[labelField]).split(" ").includes(needle));
  return compatible ? Number(compatible.id) : fallback;
}
