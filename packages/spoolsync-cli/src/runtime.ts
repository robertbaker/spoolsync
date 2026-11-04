import { readFile } from "node:fs/promises";

import {
  createEmptyInventory,
  exportInventory,
  loadInventoryFile,
  type RollbackDocument,
} from "@spoolsync/core/workflow";

import type { Options } from "./args";
import { stageOutputFiles, validateOutputPaths } from "./output";
import { writeRollbackFile } from "./rollback";
import { remoteServices, type RemoteService } from "./services";

export interface CliOutput {
  log(...values: unknown[]): void;
  warn(...values: unknown[]): void;
  error(...values: unknown[]): void;
  setExitCode(code: number): void;
}

export interface CliDependencies {
  readText(filename: string): Promise<string>;
  readBytes(filename: string): Promise<Uint8Array>;
  createEmptyInventory: typeof createEmptyInventory;
  loadInventoryFile: typeof loadInventoryFile;
  exportInventory: typeof exportInventory;
  validateOutputPaths: typeof validateOutputPaths;
  stageOutputFiles: typeof stageOutputFiles;
  remoteServices(options: Options): Iterable<RemoteService>;
  /** Saves a rollback file before a write and returns where it went. */
  saveRollback(document: RollbackDocument, options: Options): Promise<string>;
  now(): Date;
}

/** Default composition; workflows can inject file, adapter, staging, and output implementations. */
export const defaultDependencies: CliDependencies = {
  readText: (filename) => readFile(filename, "utf8"),
  readBytes: async (filename) => new Uint8Array(await readFile(filename)),
  createEmptyInventory,
  loadInventoryFile,
  exportInventory,
  validateOutputPaths,
  stageOutputFiles,
  remoteServices: (options) => remoteServices(options, process.env),
  saveRollback: writeRollbackFile,
  now: () => new Date(),
};
