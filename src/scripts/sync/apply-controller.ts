import { ApplyReloadError, type ApplyAndReloadResult } from "@spoolsync/core/apply";
import type { PlannedChange } from "@spoolsync/core/core/compare";
import type { ApplyLogEntry, LoadResult, SourceId } from "@spoolsync/core/core/model";
import { snapshotMatchesTarget } from "@spoolsync/core/core/target";

import { cleanErrorText, type SyncHistoryRecord } from "~/lib/browser/storage/sync-history";

import { notice } from "../dom";

export interface ApplyTarget {
  identity: string;
  description: string;
  apply(
    changes: PlannedChange[],
    progress: (done: number, total: number) => void,
  ): Promise<ApplyAndReloadResult>;
}

/** Resolve credentials at invocation time so saved connections cannot become stale. */
export interface ApplyService {
  changedMessage: string;
  connect(): ApplyTarget | null;
}

export interface ApplyContext {
  loaded: Map<SourceId, LoadResult>;
  onApplied(): void;
}

export class ApplyController {
  readonly logs = new Map<SourceId, ApplyLogEntry[]>();

  constructor(
    private readonly services: Partial<Record<SourceId, ApplyService>>,
    private readonly context: ApplyContext,
    private readonly saveInventory: (inventory: LoadResult) => void,
    private readonly confirmWrite: (message: string) => boolean = (message) => confirm(message),
    /** Called once per attempted write run, after it finishes (including failed runs). */
    private readonly record?: (entry: SyncHistoryRecord) => void,
  ) {}

  private remember(
    source: SourceId,
    changes: PlannedChange[],
    log: ApplyLogEntry[],
    error?: string,
  ): void {
    if (!this.record) return;
    const updates = changes.filter((change) => change.kind === "update").length;
    const failed = log.filter((entry) => !entry.ok).length;
    try {
      this.record({
        source,
        via: "api",
        updates,
        creations: changes.length - updates,
        succeeded: log.length - failed,
        failed,
        ...(error ? { error: cleanErrorText(error) } : {}),
      });
    } catch {
      // A history failure must never hide the result of the write itself.
    }
  }

  async run(source: SourceId, changes: PlannedChange[], status: HTMLElement): Promise<void> {
    const service = this.services[source];
    const target = service?.connect();
    if (!service || !target) return;
    const inventory = this.context.loaded.get(source);
    if (!inventory || !snapshotMatchesTarget(inventory, target.identity)) {
      status.replaceChildren(notice("error", service.changedMessage));
      return;
    }
    if (
      !this.confirmWrite(
        `Write ${changes.length} change${changes.length === 1 ? "" : "s"} to ${target.description}?`,
      )
    )
      return;
    status.replaceChildren(notice("info", "Applying…"));
    try {
      const result = await target.apply(changes, (done, total) => {
        status.replaceChildren(notice("info", `Applying… ${done} of ${total}`));
      });
      this.logs.set(source, result.log);
      this.remember(source, changes, result.log);
      this.context.loaded.set(source, result.inventory);
      this.saveInventory(result.inventory);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const log = [
        ...(error instanceof ApplyReloadError ? error.log : []),
        { groupId: "", ok: false, message },
      ];
      this.logs.set(source, log);
      // A refresh failure after writes keeps the writes' counts; the extra entry is the error.
      this.remember(source, changes, log, message);
    }
    this.context.onApplied();
  }
}
