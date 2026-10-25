import { ApplyReloadError } from "@spoolsync/core/apply";
import {
  SOURCE_IDS,
  type ApplyLogEntry,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";

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
  if (options.json) {
    output.log(JSON.stringify({ ...summary, applied, written, exportWarnings }, null, 2));
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
    if (written.length)
      output.log(
        `Wrote ${written.length} updated inventory file${written.length === 1 ? "" : "s"}:\n${written.map((file) => `  ${file}`).join("\n")}`,
      );
    if (!options.apply && !written.length)
      output.log(
        "Dry run only. Add --output-dir <dir> to write inventory files, or --apply with a direct API connection to write to the service.",
      );
    else if (options.apply) output.log("Apply results:", applied);
  }
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
