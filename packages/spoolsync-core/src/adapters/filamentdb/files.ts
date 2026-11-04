import { listZipEntries, readZipEntry, ZipError, writeZip } from "../shared/zip";
import type { FilamentDbSpool } from "./types";

/** Mirrors FilamentDB's `sanitizeForFilename` (lib/storage/fileUtils.ts). */
export function sanitizeForFilename(value: string): string {
  if (!value) return "Unknown";
  return (
    value
      .replace(/[/\\:*?"<>|]/g, "")
      .replace(/[™®©]/g, "")
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9-]/g, "")
      .substring(0, 100) || "Unknown"
  );
}

const asText = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * The file name FilamentDB gives a spool, `{type}-{brand}-{color}-{serial}.json`
 * (`getSpoolFileName`). `/api/spools/import` accepts a file only when its name has at least four
 * hyphen-separated parts, which this form always has.
 */
export function spoolFileName(spool: FilamentDbSpool): string {
  const type = sanitizeForFilename(asText(spool["type"]));
  const brand = sanitizeForFilename(asText(spool["brand"]) || "Unknown");
  const color = sanitizeForFilename(asText(spool["color"]) || "NoColor");
  const serial = sanitizeForFilename(asText(spool["serial"]));
  return `${type}-${brand}-${color}-${serial}.json`;
}

/** Reads every `.json` file of a FilamentDB ZIP export as text, in archive order. */
export async function readSpoolZip(
  bytes: Uint8Array,
): Promise<Array<{ name: string; text: string }>> {
  let entries;
  try {
    entries = listZipEntries(bytes);
  } catch (error) {
    throw new Error(zipMessage(error));
  }
  const files: Array<{ name: string; text: string }> = [];
  for (const entry of entries) {
    if (entry.name.endsWith("/") || !entry.name.toLowerCase().endsWith(".json")) continue;
    try {
      const data = await readZipEntry(bytes, entry);
      files.push({
        name: entry.name,
        text: new TextDecoder().decode(data).replace(/^﻿/, ""),
      });
    } catch (error) {
      throw new Error(`${entry.name}: ${zipMessage(error)}`);
    }
  }
  return files;
}

function zipMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof ZipError
    ? message.replaceAll("spreadsheets", "archives").replaceAll("spreadsheet", "FilamentDB export")
    : message;
}

/** Builds the ZIP that FilamentDB's `/api/spools/import` takes: one named JSON file per spool. */
export function buildSpoolZip(
  records: readonly FilamentDbSpool[],
  modified: Date,
): { zip: Uint8Array; collisions: string[] } {
  const encoder = new TextEncoder();
  const seen = new Set<string>();
  const collisions: string[] = [];
  const files = records.map((record) => {
    const name = spoolFileName(record);
    if (seen.has(name)) collisions.push(name);
    seen.add(name);
    return { name, data: encoder.encode(JSON.stringify(record, null, 2)) };
  });
  return { zip: writeZip(files, modified), collisions };
}
