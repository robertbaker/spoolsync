import type { ApplyLogEntry } from "./model";

export type ApplyServiceName =
  | "Spoolman"
  | "TigerTag"
  | "FilamentDB"
  | "Filament DB"
  | "Filadex"
  | "Bambuddy";

/**
 * Writes have already been attempted; callers must retain the log even if refresh fails. Lives
 * apart from `apply.ts` so a page can recognise it without loading every service's write code.
 */
export class ApplyReloadError extends Error {
  constructor(
    readonly service: ApplyServiceName,
    readonly log: ApplyLogEntry[],
    cause: unknown,
  ) {
    const succeeded = log.filter((entry) => entry.ok).length;
    super(
      `${service} apply finished (${succeeded} succeeded, ${log.length - succeeded} failed), but inventory refresh failed: ${cause instanceof Error ? cause.message : String(cause)}. Reload the inventory before retrying writes.`,
      { cause },
    );
    this.name = "ApplyReloadError";
  }
}
