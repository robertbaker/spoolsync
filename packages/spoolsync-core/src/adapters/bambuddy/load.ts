import { toHex, toNumber, toText } from "../../core/normalize";
import { field, parseTable } from "../shared/tabular";
import { inventoryFromRecords, numericId, recordsFrom } from "./map";
import type { BambuddyLoadResult, BambuddySpool } from "./types";

export function loadBambuddyFile(text: string): BambuddyLoadResult {
  if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("This is not valid Bambuddy JSON.");
    }
    const records = recordsFrom(parsed);
    return {
      ...inventoryFromRecords(records),
      file: records,
      origin: "file",
    };
  }
  const { rows, headers } = parseTable(text);
  if (!headers.includes("material"))
    throw new Error(
      "This does not look like a Bambuddy inventory CSV: a material column is required.",
    );
  const records = rows.map((rawRow, index) => {
    // Bambuddy protects spreadsheet formulas with a leading apostrophe on export.
    const row = Object.fromEntries(
      Object.entries(rawRow).map(([key, value]) => [
        key,
        typeof value === "string" && /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value,
      ]),
    );
    if (!toText(field(row, "material")))
      throw new Error(`Bambuddy CSV data row ${index + 1} is missing a material.`);
    const rawId = field(row, "id");
    const id =
      rawId === undefined || rawId === null || (typeof rawId === "string" && !rawId.trim())
        ? index + 1
        : numericId(rawId);
    if (id === null)
      throw new Error(
        `Bambuddy CSV data row ${index + 1} has an invalid ID; use a non-negative safe integer or omit the ID column.`,
      );
    return {
      ...row,
      id,
      material: field(row, "material"),
      brand: field(row, "brand"),
      subtype: field(row, "subtype"),
      color_name: field(row, "color_name"),
      rgba: toHex(field(row, "rgba")),
      extra_colors: field(row, "extra_colors"),
      effect_type: field(row, "effect_type"),
      label_weight: toNumber(field(row, "label_weight")),
      core_weight: toNumber(field(row, "core_weight")),
      weight_used: toNumber(field(row, "weight_used")),
      cost_per_kg: toNumber(field(row, "cost_per_kg")),
      nozzle_temp_min: toNumber(field(row, "nozzle_temp_min")),
      nozzle_temp_max: toNumber(field(row, "nozzle_temp_max")),
      note: field(row, "note"),
      storage_location: field(row, "storage_location"),
    };
  }) as BambuddySpool[];
  recordsFrom(records);
  return {
    ...inventoryFromRecords(records),
    file: records,
    origin: "file",
  };
}
