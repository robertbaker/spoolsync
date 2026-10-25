import { mapSpool } from "./map";
import type { FilamentDbSpool, FilamentDbLoadResult } from "./types";

const isSpool = (value: unknown): value is FilamentDbSpool =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof (value as FilamentDbSpool)["serial"] === "string" &&
  ((value as FilamentDbSpool)["serial"] as string).length > 0;

export function loadFilamentDbFile(text: string): FilamentDbLoadResult {
  if (text.startsWith("PK"))
    throw new Error(
      "This is a ZIP archive. Extract it and load a spools JSON file, or save GET /api/spools from FilamentDB.",
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON. Export spools from FilamentDB and try again.");
  }
  const list: unknown =
    parsed && typeof parsed === "object" && "spools" in parsed
      ? (parsed as { spools: unknown }).spools
      : parsed;
  const entries = Array.isArray(list) ? list : [list];
  const warnings: string[] = [];
  const records: FilamentDbSpool[] = [];
  entries.forEach((entry, index) => {
    if (isSpool(entry)) records.push(entry);
    else warnings.push(`Spool ${index + 1}: no serial, so it is not a FilamentDB spool.`);
  });
  if (!records.length && entries.length)
    throw new Error("This does not look like a FilamentDB export: no spool has a serial.");
  return {
    source: "filamentdb",
    origin: "file",
    file: records,
    spools: records.map(mapSpool),
    warnings,
    loadedAt: new Date().toISOString(),
  };
}
