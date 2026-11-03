import {
  isBinarySource,
  SOURCE_LABELS,
  type LoadResult,
  type SourceId,
} from "@spoolsync/core/core/model";
import { detectInventorySources } from "@spoolsync/core/workflow";

import type { Options } from "./args";
import { sourceFlag } from "./parse-args";
import type { CliDependencies } from "./runtime";
import type { RemoteService } from "./services";

export async function loadInputs(
  options: Options,
  dependencies: Pick<
    CliDependencies,
    "readText" | "readBytes" | "createEmptyInventory" | "loadInventoryFile" | "remoteServices"
  >,
) {
  const loaded = new Map<SourceId, LoadResult>();
  for (const source of options.empty)
    loaded.set(source, await dependencies.createEmptyInventory(source));
  for (const [source, filename] of options.inputs) {
    try {
      const file = isBinarySource(source)
        ? await dependencies.readBytes(filename)
        : await dependencies.readText(filename);
      loaded.set(source, await dependencies.loadInventoryFile(source, file));
    } catch (error) {
      throw new Error(
        `Could not load ${source} inventory from "${filename}": ${await loadFailureReason(error, source, filename, dependencies)}`,
      );
    }
  }
  const services: RemoteService[] = [];
  for (const service of dependencies.remoteServices(options)) {
    loaded.set(service.source, await service.load());
    services.push(service);
  }
  return { loaded, services };
}

/**
 * Explains a failed load: a missing file says so plainly, and a file that another service's parser
 * reads is named, so a wrong flag (such as `--spoolio` on a SpoolKeep backup) is easy to correct.
 */
async function loadFailureReason(
  error: unknown,
  source: SourceId,
  filename: string,
  dependencies: Pick<CliDependencies, "readBytes">,
): Promise<string> {
  if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT")
    return `file not found. Check the path (relative paths are resolved from ${process.cwd()}).`;
  const reason = error instanceof Error ? error.message : String(error);
  try {
    const matches = (
      await detectInventorySources(filename, await dependencies.readBytes(filename))
    ).filter((match) => match.source !== source);
    if (matches.length === 1) {
      const match = matches[0]!;
      const flag = sourceFlag(match.source);
      return `${reason} This file looks like a ${SOURCE_LABELS[match.source]} export${flag ? `; try ${flag} instead` : ""}.`;
    }
  } catch {
    // Detection is only a hint; the original reason is what matters.
  }
  return reason;
}
