import { ApplyReloadError, type ApplyAndReloadResult } from "@spoolsync/core/apply";
import type { PlannedChange } from "@spoolsync/core/core/compare";
import {
  isWritableSource,
  type ApplyLogEntry,
  type LoadResult,
  type SourceId,
  type WritableSourceId,
} from "@spoolsync/core/core/model";
import { snapshotMatchesTarget } from "@spoolsync/core/core/target";
import type { RollbackDocument } from "@spoolsync/core/workflow";

import { cleanErrorText, type SyncHistoryRecord } from "~/lib/browser/storage/sync-history";

import { confirmDialog } from "../confirm-dialog";
import { notice } from "../dom";

/** What a confirmation should tell the person before anything is written. */
export interface WriteDetails {
  target: string;
  updates: number;
  creations: number;
  /** Whether a rollback file will be saved first. */
  rollback: boolean;
}

const count = (value: number, noun: string) => `${value} ${noun}${value === 1 ? "" : "s"}`;

function confirmWriteDialog(message: string, details: WriteDetails): Promise<boolean> {
  const parts = [
    ...(details.updates ? [count(details.updates, "update")] : []),
    ...(details.creations ? [count(details.creations, "new record")] : []),
  ];
  return confirmDialog({
    title: message,
    body: [
      `${parts.join(" and ")} will be sent to ${details.target}.`,
      details.rollback
        ? "A rollback file is saved first so you can put the old values back."
        : "No rollback file will be saved, so this cannot be undone from SpoolSync.",
    ],
    confirmLabel: "Write changes",
    tone: "danger",
  });
}

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

/** Saves a record of what is about to change, so a write can be taken back. */
export interface RollbackHook {
  enabled(): boolean;
  build(source: WritableSourceId, changes: PlannedChange[], target: string): RollbackDocument;
  /** Throws when the file could not be saved. */
  save(document: RollbackDocument): void;
}

export interface ApplyContext {
  loaded: Map<SourceId, LoadResult>;
  onApplied(): void;
}

export class ApplyController {
  readonly logs = new Map<SourceId, ApplyLogEntry[]>();
  private applying = false;

  constructor(
    private readonly services: Partial<Record<SourceId, ApplyService>>,
    private readonly context: ApplyContext,
    private readonly saveInventory: (inventory: LoadResult) => void,
    private readonly confirmWrite: (
      message: string,
      details: WriteDetails,
    ) => boolean | Promise<boolean> = confirmWriteDialog,
    /** Called once per attempted write run, after it finishes (including failed runs). */
    private readonly record?: (entry: SyncHistoryRecord) => void,
    /** Called after the write is confirmed and before anything is sent. */
    private readonly rollback?: RollbackHook,
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
    if (this.applying) return;
    const service = this.services[source];
    const target = service?.connect();
    if (!service || !target) return;
    const inventory = this.context.loaded.get(source);
    if (!inventory || !snapshotMatchesTarget(inventory, target.identity)) {
      status.replaceChildren(notice("error", service.changedMessage));
      return;
    }
    const updates = changes.filter((change) => change.kind === "update").length;
    const confirmed = await this.confirmWrite(
      `Write ${changes.length} change${changes.length === 1 ? "" : "s"} to ${target.description}?`,
      {
        target: target.description,
        updates,
        creations: changes.length - updates,
        rollback: Boolean(this.rollback?.enabled() && isWritableSource(source)),
      },
    );
    if (!confirmed || this.applying) return;
    this.applying = true;
    try {
      if (this.rollback?.enabled() && isWritableSource(source)) {
        const document = this.rollback.build(source, changes, target.description);
        if (document.updates.length || document.creations.length) {
          try {
            this.rollback.save(document);
          } catch {
            // Writing without the safety net would defeat the point, so nothing is written.
            status.replaceChildren(
              notice(
                "error",
                "Nothing was written",
                'The rollback file could not be saved. Turn off "Save a rollback file" to write without one.',
              ),
            );
            return;
          }
        }
      }
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
    } finally {
      this.applying = false;
    }
  }
}
