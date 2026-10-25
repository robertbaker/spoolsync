import type { WritableSourceId } from "@spoolsync/core/core/model";
import { SOURCE_LABELS } from "@spoolsync/core/core/model";
import type { InventoryExport } from "@spoolsync/core/workflow";

export interface DownloadPresentation {
  prefix: string;
  extension?: string;
  describe(result: InventoryExport): { title: string; detail: string; tone?: "warning" };
}

export function downloadPresentation(source: WritableSourceId): DownloadPresentation {
  switch (source) {
    case "spoolman":
      return {
        prefix: "spoolman-spools",
        extension: "json",
        describe: (result) => ({
          title: `Downloaded ${result.total} spool${result.total === 1 ? "" : "s"}`,
          detail: `${result.updated} updated, ${result.created} new (new spools have negative IDs until Spoolman assigns real ones).`,
        }),
      };
    case "spoolio":
      return {
        prefix: "spoolio",
        extension: "json",
        describe: (result) => ({
          title: `Downloaded ${result.total} filament${result.total === 1 ? "" : "s"}`,
          detail: `${result.updated} updated, ${result.created} new. Import the file in spoolio.net settings.`,
        }),
      };
    case "tigertag":
      return {
        prefix: "tigertag-spoolsync",
        extension: "ttag",
        describe(result) {
          const count = result.records ?? result.total;
          return {
            title: `Downloaded ${count} record${count === 1 ? "" : "s"}`,
            tone: "warning",
            detail: `${result.updated} updated, ${result.created} new. Open the file in Tiger Studio Manager and choose Restore in the preview to preserve IDs and remaining weights. Import creates copies at full weight.`,
          };
        },
      };
    default:
      return {
        prefix: source.toLowerCase(),
        describe: (result) => ({
          title: `Downloaded ${result.total} ${SOURCE_LABELS[source]} row${result.total === 1 ? "" : "s"}`,
          detail: `${result.updated} updated, ${result.created} new.`,
        }),
      };
  }
}
