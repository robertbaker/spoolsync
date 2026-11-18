import { ApplyReloadError } from "@spoolsync/core/apply";
import { compareGroup, formatValue } from "@spoolsync/core/core/compare";
import { recordKey } from "@spoolsync/core/core/match";
import {
  SOURCE_IDS,
  isWritableSource,
  type ApplyLogEntry,
  type CommonSpool,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";
import { listServices } from "@spoolsync/core/core/services";
import { lowStockRule } from "@spoolsync/core/core/stock";
import {
  formatChanges,
  formatReorderList,
  hasChanges,
  reorderItems,
  summarizeInventory,
  type InventoryChanges,
} from "@spoolsync/core/workflow";

import type { Options } from "./args";
import { cleanupLines, cleanupSection, runCleanup } from "./cleanup";
import { ExecutionError } from "./execution";
import {
  REPORT_SCHEMA_VERSION,
  type CompareReport,
  type InventoryReport,
  type PendingMatch,
} from "./json-report";
import type { createCliPlan } from "./planning";
import { applyResults, createPalette, spoolSummary, textTable } from "./presentation";
import { referenceLines, referenceSection, type ReferenceOutcome } from "./reference";
import type { CliOutput } from "./runtime";

export interface WorkflowReport {
  loaded: ReadonlyMap<SourceId, LoadResult>;
  planning: ReturnType<typeof createCliPlan>;
  applied: ApplyLogEntry[] | undefined;
  written: string[];
  exportWarnings: Array<{ source: SourceId; message: string }>;
  /** Rollback files saved before writing to a service. */
  rollbackFiles?: string[];
  /** With `--watch`, what differs from the previous run. */
  changes?: InventoryChanges;
}

/** Pending possible matches in the shape reports use. */
export function pendingMatches(
  suggestions: ReturnType<typeof createCliPlan>["matches"]["suggestions"],
): PendingMatch[] {
  return suggestions.map((suggestion) => ({
    pair: [suggestion.pair[0], suggestion.pair[1]],
    answerWith: suggestion.pair.join(","),
    score: suggestion.score,
    reasons: suggestion.reasons,
  }));
}

const changeLines = (changes: InventoryChanges | undefined, output: CliOutput) => {
  if (changes && hasChanges(changes)) output.log(formatChanges(changes).join("\n"));
};

export function reportWorkflow(
  options: Options,
  {
    loaded,
    planning,
    applied,
    written,
    exportWarnings,
    rollbackFiles = [],
    changes,
  }: WorkflowReport,
  output: CliOutput,
): void {
  const { spools, matches, summary } = planning;
  const csvFile = options.exportCsv;
  const inventoryFiles = written.filter((file) => file !== csvFile);
  if (options.json) {
    const report: CompareReport = {
      schemaVersion: REPORT_SCHEMA_VERSION,
      report: "compare",
      ...summary,
      pendingMatches: pendingMatches(matches.suggestions),
      ...(planning.cleanup ? { cleanup: cleanupSection(planning.cleanup, options) } : {}),
      ...(planning.reference ? { reference: referenceSection(planning.reference, options) } : {}),
      applied,
      written: inventoryFiles,
      ...(csvFile && written.includes(csvFile) ? { csvExport: csvFile } : {}),
      exportWarnings,
      ...(rollbackFiles.length ? { rollbackFiles } : {}),
      ...(changes && hasChanges(changes) ? { changesSinceLastRun: changes } : {}),
    } as CompareReport;
    output.log(JSON.stringify(report, null, 2));
  } else {
    const color = Boolean(output.isTTY);
    const palette = createPalette(color);
    const serviceNames = new Map(listServices(SOURCE_IDS).map(({ id, info }) => [id, info.name]));
    const heading = (title: string) => `\n${palette.bold(palette.cyan(title))}`;
    const changeRows = SOURCE_IDS.filter((source) => loaded.has(source)).map((source) => {
      const result = loaded.get(source)!;
      const target = !isWritableSource(source)
        ? "Read only"
        : result.origin === "api"
          ? options.apply
            ? "Remote API"
            : "Preview; add --apply"
          : options.outputDir
            ? "File export"
            : "Preview; add --output-dir";
      return [
        `${serviceNames.get(source) ?? source} (${source})`,
        String(result.spools.length),
        String(summary.changes[source]?.updates ?? 0),
        String(summary.changes[source]?.creates ?? 0),
        target,
      ];
    });
    const totals = changeRows.reduce(
      (total, row) => {
        total.spools += Number(row[1]);
        total.updates += Number(row[2]);
        total.creates += Number(row[3]);
        return total;
      },
      { spools: 0, updates: 0, creates: 0 },
    );
    output.log(heading("Comparison"));
    output.log(
      `${spools.length} spool${spools.length === 1 ? "" : "s"} in ${loaded.size} inventories; ${matches.groups.length} group${matches.groups.length === 1 ? "" : "s"}, ${matches.suggestions.length} match suggestion${matches.suggestions.length === 1 ? "" : "s"}.`,
    );
    output.log(heading("Planned changes"));
    output.log(
      textTable(
        ["Inventory", "Spools", "Updates", "Creates", "Write target"],
        [
          ...changeRows,
          ["Total", String(totals.spools), String(totals.updates), String(totals.creates), ""],
        ],
        [1, 2, 3],
        color,
      ),
    );
    if (!Object.values(summary.changes).some((counts) => counts.updates || counts.creates))
      output.log(palette.dim("  No updates or creations planned."));
    const spoolsByKey = new Map<string, CommonSpool>();
    if (summary.unresolved.length || matches.suggestions.length) {
      for (const result of loaded.values()) {
        for (const spool of result.spools) {
          spoolsByKey.set(recordKey(spool), spool);
        }
      }
    }
    if (summary.unresolved.length) {
      output.log(heading("Unresolved fields"));
      output.log(
        `${summary.unresolved.length} field conflict${summary.unresolved.length === 1 ? " remains" : "s remain"} unresolved; those values will be left as-is.`,
      );
      const unresolved = new Set(
        summary.unresolved.map(({ group, field }) => JSON.stringify([group, field])),
      );
      for (const group of matches.groups) {
        const groupLabel = spoolSummary(
          SOURCE_IDS.map((source) => group.members[source]).find(Boolean),
        );
        for (const comparison of compareGroup(group)) {
          if (!unresolved.has(JSON.stringify([group.id, comparison.field]))) continue;
          output.log(
            `  ${palette.bold(group.id)}: ${palette.yellow(comparison.field)}${groupLabel ? ` ${palette.dim(`(${groupLabel})`)}` : ""}`,
          );
          for (const option of comparison.options)
            output.log(
              `    ${option.sources.join(", ")}: ${JSON.stringify(formatValue(comparison.field, option.value))}`,
            );
        }
      }
      output.log(
        palette.dim(
          "Use --resolve <field=source> to choose a loaded source for a field across all groups (or run with --interactive).",
        ),
      );
    }
    if (planning.cleanup) {
      const text = cleanupLines(planning.cleanup, options, color);
      output.log(text.lines.join("\n"));
      for (const warning of text.warnings) output.warn(palette.yellow(warning));
    }
    if (planning.reference) {
      const text = referenceLines(planning.reference, options, color);
      output.log(text.lines.join("\n"));
      for (const warning of text.warnings) output.warn(palette.yellow(warning));
    }
    if (matches.suggestions.length) {
      output.log(heading("Possible matches (not linked automatically)"));
      for (const suggestion of matches.suggestions) {
        const left = spoolSummary(spoolsByKey.get(suggestion.pair[0])) || suggestion.pair[0];
        const right = spoolSummary(spoolsByKey.get(suggestion.pair[1])) || suggestion.pair[1];
        const details = [
          left !== suggestion.pair[0] || right !== suggestion.pair[1]
            ? `${left} ↔ ${right}`
            : undefined,
          `score ${suggestion.score}`,
          ...suggestion.reasons,
        ]
          .filter(Boolean)
          .join("; ");
        output.log(
          `Match suggestion: ${palette.cyan(suggestion.pair.join(","))} ${palette.dim(`(${details})`)}`,
        );
      }
      output.log(
        palette.dim(
          "Use --confirm <pair> to link a suggested pair or --reject <pair> to keep it separate (or run with --interactive).",
        ),
      );
    }
    for (const [source, result] of loaded)
      for (const warning of result.warnings)
        output.warn(palette.yellow(`Warning (${source}): ${warning}`));
    for (const problem of matches.problems) output.warn(palette.yellow(`Warning: ${problem}`));
    for (const warning of exportWarnings)
      output.warn(palette.yellow(`Export warning (${warning.source}): ${warning.message}`));
    output.log(heading("Results"));
    if (inventoryFiles.length)
      output.log(
        `Wrote ${inventoryFiles.length} updated inventory file${inventoryFiles.length === 1 ? "" : "s"}:\n${inventoryFiles.map((file) => `  ${file}`).join("\n")}`,
      );
    if (csvFile && written.includes(csvFile))
      output.log(`Exported ${spools.length} spool${spools.length === 1 ? "" : "s"} to ${csvFile}`);
    if (options.apply) output.log(applyResults(applied ?? [], color));
    else
      output.log(
        palette.dim(
          written.length
            ? "No remote services were modified."
            : "Dry run only. No files or remote services were modified.",
        ),
      );
    const fileTargets = SOURCE_IDS.filter(
      (source) =>
        isWritableSource(source) && (options.inputs.has(source) || options.empty.includes(source)),
    );
    const apiTargets = SOURCE_IDS.filter(
      (source) => isWritableSource(source) && loaded.get(source)?.origin === "api",
    );
    if ((!options.outputDir && fileTargets.length) || (!options.apply && apiTargets.length)) {
      output.log(heading("Next steps"));
      if (!options.outputDir && fileTargets.length)
        output.log(
          `  Add ${palette.cyan("--output-dir <dir>")} to write inventory files for: ${fileTargets.join(", ")}.`,
        );
      if (!options.apply && apiTargets.length)
        output.log(
          `  Add ${palette.cyan("--apply")} to write planned changes to: ${apiTargets.join(", ")}.`,
        );
    }
    if (rollbackFiles.length)
      output.log(
        `Rollback ${rollbackFiles.length === 1 ? "file" : "files"} (keep ${rollbackFiles.length === 1 ? "it" : "them"} to take this back with --restore-rollback):\n${rollbackFiles.map((file) => `  ${file}`).join("\n")}`,
      );
    changeLines(changes, output);
  }
}

/** Reports a run that only summarizes or exports what is loaded, with nothing to compare. */
export function reportInventoryOnly(
  options: Options,
  loaded: ReadonlyMap<SourceId, LoadResult>,
  written: string[],
  output: CliOutput,
  changes?: InventoryChanges,
  reference?: ReferenceOutcome,
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
  const cleanup = options.cleanupReport ? runCleanup(options, loaded) : undefined;
  const csvFile = options.exportCsv;
  const inventoryFiles = written.filter((file) => file !== csvFile);
  if (options.json) {
    const report: InventoryReport = {
      schemaVersion: REPORT_SCHEMA_VERSION,
      report: "inventory",
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
      ...(cleanup ? { cleanup: cleanupSection(cleanup, options) } : {}),
      ...(reference ? { reference: referenceSection(reference, options) } : {}),
      ...(csvFile && written.includes(csvFile) ? { csvExport: csvFile } : {}),
      written: inventoryFiles,
      ...(changes && hasChanges(changes) ? { changesSinceLastRun: changes } : {}),
    };
    output.log(JSON.stringify(report, null, 2));
    return;
  }
  const color = Boolean(output.isTTY);
  const palette = createPalette(color);
  for (const [source, result] of loaded)
    for (const warning of result.warnings)
      output.warn(palette.yellow(`Warning (${source}): ${warning}`));
  if (options.summary) {
    const serviceNames = new Map(listServices(SOURCE_IDS).map(({ id, info }) => [id, info.name]));
    const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
      `${count.toLocaleString("en-US")} ${count === 1 ? singular : pluralForm}`;
    output.log(
      `\n${palette.bold(palette.cyan(`Inventory summary — ${plural(spools, "spool")} across ${plural(summaries.length, "inventory", "inventories")}`))}`,
    );
    for (const summary of summaries) {
      output.log(
        `\n${palette.bold(serviceNames.get(summary.source) ?? summary.source)} ${palette.dim(`(${summary.source})`)}\n` +
          `  ${plural(summary.spools, "spool")}` +
          (summary.archived ? ` · ${plural(summary.archived, "archived spool")}` : "") +
          ` · ${plural(summary.brands, "brand")} · ${plural(summary.materials, "material")}` +
          `\n  ${summary.remainingGrams.toLocaleString("en-US")} g remaining` +
          (summary.runningLow
            ? ` · ${palette.yellow(plural(summary.runningLow, "spool running low", "spools running low"))} (threshold: ${options.lowThreshold ?? 20}%)`
            : "") +
          (summary.unknownWeights
            ? ` · ${palette.dim(plural(summary.unknownWeights, "spool without known weight", "spools without known weight"))}`
            : ""),
      );
    }
  }
  if (options.reorder) output.log(formatReorderList(reorder));
  if (cleanup) {
    const text = cleanupLines(cleanup, options, color);
    output.log(text.lines.join("\n"));
    for (const warning of text.warnings) output.warn(palette.yellow(warning));
  }
  if (reference) {
    const text = referenceLines(reference, options, color);
    output.log(text.lines.join("\n"));
    for (const warning of text.warnings) output.warn(palette.yellow(warning));
  }
  if (options.exportCsv && written.includes(options.exportCsv))
    output.log(`Exported ${spools} spool${spools === 1 ? "" : "s"} to ${options.exportCsv}`);
  changeLines(changes, output);
}

export function reportError(error: unknown, json: boolean, output: CliOutput): void {
  const message = error instanceof Error ? error.message : String(error);
  if (json) {
    output.log(
      JSON.stringify(
        {
          error: { message },
          ...(error instanceof ExecutionError
            ? {
                applied: error.applied,
                written: error.written,
                ...(error.rollbackFiles.length ? { rollbackFiles: error.rollbackFiles } : {}),
              }
            : error instanceof ApplyReloadError
              ? { applied: error.log }
              : {}),
        },
        null,
        2,
      ),
    );
  } else {
    const color = Boolean(output.stderrIsTTY ?? output.isTTY);
    const palette = createPalette(color);
    output.error(`${palette.red(palette.bold("spoolsync:"))} ${message}`);
    if (error instanceof ExecutionError) {
      if (error.applied) output.error(applyResults(error.applied, color));
      if (error.written.length)
        output.error(
          `Files already replaced:\n${error.written.map((file) => `  ${file}`).join("\n")}`,
        );
      if (error.rollbackFiles.length)
        output.error(
          `Rollback ${error.rollbackFiles.length === 1 ? "file" : "files"}:\n${error.rollbackFiles.map((file) => `  ${file}`).join("\n")}`,
        );
    } else if (error instanceof ApplyReloadError) output.error(applyResults(error.log, color));
    output.error(palette.dim('Run "spoolsync --help" for usage.'));
  }
  output.setExitCode(1);
}
