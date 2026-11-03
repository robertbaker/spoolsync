import { ApplyReloadError } from "@spoolsync/core/apply";
import type { ApplyLogEntry } from "@spoolsync/core/core/model";
import { diffSnapshots, snapshotInventory, type InventorySnapshot } from "@spoolsync/core/workflow";

import type { Options } from "./args";
import { ExecutionError, executeWrites } from "./execution";
import { prepareExports } from "./exports";
import { loadInputs } from "./inputs";
import { createCliPlan } from "./planning";
import { reportInventoryOnly, reportWorkflow } from "./report";
import type { CliDependencies, CliOutput } from "./runtime";

export async function runWorkflow(
  options: Options,
  dependencies: CliDependencies,
  output: CliOutput,
  /** With `--watch`, the previous run's snapshot, so this run can report what changed. */
  previous?: InventorySnapshot,
): Promise<InventorySnapshot> {
  const { loaded, services } = await loadInputs(options, dependencies);
  const loadedSpools = [...loaded.values()].flatMap((result) => result.spools);
  if (options.summary || options.reorder || (options.exportCsv && loaded.size < 2)) {
    // Nothing to compare: a report of what is loaded, an export of it, or both.
    const { staged } = await prepareExports(options, loaded, new Map(), dependencies);
    const { written } = await executeWrites(staged);
    const snapshot = snapshotInventory(loadedSpools);
    reportInventoryOnly(
      options,
      loaded,
      written,
      output,
      previous && diffSnapshots(previous, snapshot),
    );
    return snapshot;
  }
  const planning = createCliPlan(options, loaded);
  const { staged, exportWarnings } = await prepareExports(
    options,
    loaded,
    planning.plan,
    dependencies,
  );
  const apply =
    options.apply && services.length
      ? async () => {
          const log: ApplyLogEntry[] = [];
          for (const service of services) {
            try {
              log.push(
                ...(await service.apply(planning.plan.get(service.source) ?? [], (done, total) => {
                  if (!options.json)
                    output.error(`Applying ${service.label} changes: ${done}/${total}`);
                })),
              );
            } catch (error) {
              if (error instanceof ApplyReloadError) log.push(...error.log);
              throw new ExecutionError(error, log, []);
            }
          }
          return log;
        }
      : undefined;
  const { applied, written } = await executeWrites(staged, apply);
  if (applied?.some((entry) => !entry.ok)) output.setExitCode(1);
  const snapshot = snapshotInventory(
    planning.spools,
    planning.matches.suggestions.map((suggestion) => suggestion.pair.join(",")),
  );
  const changes = previous && diffSnapshots(previous, snapshot);
  reportWorkflow(
    options,
    { loaded, planning, applied, written, exportWarnings, ...(changes ? { changes } : {}) },
    output,
  );
  return snapshot;
}
