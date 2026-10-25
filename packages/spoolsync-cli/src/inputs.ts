import type { LoadResult, SourceId } from "@spoolsync/core/core/model";

import type { Options } from "./args";
import type { CliDependencies } from "./runtime";
import type { RemoteService } from "./services";

export async function loadInputs(
  options: Options,
  dependencies: Pick<
    CliDependencies,
    "readText" | "createEmptyInventory" | "loadInventoryFile" | "remoteServices"
  >,
) {
  const loaded = new Map<SourceId, LoadResult>();
  for (const source of options.empty)
    loaded.set(source, await dependencies.createEmptyInventory(source));
  for (const [source, filename] of options.inputs) {
    try {
      const file = await dependencies.readText(filename);
      loaded.set(source, await dependencies.loadInventoryFile(source, file));
    } catch (error) {
      throw new Error(
        `Could not load ${source} inventory from "${filename}": ${error instanceof Error ? error.message : String(error)}`,
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
