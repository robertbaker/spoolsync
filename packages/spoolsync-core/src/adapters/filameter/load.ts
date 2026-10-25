import { toNumber, toText } from "../../core/normalize";
import { field, parseTable } from "../shared/tabular";
import { isFilament, mapDoc } from "./map";
import type { FilameterBackup, FilameterDoc, FilameterLoadResult } from "./types";

export function loadFilameterFile(text: string): FilameterLoadResult {
  if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("This is not valid FilaMeter JSON.");
    }
    const backup = Array.isArray(parsed) ? parsed : (parsed as Partial<FilameterBackup>);
    const regular: unknown = Array.isArray(backup) ? backup : backup.regular;
    if (!Array.isArray(regular))
      throw new Error(
        "This does not look like a FilaMeter backup: expected a regular document list.",
      );
    return {
      source: "filameter",
      file: backup as FilameterBackup | FilameterDoc[],
      spools: regular.filter(isFilament).map(mapDoc),
      warnings: [],
      loadedAt: new Date().toISOString(),
      origin: "file",
    };
  }
  const { rows, headers } = parseTable(text);
  if (!headers.includes("filament"))
    throw new Error("This CSV does not include FilaMeter's filament column.");
  const docs: FilameterDoc[] = rows.map((row, index) => {
    const used = toNumber(field(row, "used_weight")) ?? 0;
    const remaining = toNumber(field(row, "remaining"));
    return {
      _id: `csv-${index + 1}`,
      filament: toText(field(row, "filament")) ?? "",
      material: toText(field(row, "material")) ?? "",
      brand: toText(field(row, "brand")),
      color: field(row, "color"),
      used_weight: used,
      total_weight:
        toNumber(field(row, "total_weight")) ?? (remaining !== null ? remaining + used : null),
      price: toNumber(field(row, "price")),
      location: field(row, "location"),
      comments: field(row, "comments"),
    };
  });
  return {
    source: "filameter",
    file: docs,
    spools: docs.map(mapDoc),
    warnings: [],
    loadedAt: new Date().toISOString(),
    origin: "file",
  };
}
