import type { PlannedChange } from "@spoolsync/core/core/compare";
import type { LoadResult, WritableSourceId } from "@spoolsync/core/core/model";
import type { exportInventory } from "@spoolsync/core/workflow";

import { cleanErrorText, type SyncHistoryRecord } from "~/lib/browser/storage/sync-history";

import { h, notice } from "../dom";
import { downloadPresentation } from "./download-presentation";
import { button, reportExportError } from "./presentation";

export interface DownloadDependencies {
  exportInventory: typeof exportInventory;
  download(filename: string, content: string | Uint8Array, mediaType: string): void;
  today(): string;
  /** Called once per finished download attempt, successful or not. */
  record?(entry: SyncHistoryRecord): void;
}

export interface DownloadButtonOptions {
  label: string;
  variant: "primary" | "outline";
  alternateIndex?: number;
}

/** Shared export/download lifecycle; format-specific copy is supplied by presentation metadata. */
export class DownloadController {
  constructor(private readonly dependencies: DownloadDependencies) {}

  button(
    source: WritableSourceId,
    inventory: () => LoadResult,
    changes: PlannedChange[],
    status: HTMLElement,
    options: DownloadButtonOptions,
  ): HTMLButtonElement {
    return button(
      options.label,
      () => {
        void this.run(source, inventory, changes, status, options.alternateIndex);
      },
      options.variant,
    );
  }

  private remember(source: WritableSourceId, changes: PlannedChange[], error?: string): void {
    const updates = changes.filter((change) => change.kind === "update").length;
    try {
      this.dependencies.record?.({
        source,
        via: "download",
        updates,
        creations: changes.length - updates,
        succeeded: error ? 0 : changes.length,
        failed: error ? changes.length || 1 : 0,
        ...(error ? { error: cleanErrorText(error) } : {}),
      });
    } catch {
      // A history failure must never hide the result of the download itself.
    }
  }

  async run(
    source: WritableSourceId,
    inventory: () => LoadResult,
    changes: PlannedChange[],
    status: HTMLElement,
    alternateIndex?: number,
  ): Promise<void> {
    try {
      const result = await this.dependencies.exportInventory(source, inventory(), changes);
      const alternate =
        alternateIndex === undefined ? undefined : result.alternateFiles?.[alternateIndex];
      const mediaType = alternate?.mediaType ?? result.mediaType;
      const presentation = downloadPresentation(source);
      const extension =
        alternate?.extension ??
        presentation.extension ??
        result.extension ??
        (mediaType === "text/csv" ? "csv" : "json");
      const warnings = [...result.warnings, ...(alternate?.warnings ?? [])];
      this.dependencies.download(
        `${presentation.prefix}-${this.dependencies.today()}.${extension}`,
        alternate?.text ?? result.bytes ?? result.text,
        mediaType,
      );
      this.remember(source, changes);
      const message = presentation.describe(result);
      status.replaceChildren(
        notice(
          message.tone ?? (warnings.length ? "warning" : "success"),
          message.title,
          h("p", { class: "mt-1" }, message.detail),
          ...warnings.map((warning) => h("p", { class: "mt-1" }, warning)),
        ),
      );
    } catch (error) {
      this.remember(source, changes, error instanceof Error ? error.message : String(error));
      reportExportError(status, error);
    }
  }
}
