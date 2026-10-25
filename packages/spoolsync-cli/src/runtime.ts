import { readFile } from "node:fs/promises";

import { createEmptyInventory, exportInventory, loadInventoryFile } from "@spoolsync/core/workflow";

import type { Options } from "./args";
import { stageOutputFiles, validateOutputPaths } from "./output";
import { remoteServices, type RemoteService } from "./services";

export interface CliOutput {
  log(...values: unknown[]): void;
  warn(...values: unknown[]): void;
  error(...values: unknown[]): void;
  setExitCode(code: number): void;
}

export interface CliDependencies {
  readText(filename: string): Promise<string>;
  createEmptyInventory: typeof createEmptyInventory;
  loadInventoryFile: typeof loadInventoryFile;
  exportInventory: typeof exportInventory;
  validateOutputPaths: typeof validateOutputPaths;
  stageOutputFiles: typeof stageOutputFiles;
  remoteServices(options: Options): Iterable<RemoteService>;
}

/** Default composition; workflows can inject file, adapter, staging, and output implementations. */
export const defaultDependencies: CliDependencies = {
  readText: (filename) => readFile(filename, "utf8"),
  createEmptyInventory,
  loadInventoryFile,
  exportInventory,
  validateOutputPaths,
  stageOutputFiles,
  remoteServices: (options) => remoteServices(options, process.env),
};
