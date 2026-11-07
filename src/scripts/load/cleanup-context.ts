import type { LoadResult, SourceId } from "@spoolsync/core/core/model";

import type { CleanupController } from "./cleanup-controller";

/** What the panel remembers between draws. */
export interface CleanupState {
  /** Rows drawn so far; "Show more" draws the next batch. */
  limit: number;
}

/** What each section of the Clean up panel needs from the panel itself. */
export interface CleanupContext {
  readonly controller: CleanupController;
  readonly results: ReadonlyMap<SourceId, LoadResult>;
  readonly state: CleanupState;
  draw(): void;
  /** Refreshes the one-line summary on the panel header. */
  refreshSummary(): void;
  /** Runs a change, toasts the result, redraws, and keeps keyboard focus on the same control. */
  act(change: () => number, done: (count: number) => string): void;
  focusKey(key: string | null | undefined): void;
}
