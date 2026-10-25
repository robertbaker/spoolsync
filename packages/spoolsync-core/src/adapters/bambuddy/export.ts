import type { PlannedChange } from "../../core/compare";
import { csvText } from "../shared/tabular";
import { exportWeights } from "../shared/weights";
import { roundPrice } from "./map";
import type { BambuddyLoadResult } from "./types";

export function exportBambuddyCsv(_loaded: BambuddyLoadResult, changes: PlannedChange[]) {
  const rows: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  const skippedUpdates = changes.filter(
    (change) => change.source === "bambuddy" && change.kind === "update",
  ).length;
  if (skippedUpdates)
    warnings.push(
      `Bambuddy CSV import only creates new spools; ${skippedUpdates} planned update${skippedUpdates === 1 ? " was" : "s were"} omitted. Existing spools must be edited in Bambuddy.`,
    );
  let created = 0;
  for (const change of changes) {
    if (change.source !== "bambuddy") continue;
    // Bambuddy's inventory CSV import creates new rows. Do not emit edits to existing spools,
    // which would become duplicates when the file is imported.
    if (change.kind !== "create") continue;
    if (change.values.emptySpoolWeight !== null)
      warnings.push(
        `Bambuddy ${change.values.name ?? change.groupId}: empty spool weight was omitted because Bambuddy's CSV importer does not accept core_weight.`,
      );
    const initialWeight = change.values.initialWeight;
    const price = change.values.price;
    const costPerKg =
      price === 0
        ? 0
        : price !== null && initialWeight !== null && initialWeight > 0
          ? roundPrice((price * 1000) / initialWeight)
          : null;
    if (price !== null && costPerKg === null)
      warnings.push(
        `Price was omitted for ${change.values.name ?? change.groupId}: a positive initial weight is required to calculate Bambuddy's cost per kilogram.`,
      );
    const weights = exportWeights(
      initialWeight,
      change.values.remainingWeight,
      `Bambuddy ${change.values.name ?? change.groupId}`,
    );
    if (!Number.isInteger(weights.total))
      throw new Error(
        `Bambuddy ${change.values.name ?? change.groupId}: label weight must be a whole number of grams for CSV import. Resolve the initial weight before exporting.`,
      );
    for (const field of ["nozzleTempMin", "nozzleTempMax"] as const) {
      const value = change.values[field];
      if (value !== null && !Number.isInteger(value))
        throw new Error(
          `Bambuddy ${change.values.name ?? change.groupId}: ${field} must be a whole number for CSV import. Resolve the temperature before exporting.`,
        );
    }
    if (change.values.colors.length > 9)
      throw new Error(
        `Bambuddy ${change.values.name ?? change.groupId}: CSV import accepts at most eight secondary colors. Resolve the colors before exporting.`,
      );
    warnings.push(...weights.warnings);
    rows.push({
      material: change.values.material ?? "PLA",
      brand: change.values.vendor ?? "",
      color_name: change.values.name ?? "",
      rgba: change.values.colors[0] ?? "",
      extra_colors: change.values.colors.slice(1).join(","),
      label_weight: weights.total,
      weight_used: weights.used,
      cost_per_kg: costPerKg ?? "",
      storage_location: change.values.location ?? "",
      note: change.values.comment ?? "",
      nozzle_temp_min: change.values.nozzleTempMin ?? "",
      nozzle_temp_max: change.values.nozzleTempMax ?? "",
    });
    created++;
  }
  return {
    csv: csvText(
      rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value,
          ]),
        ),
      ),
      [
        "material",
        "brand",
        "color_name",
        "rgba",
        "extra_colors",
        "label_weight",
        "weight_used",
        "cost_per_kg",
        "storage_location",
        "note",
        "nozzle_temp_min",
        "nozzle_temp_max",
      ],
    ),
    total: rows.length,
    updated: 0,
    created,
    warnings,
  };
}
