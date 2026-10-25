import { parseTable } from "../shared/tabular";
import { CSV_NUMERIC_FIELDS, jsonNumber, mapRecord } from "./map";
import type { ThreeDfpLoadResult } from "./types";

export function loadThreeDfpFile(text: string): ThreeDfpLoadResult {
  let parsed: unknown;
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error("This is not valid JSON.");
    }
  } else {
    const { rows, headers } = parseTable(text);
    if (headers.includes("secondary_type") && headers.includes("td") && headers.includes("uuid"))
      throw new Error(
        "This is a HueForge filament export, which does not contain spool inventory fields. Choose the standard 3DFilamentProfiles My Spools CSV or JSON export instead.",
      );
    if (
      !["short_code", "brand", "remaining_grams", "material"].some((key) => headers.includes(key))
    )
      throw new Error(
        "This CSV does not contain 3DFilamentProfiles spool columns (such as short_code, brand, material, or remaining_grams).",
      );
    for (const [index, row] of rows.entries())
      for (const key of CSV_NUMERIC_FIELDS)
        if (Object.hasOwn(row, key)) jsonNumber(row[key], key, index + 1);
    const records = rows;
    return {
      source: "threeDfp",
      file: records,
      format: "csv",
      spools: records.map(mapRecord),
      warnings: [],
      loadedAt: new Date().toISOString(),
      origin: "file",
    };
  }
  const container =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  if (Array.isArray(container?.Filaments))
    throw new Error(
      "This is a HueForge filament export, which does not contain spool inventory fields. Choose the standard 3DFilamentProfiles My Spools CSV or JSON export instead.",
    );
  const records = Array.isArray(parsed)
    ? parsed
    : (["spools", "filaments", "items", "data"]
        .map((key) => container?.[key])
        .find(Array.isArray) as unknown[] | undefined);
  if (
    !records ||
    !records.every((record) => record && typeof record === "object" && !Array.isArray(record))
  )
    throw new Error(
      "This does not look like a 3DFilamentProfiles spool export (expected a JSON list).",
    );
  if (
    records.length &&
    !records.some((record) =>
      ["short_code", "brand", "remaining_grams"].some(
        (key) => key in (record as Record<string, unknown>),
      ),
    )
  )
    throw new Error("This JSON list does not contain 3DFilamentProfiles spool fields.");
  for (const [index, record] of records.entries()) {
    const properties = (record as Record<string, unknown>).spool_properties;
    if (properties != null && (typeof properties !== "object" || Array.isArray(properties)))
      throw new Error(
        `3DFilamentProfiles record ${index + 1}: spool_properties must be a JSON object or null. Export the inventory again before syncing.`,
      );
  }
  return {
    source: "threeDfp",
    file: parsed,
    format: "json",
    spools: records.map((record, i) => mapRecord(record as Record<string, unknown>, i)),
    warnings: [],
    loadedAt: new Date().toISOString(),
    origin: "file",
  };
}
