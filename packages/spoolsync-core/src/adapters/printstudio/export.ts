import type { PlannedChange } from "../../core/compare";
import { createPayload } from "./payload";

/**
 * The import file for PrintStudio's `POST /api/materials/import`: new spools as `{ materials }`.
 * PrintStudio assigns real ids and the `local` source system, ignoring the placeholders here, which
 * only let SpoolSync read the file back. Updates need the API, so they are omitted with a warning.
 */
export function exportPrintStudio(changes: PlannedChange[]) {
  const warnings: string[] = [];
  const materials: Record<string, unknown>[] = [];
  const skipped = changes.filter(
    (change) => change.source === "printstudio" && change.kind === "update",
  ).length;
  if (skipped)
    warnings.push(
      `PrintStudio's import only creates lots; ${skipped} planned update${skipped === 1 ? " was" : "s were"} omitted. Apply updates over the API (--printstudio-url --apply), which edits only lots made in PrintStudio.`,
    );
  for (const change of changes) {
    if (change.source !== "printstudio" || change.kind !== "create") continue;
    const plan = createPayload(
      change.values,
      `PrintStudio ${change.values.name ?? change.groupId}`,
    );
    warnings.push(...plan.notes);
    materials.push({
      ...plan.payload,
      id: `import-${materials.length + 1}`,
      sourceSystem: "local",
    });
  }
  return {
    json: `${JSON.stringify({ materials }, null, 2)}\n`,
    updated: 0,
    created: materials.length,
    warnings,
  };
}
