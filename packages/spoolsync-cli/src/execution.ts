import { ApplyReloadError } from "@spoolsync/core/apply";
import type { ApplyLogEntry } from "@spoolsync/core/core/model";

import { ExportCommitError, type StagedOutput } from "./output";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export class ExecutionError extends Error {
  constructor(
    cause: unknown,
    readonly applied: ApplyLogEntry[] | undefined,
    readonly written: string[],
    readonly cleanupError?: unknown,
  ) {
    super(
      `${message(cause)}${cleanupError === undefined ? "" : ` Staging cleanup also failed: ${message(cleanupError)}`}`,
      { cause },
    );
    this.name = "ExecutionError";
  }
}

/** Retains completed work and always attempts staging cleanup without hiding the primary error. */
export async function executeWrites(
  staged: StagedOutput | undefined,
  apply?: () => Promise<ApplyLogEntry[]>,
): Promise<{ applied: ApplyLogEntry[] | undefined; written: string[] }> {
  let applied: ApplyLogEntry[] | undefined;
  let written: string[] = [];
  let failed = false;
  let failure: unknown;
  try {
    if (apply) applied = await apply();
    if (staged) written = await staged.commit();
  } catch (error) {
    failed = true;
    failure = error;
    if (error instanceof ApplyReloadError) applied = error.log;
    if (error instanceof ExecutionError) applied = error.applied;
    if (error instanceof ExportCommitError) written = error.written;
  }
  let cleanupError: unknown;
  try {
    await staged?.cleanup();
  } catch (error) {
    if (failed) cleanupError = error;
    else {
      failed = true;
      failure = error;
    }
  }
  if (failed) throw new ExecutionError(failure, applied, written, cleanupError);
  return { applied, written };
}
