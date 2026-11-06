import type { CommonSpool, LoadResult } from "../../core/model";
import { toBoolean } from "../../core/normalize";
import { parseTable } from "../shared/tabular";
import { hueforgeRowToCommon, templateRowToCommon } from "./map";

type Layout = "template" | "hueforge";

function detectLayout(headers: readonly string[]): Layout | null {
  const has = (name: string) => headers.includes(name);
  if (has("remainingweight") || has("spoolid") || (has("brand") && has("colorhexcodes")))
    return "template";
  if (
    has("brand") &&
    has("type") &&
    has("color") &&
    (has("td") || has("transmissivity") || has("owned") || has("uuid"))
  )
    return "hueforge";
  return null;
}

/** Loads Spool Hoarder's inventory CSV or its HueForge library export. */
export function loadSpoolHoarderCsv(text: string): LoadResult {
  const { rows, headers } = parseTable(text);
  const layout = detectLayout(headers);
  if (!layout)
    throw new Error(
      "This does not look like a Spool Hoarder export: expected inventory columns (spoolId, brand, material) or HueForge columns (Brand, Type, Color, Uuid).",
    );
  const warnings: string[] = [];
  const spools: CommonSpool[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!;
    if (layout === "template" && toBoolean(row["isdeleted"])) {
      warnings.push(`Row ${index + 2}: marked deleted in Spool Hoarder; skipped.`);
      continue;
    }
    const spool =
      layout === "template" ? templateRowToCommon(row, index) : hueforgeRowToCommon(row, index);
    if (seen.has(spool.sourceId)) {
      warnings.push(
        `Row ${index + 2}: ID ${spool.sourceId} appears more than once; using the first row.`,
      );
      continue;
    }
    seen.add(spool.sourceId);
    spools.push(spool);
  }
  if (layout === "hueforge" && spools.length)
    warnings.push(
      "This is a HueForge library export: it lists filament colors without weights, so remaining and initial weights are not available.",
    );
  return {
    source: "spoolhoarder",
    origin: "file",
    spools,
    warnings,
    loadedAt: new Date().toISOString(),
  };
}
