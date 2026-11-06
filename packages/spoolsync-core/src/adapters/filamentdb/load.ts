import { readSpoolZip } from "./files";
import { mapSpool } from "./map";
import type { FilamentDbSpool, FilamentDbLoadResult } from "./types";

const isSpool = (value: unknown): value is FilamentDbSpool =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof (value as FilamentDbSpool)["serial"] === "string" &&
  ((value as FilamentDbSpool)["serial"] as string).length > 0;

/** A spool object, a list, or `{ spools: [...] }`, as the entries to check. */
function entriesOf(parsed: unknown): unknown[] {
  const list: unknown =
    parsed && typeof parsed === "object" && "spools" in parsed
      ? (parsed as { spools: unknown }).spools
      : parsed;
  return Array.isArray(list) ? list : [list];
}

function result(records: FilamentDbSpool[], warnings: string[]): FilamentDbLoadResult {
  return {
    source: "filamentdb",
    origin: "file",
    file: records,
    spools: records.map(mapSpool),
    warnings,
    loadedAt: new Date().toISOString(),
  };
}

/** Loads a spools JSON file: `GET /api/spools`, one spool file, or `{ spools: [...] }`. */
export function loadFilamentDbFile(text: string): FilamentDbLoadResult {
  if (text.startsWith("PK"))
    throw new Error(
      "This is a ZIP archive. Choose it as bytes (the file picker and CLI do), or extract it and load the spool JSON files.",
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON. Export spools from FilamentDB and try again.");
  }
  return loadFilamentDbRecords(parsed);
}

/**
 * Loads already-parsed spool JSON (the list a server returned), through the same validation and
 * mapping as {@link loadFilamentDbFile}, without serialising it to text and parsing it again.
 */
export function loadFilamentDbRecords(parsed: unknown): FilamentDbLoadResult {
  const entries = entriesOf(parsed);
  const warnings: string[] = [];
  const records: FilamentDbSpool[] = [];
  entries.forEach((entry, index) => {
    if (isSpool(entry)) records.push(entry);
    else warnings.push(`Spool ${index + 1}: no serial, so it is not a FilamentDB spool.`);
  });
  if (!records.length && entries.length)
    throw new Error("This does not look like a FilamentDB export: no spool has a serial.");
  return result(records, warnings);
}

/** Loads FilamentDB's ZIP export (`GET /api/spools/export`): one JSON file per spool. */
export async function loadFilamentDbZip(bytes: Uint8Array): Promise<FilamentDbLoadResult> {
  const files = await readSpoolZip(bytes);
  if (!files.length)
    throw new Error(
      "This ZIP has no spool files. FilamentDB's export holds one .json file per spool.",
    );
  const warnings: string[] = [];
  const records: FilamentDbSpool[] = [];
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.text);
    } catch {
      warnings.push(`${file.name}: not valid JSON, so it was skipped.`);
      continue;
    }
    const entries = entriesOf(parsed);
    for (const entry of entries) {
      if (isSpool(entry)) records.push(entry);
      else warnings.push(`${file.name}: no serial, so it is not a FilamentDB spool.`);
    }
  }
  if (!records.length)
    throw new Error("This does not look like a FilamentDB export: no spool file has a serial.");
  return result(records, warnings);
}

/**
 * Loads a FilamentDB file given as bytes or text: the ZIP export, or spools JSON. The format is
 * recognised by the ZIP signature, so the file name does not matter.
 */
export async function loadFilamentDbInput(
  input: string | Uint8Array,
): Promise<FilamentDbLoadResult> {
  if (typeof input !== "string") {
    if (!input.byteLength)
      throw new Error("The inventory file is empty. Choose an export from your service.");
    if (input.byteLength >= 4 && input[0] === 0x50 && input[1] === 0x4b)
      return loadFilamentDbZip(input);
    input = new TextDecoder().decode(input);
  }
  const text = input.replace(/^﻿/, "");
  if (!text.trim())
    throw new Error("The inventory file is empty. Choose an export from your service.");
  return loadFilamentDbFile(text);
}
