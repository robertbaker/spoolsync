import type { PlannedChange } from "@spoolsync/core/core/compare";
import type { LoadResult, WritableSourceId } from "@spoolsync/core/core/model";
import type { exportInventory } from "@spoolsync/core/workflow";

import { h, notice } from "../dom";
import { downloadPresentation } from "./download-presentation";
import { button, reportExportError } from "./presentation";

export interface DownloadDependencies {
  exportInventory: typeof exportInventory;
  download(filename: string, text: string, mediaType: string): void;
  today(): string;
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
        presentation.extension ??
        alternate?.extension ??
        (mediaType === "text/csv" ? "csv" : "json");
      const warnings = [...result.warnings, ...(alternate?.warnings ?? [])];
      this.dependencies.download(
        `${presentation.prefix}-${this.dependencies.today()}.${extension}`,
        alternate?.text ?? result.text,
        mediaType,
      );
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
      reportExportError(status, error);
    }
  }
}
