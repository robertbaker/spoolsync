import type { CommonSpool, LoadResult } from "../../core/model";
import { spoolKeepToCommon, type SpoolKeepCondition } from "./map";
import { SpoolKeepRecordSchema } from "./schema";

const MAX_EXPANDED_SPOOLS = 5000;

function quantity(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * Loads a SpoolKeep JSON backup. Each entry becomes one spool per counted unit; an entry with no
 * stock becomes a single archived spool so the product is still comparable.
 */
export function loadSpoolKeepJson(text: string): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON. Export a backup from SpoolKeep and try again.");
  }
  if (!Array.isArray(parsed))
    throw new Error("This does not look like a SpoolKeep backup: expected a list of filaments.");

  const warnings: string[] = [];
  const spools: CommonSpool[] = [];
  const seen = new Set<string>();
  parsed.forEach((entry, position) => {
    const result = SpoolKeepRecordSchema.safeParse(entry);
    if (!result.success) {
      warnings.push(
        `Filament ${position + 1}: ${result.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(", ")}`,
      );
      return;
    }
    const record = result.data;
    if (seen.has(record.id)) {
      warnings.push(`Filament ${record.id} appears more than once; using the first entry.`);
      return;
    }
    seen.add(record.id);
    for (const [label, value] of [
      ["new", record.newQuantity],
      ["used", record.usedQuantity],
    ] as const)
      if (typeof value === "number" && Number.isFinite(value) && value > 0 && value % 1 !== 0)
        warnings.push(
          `${record.brand ?? "Filament"} ${record.color ?? record.id}: ${label} quantity ${value} is fractional; loaded as ${quantity(value)}.`,
        );
    const units: SpoolKeepCondition[] = [
      ...Array<SpoolKeepCondition>(quantity(record.newQuantity)).fill("new"),
      ...Array<SpoolKeepCondition>(quantity(record.usedQuantity)).fill("used"),
    ];
    if (units.length === 0) units.push("none");
    if (spools.length + units.length > MAX_EXPANDED_SPOOLS)
      throw new Error("This SpoolKeep backup lists too many spools to load.");
    if (units.length > 1)
      warnings.push(
        `${record.brand ?? "Filament"} ${record.color ?? record.id}: SpoolKeep counts ${units.length} spools without weights; loaded as ${units.length} spools with unknown remaining weight.`,
      );
    const counts: Record<SpoolKeepCondition, number> = {
      new: 0,
      used: 0,
      none: 0,
    };
    for (const condition of units)
      spools.push(spoolKeepToCommon(record, condition, ++counts[condition], units.length));
  });
  return {
    source: "spoolkeep",
    origin: "file",
    spools,
    warnings,
    loadedAt: new Date().toISOString(),
  };
}
