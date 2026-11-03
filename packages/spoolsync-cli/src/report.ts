import { ApplyReloadError } from "@spoolsync/core/apply";
import {
  SOURCE_IDS,
  type ApplyLogEntry,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";
import { lowStockRule } from "@spoolsync/core/core/stock";
import { formatReorderList, reorderItems, summarizeInventory } from "@spoolsync/core/workflow";

import type { Options } from "./args";
import { ExecutionError } from "./execution";
import type { createCliPlan } from "./planning";
import type { CliOutput } from "./runtime";

export interface WorkflowReport {
  loaded: ReadonlyMap<SourceId, LoadResult>;
  planning: ReturnType<typeof createCliPlan>;
  applied: ApplyLogEntry[] | undefined;
  written: string[];
  exportWarnings: Array<{ source: SourceId; message: string }>;
}

export function reportWorkflow(
  options: Options,
  { loaded, planning, applied, written, exportWarnings }: WorkflowReport,
  output: CliOutput,
): void {
  const { spools, matches, summary } = planning;
  const csvFile = options.exportCsv;
  const inventoryFiles = written.filter((file) => file !== csvFile);
  if (options.json) {
    output.log(
      JSON.stringify(
        {
          ...summary,
          applied,
          written: inventoryFiles,
          ...(csvFile && written.includes(csvFile) ? { csvExport: csvFile } : {}),
          exportWarnings,
        },
        null,
        2,
      ),
    );
  } else {
    output.log(
      `${spools.length} spool${spools.length === 1 ? "" : "s"} in ${loaded.size} inventories; ${matches.groups.length} group${matches.groups.length === 1 ? "" : "s"}, ${matches.suggestions.length} match suggestion${matches.suggestions.length === 1 ? "" : "s"}.`,
    );
    for (const source of SOURCE_IDS) {
      if (!loaded.has(source)) continue;
      const counts = summary.changes[source];
      const updates = counts?.updates ?? 0;
      const creates = counts?.creates ?? 0;
      output.log(
        `  ${source}: ${updates} update${updates === 1 ? "" : "s"}, ${creates} create${creates === 1 ? "" : "s"}`,
      );
    }
    if (summary.unresolved.length)
      output.log(
        `${summary.unresolved.length} field conflict${summary.unresolved.length === 1 ? " remains" : "s remain"} unresolved; those values will be left as-is.`,
      );
    for (const suggestion of matches.suggestions)
      output.log(
        `Match suggestion: ${suggestion.pair.join(",")} (score ${suggestion.score}; ${suggestion.reasons.join("; ")})`,
      );
    if (matches.suggestions.length)
      output.log(
        "Use --confirm <pair> to link a suggested pair or --reject <pair> to keep it separate.",
      );
    for (const [source, result] of loaded)
      for (const warning of result.warnings) output.warn(`Warning (${source}): ${warning}`);
    for (const problem of matches.problems) output.warn(`Warning: ${problem}`);
    for (const warning of exportWarnings)
      output.warn(`Export warning (${warning.source}): ${warning.message}`);
    if (inventoryFiles.length)
      output.log(
        `Wrote ${inventoryFiles.length} updated inventory file${inventoryFiles.length === 1 ? "" : "s"}:\n${inventoryFiles.map((file) => `  ${file}`).join("\n")}`,
      );
    if (csvFile && written.includes(csvFile))
      output.log(`Exported ${spools.length} spool${spools.length === 1 ? "" : "s"} to ${csvFile}`);
    if (!options.apply && !inventoryFiles.length)
      output.log(
        "Dry run only. Add --output-dir <dir> to write inventory files, or --apply with a direct API connection to write to the service.",
      );
    else if (options.apply) output.log("Apply results:", applied);
  }
}

/** Reports a run that only summarizes or exports what is loaded, with nothing to compare. */
export function reportInventoryOnly(
  options: Options,
  loaded: ReadonlyMap<SourceId, LoadResult>,
  written: string[],
  output: CliOutput,
): void {
  const rule = lowStockRule((options.lowThreshold ?? 20) as number);
  const summaries = SOURCE_IDS.flatMap((source) => {
    const result = loaded.get(source);
    return result ? [summarizeInventory(result, rule)] : [];
  });
  const spools = summaries.reduce((total, summary) => total + summary.spools, 0);
  const reorder = options.reorder
    ? reorderItems([...loaded.values()], { confirmed: [], rejected: [] }, rule)
    : [];
  if (options.json) {
    output.log(
      JSON.stringify(
        {
          ...(options.summary ? { inventories: summaries } : {}),
          ...(options.reorder
            ? {
                reorder: reorder.map(({ spool, fraction }) => ({
                  service: spool.source,
                  id: spool.sourceId,
                  vendor: spool.vendor,
                  material: spool.material,
                  name: spool.name,
                  remainingGrams: spool.remainingWeight,
                  fraction,
                })),
              }
            : {}),
          ...(options.summary || options.reorder ? {} : { spools }),
          ...(options.exportCsv && written.includes(options.exportCsv)
            ? { csvExport: options.exportCsv }
            : {}),
          written,
        },
        null,
        2,
      ),
    );
    return;
  }
  for (const [source, result] of loaded)
    for (const warning of result.warnings) output.warn(`Warning (${source}): ${warning}`);
  if (options.summary)
    for (const summary of summaries) {
      const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
      output.log(
        `${summary.source}: ${plural(summary.spools, "spool")}` +
          (summary.archived ? ` (${summary.archived} archived)` : "") +
          `, ${plural(summary.brands, "brand")}, ${plural(summary.materials, "material")}, ` +
          `${summary.remainingGrams.toLocaleString("en-US")} g remaining` +
          (summary.unknownWeights
            ? ` (${plural(summary.unknownWeights, "spool")} without a known weight)`
            : "") +
          (summary.runningLow ? `; ${summary.runningLow} running low` : ""),
      );
    }
  if (options.reorder) output.log(formatReorderList(reorder));
  if (options.exportCsv && written.includes(options.exportCsv))
    output.log(`Exported ${spools} spool${spools === 1 ? "" : "s"} to ${options.exportCsv}`);
}

export function reportError(error: unknown, json: boolean, output: CliOutput): void {
  const message = error instanceof Error ? error.message : String(error);
  if (json) {
    output.log(
      JSON.stringify(
        {
          error: { message },
          ...(error instanceof ExecutionError
            ? { applied: error.applied, written: error.written }
            : error instanceof ApplyReloadError
              ? { applied: error.log }
              : {}),
        },
        null,
        2,
      ),
    );
  } else {
    output.error(`spoolsync: ${message}`);
    if (error instanceof ExecutionError) {
      if (error.applied) output.error("Apply results:", error.applied);
      if (error.written.length) output.error("Files already replaced:", error.written);
    } else if (error instanceof ApplyReloadError) output.error("Apply results:", error.log);
    output.error('Run "spoolsync --help" for usage.');
  }
  output.setExitCode(1);
}
