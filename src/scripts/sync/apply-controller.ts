import { ApplyReloadError, type ApplyAndReloadResult } from "@spoolsync/core/apply";
import type { PlannedChange } from "@spoolsync/core/core/compare";
import type { ApplyLogEntry, LoadResult, SourceId } from "@spoolsync/core/core/model";
import { snapshotMatchesTarget } from "@spoolsync/core/core/target";

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
  ) {}

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
      this.context.loaded.set(source, result.inventory);
      this.saveInventory(result.inventory);
    } catch (error) {
      this.logs.set(source, [
        ...(error instanceof ApplyReloadError ? error.log : []),
        { groupId: "", ok: false, message: error instanceof Error ? error.message : String(error) },
      ]);
    }
    this.context.onApplied();
  }
}
