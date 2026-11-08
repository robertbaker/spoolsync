import { ApplyReloadError } from "@spoolsync/core/apply";
import { allSpools, isWritableSource, type ApplyLogEntry } from "@spoolsync/core/core/model";
import { diffSnapshots, snapshotInventory, type InventorySnapshot } from "@spoolsync/core/workflow";

import type { Options } from "./args";
import { ExecutionError, executeWrites } from "./execution";
import { prepareExports } from "./exports";
import { loadInputs } from "./inputs";
import { createCliPlan } from "./planning";
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
  if (options.restoreRollback)
    return snapshotInventory(await runRestore(options, dependencies, output));
  const { loaded, services } = await loadInputs(options, dependencies);
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
  const planning = createCliPlan(options, loaded, options.reference ? reference : undefined);
  const { staged, exportWarnings } = await prepareExports(
    options,
    loaded,
    planning.plan,
    dependencies,
  );
  const rollbackFiles: string[] = [];
  const apply =
    options.apply && services.some((service) => service.apply)
      ? async () => {
          const log: ApplyLogEntry[] = [];
          for (const service of services) {
            if (!service.apply || !isWritableSource(service.source)) continue;
            try {
              const changes = planning.plan.get(service.source) ?? [];
              const rollbackFile = await saveRollbackBeforeWrite(
                service.source,
                service.label,
                changes,
                options,
                dependencies,
              );
              if (rollbackFile) {
                rollbackFiles.push(rollbackFile);
                if (!options.json) output.error(`Saved rollback file ${rollbackFile}`);
              }
              log.push(
                ...(await service.apply(changes, (done, total) => {
                  if (!options.json)
                    output.error(`Applying ${service.label} changes: ${done}/${total}`);
                })),
              );
            } catch (error) {
              if (error instanceof ApplyReloadError) log.push(...error.log);
              throw new ExecutionError(error, log, [], undefined, rollbackFiles);
            }
          }
          return log;
        }
      : undefined;
  const { applied, written } = await executeWrites(staged, apply);
  if (applied?.some((entry) => !entry.ok) || mismatched) output.setExitCode(1);
  const snapshot = snapshotInventory(
    planning.spools,
    planning.matches.suggestions.map((suggestion) => suggestion.pair.join(",")),
  );
  const changes = previous && diffSnapshots(previous, snapshot);
  reportWorkflow(
    options,
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
  return snapshot;
}
