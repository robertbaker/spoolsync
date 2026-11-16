import { ApplyReloadError } from "@spoolsync/core/apply";
import { allSpools, isWritableSource, type ApplyLogEntry } from "@spoolsync/core/core/model";
import { diffSnapshots, snapshotInventory, type InventorySnapshot } from "@spoolsync/core/workflow";

import type { Options } from "./args";
import { ExecutionError, executeWrites } from "./execution";
import { prepareExports } from "./exports";
import { loadInputs } from "./inputs";
import { clackPrompts, runInteractiveChoices } from "./interactive";
import { createCliPlan } from "./planning";
import { createProgressReporter, formatApplyProgress } from "./progress";
import { loadReferenceFile, referenceMismatches, runReference } from "./reference";
import { reportInventoryOnly, reportWorkflow } from "./report";
import { runRestore, saveRollbackBeforeWrite } from "./rollback";
import type { CliDependencies, CliOutput } from "./runtime";

export async function runWorkflow(
  options: Options,
  dependencies: CliDependencies,
  output: CliOutput,
  /** With `--watch`, the previous run's snapshot, so this run can report what changed. */
  previous?: InventorySnapshot,
): Promise<InventorySnapshot> {
  if (options.interactive) {
    const isInteractive =
      dependencies.isInteractiveTTY?.() ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
    if (!isInteractive) {
      throw new Error(
        "--interactive requires an interactive terminal. Pass --confirm, --reject, --resolve, or --apply instead.",
      );
    }
  }
  const stderrTTY = Boolean(output.stderrIsTTY);
  const progress = createProgressReporter(
    { interactive: stderrTTY, json: options.json, watch: options.watch },
    output,
  );
  if (options.restoreRollback) {
    const restoreTask =
      stderrTTY && !options.json ? progress.start("Restoring rollback…") : undefined;
    try {
      const restored = await runRestore(options, dependencies, output);
      restoreTask?.stop("Rollback restore finished");
      return snapshotInventory(restored);
    } catch (error) {
      restoreTask?.fail("Rollback restore failed");
      throw error;
    }
  }
  const loadTask =
    stderrTTY && !options.json && !options.watch
      ? progress.start("Loading inventories…")
      : undefined;
  let loaded: Awaited<ReturnType<typeof loadInputs>>["loaded"];
  let services: Awaited<ReturnType<typeof loadInputs>>["services"];
  try {
    ({ loaded, services } = await loadInputs(options, dependencies, (msg) =>
      loadTask?.update(msg),
    ));
    const totalSpools = allSpools(loaded.values()).length;
    loadTask?.stop(
      `Loaded ${loaded.size} inventor${loaded.size === 1 ? "y" : "ies"} (${totalSpools} spool${totalSpools === 1 ? "" : "s"})`,
    );
  } catch (error) {
    loadTask?.fail("Failed to load inventories");
    throw error;
  }
  const loadedSpools = allSpools(loaded.values());
  // `--cleanup-report` on its own lists proposals for what is loaded and plans nothing.
  const cleanupOnly = options.cleanupReport && !options.cleanup;
  // The same for `--reference-report` without `--reference`. The reference file is read once here.
  const referenceFile = await loadReferenceFile(options, dependencies);
  const reference = referenceFile ? runReference(referenceFile, loaded, options) : undefined;
  const referenceOnly = Boolean(options.referenceReport) && !options.reference;
  const mismatched = Boolean(
    options.failOnMismatch && reference && referenceMismatches(reference).total,
  );
  if (
    options.summary ||
    options.reorder ||
    cleanupOnly ||
    referenceOnly ||
    (options.exportCsv && loaded.size < 2)
  ) {
    // Nothing to compare: a report of what is loaded, an export of it, or both.
    const { staged } = await prepareExports(options, loaded, new Map(), dependencies);
    const { written } = await executeWrites(staged);
    const snapshot = snapshotInventory(loadedSpools);
    if (mismatched) output.setExitCode(1);
    reportInventoryOnly(
      options,
      loaded,
      written,
      output,
      previous && diffSnapshots(previous, snapshot),
      reference,
    );
    return snapshot;
  }
  let activeOptions = options;
  let planning = createCliPlan(
    activeOptions,
    loaded,
    activeOptions.reference ? reference : undefined,
  );
  if (activeOptions.interactive) {
    const interactive = await runInteractiveChoices(
      activeOptions,
      loaded,
      planning,
      activeOptions.reference ? reference : undefined,
      dependencies.prompts ?? clackPrompts,
    );
    if (interactive.cancelled) {
      output.setExitCode(130);
      return snapshotInventory(interactive.planning.spools);
    }
    activeOptions = interactive.options;
    planning = interactive.planning;
  }
  const { staged, exportWarnings } = await prepareExports(
    activeOptions,
    loaded,
    planning.plan,
    dependencies,
  );
  const rollbackFiles: string[] = [];
  const apply =
    activeOptions.apply && services.some((service) => service.apply)
      ? async () => {
          const log: ApplyLogEntry[] = [];
          for (const service of services) {
            if (!service.apply || !isWritableSource(service.source)) continue;
            const applyTask = progress.start(`Applying ${service.label} changes…`);
            try {
              const changes = planning.plan.get(service.source) ?? [];
              const rollbackFile = await saveRollbackBeforeWrite(
                service.source,
                service.label,
                changes,
                activeOptions,
                dependencies,
              );
              if (rollbackFile) {
                rollbackFiles.push(rollbackFile);
                if (!activeOptions.json) output.error(`Saved rollback file ${rollbackFile}`);
              }
              log.push(
                ...(await service.apply(changes, (done, total) => {
                  applyTask.update(formatApplyProgress(service.label, done, total, stderrTTY));
                })),
              );
              applyTask.stop(`Applied ${service.label} changes`);
            } catch (error) {
              applyTask.fail(`Failed applying ${service.label} changes`);
              if (error instanceof ApplyReloadError) log.push(...error.log);
              throw new ExecutionError(error, log, [], undefined, rollbackFiles);
            }
          }
          return log;
        }
      : undefined;
  const exportTask =
    staged && !apply && stderrTTY && !activeOptions.json && !activeOptions.watch
      ? progress.start("Writing exports…")
      : undefined;
  let applied: ApplyLogEntry[] | undefined;
  let written: string[];
  try {
    ({ applied, written } = await executeWrites(staged, apply));
    if (exportTask) {
      exportTask.stop(`Wrote ${written.length} export file${written.length === 1 ? "" : "s"}`);
    }
  } catch (error) {
    exportTask?.fail("Failed to write exports");
    throw error;
  }
  if (applied?.some((entry) => !entry.ok) || mismatched) output.setExitCode(1);
  const snapshot = snapshotInventory(
    planning.spools,
    planning.matches.suggestions.map((suggestion) => suggestion.pair.join(",")),
  );
  const changes = previous && diffSnapshots(previous, snapshot);
  reportWorkflow(
    activeOptions,
    {
      loaded,
      planning,
      applied,
      written,
      exportWarnings,
      rollbackFiles,
      ...(changes ? { changes } : {}),
    },
    output,
  );
  if (activeOptions.interactive) {
    (dependencies.prompts ?? clackPrompts).outro("Done");
  }
  return snapshot;
}
