import path from "node:path";

import type { PlannedChange } from "@spoolsync/core/core/compare";
import {
  WRITABLE_SOURCE_IDS,
  type LoadResult,
  type SourceId,
  type WritableSourceId,
} from "@spoolsync/core/core/model";
import { combinedInventoryCsv } from "@spoolsync/core/workflow";

import type { Options } from "./args";
import { combineStaged } from "./output";
import type { CliDependencies } from "./runtime";

function outputBase(source: WritableSourceId): string {
  return {
    spoolman: "spoolman-spools.json",
    spoolio: "spoolio.json",
    tigertag: "tigertag-spoolsync.ttag",
    threeDfp: "3dfilamentprofiles.json",
    bambuddy: "bambuddy.csv",
    filameter: "filameter.json",
    filadex: "filadex.json",
    filamentdb: "filamentdb-spools.json",
    filamentDbApp: "filament-db-snapshot.json",
  }[source];
}

export async function prepareExports(
  options: Options,
  loaded: ReadonlyMap<SourceId, LoadResult>,
  plan: ReadonlyMap<SourceId, PlannedChange[]>,
  dependencies: Pick<
    CliDependencies,
    "exportInventory" | "validateOutputPaths" | "stageOutputFiles"
  >,
) {
  // Serialize all exports before any filesystem or remote writes.
  const pendingFiles: Array<{ filename: string; text: string; bytes?: Uint8Array }> = [];
  const exportWarnings: Array<{ source: SourceId; message: string }> = [];
  if (options.outputDir) {
    for (const source of WRITABLE_SOURCE_IDS) {
      if (!options.inputs.has(source) && !options.empty.includes(source)) continue;
      const inventory = loaded.get(source)!;
      const result = await dependencies.exportInventory(source, inventory, plan.get(source) ?? []);
      const base = outputBase(source);
      const filename = path.join(
        options.outputDir,
        result.bytes && result.extension
          ? `${path.basename(base, path.extname(base))}.${result.extension}`
          : base,
      );
      pendingFiles.push({
        filename,
        text: result.text,
        ...(result.bytes ? { bytes: result.bytes } : {}),
      });
      for (const message of result.warnings) exportWarnings.push({ source, message });
      for (const alternate of result.alternateFiles ?? []) {
        for (const message of alternate.warnings ?? [])
          exportWarnings.push({ source, message: `${alternate.label}: ${message}` });
        pendingFiles.push({
          filename: path.join(
            options.outputDir,
            `${path.basename(filename, path.extname(filename))}.${alternate.extension}`,
          ),
          text: alternate.text,
        });
      }
    }
    await dependencies.validateOutputPaths(
      [...options.inputs.values()],
      pendingFiles.map((file) => file.filename),
    );
  }
  let staged = options.outputDir
    ? await dependencies.stageOutputFiles(options.outputDir, pendingFiles)
    : undefined;
  if (options.exportCsv) {
    // Serialized with the other exports, so nothing is written if any of them fails.
    try {
      const { csv } = combinedInventoryCsv([...loaded.values()]);
      await dependencies.validateOutputPaths(
        [...options.inputs.values()],
        [...pendingFiles.map((file) => file.filename), options.exportCsv],
      );
      staged = combineStaged(
        staged,
        await dependencies.stageOutputFiles(path.dirname(options.exportCsv), [
          { filename: options.exportCsv, text: csv },
        ]),
      );
    } catch (error) {
      await staged?.cleanup();
      throw error;
    }
  }
  return { staged, exportWarnings };
}
