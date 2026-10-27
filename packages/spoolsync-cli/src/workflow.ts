import { ApplyReloadError } from "@spoolsync/core/apply";
import type { ApplyLogEntry } from "@spoolsync/core/core/model";

import type { Options } from "./args";
import { ExecutionError, executeWrites } from "./execution";
import { prepareExports } from "./exports";
import { loadInputs } from "./inputs";
import { createCliPlan } from "./planning";
import { reportWorkflow } from "./report";
import type { CliDependencies, CliOutput } from "./runtime";

export async function runWorkflow(
  options: Options,
  dependencies: CliDependencies,
  output: CliOutput,
): Promise<void> {
  const { loaded, services } = await loadInputs(options, dependencies);
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
  reportWorkflow(options, { loaded, planning, applied, written, exportWarnings }, output);
}
