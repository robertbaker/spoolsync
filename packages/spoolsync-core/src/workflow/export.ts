import type { PlannedChange } from "../core/compare";
import { hasServiceCapability, type LoadResult, type WritableSourceId } from "../core/model";
import { validateTargetChanges } from "../core/plan";
import type { InventoryExport } from "./types";

interface JsonExportResult {
  json: string;
  total: number;
  updated: number;
  created: number;
  warnings: string[];
}

interface CsvExportResult {
  csv: string;
  total: number;
  updated: number;
  created: number;
  warnings: string[];
}

export type ExporterStrategy = (
  loaded: LoadResult,
  changes: PlannedChange[],
) => Promise<InventoryExport>;

export type ExporterRegistry = Record<WritableSourceId, ExporterStrategy>;

function jsonExport(source: WritableSourceId, result: JsonExportResult): InventoryExport {
  return {
    source,
    text: result.json,
    mediaType: "application/json",
    total: result.total,
    updated: result.updated,
    created: result.created,
    warnings: result.warnings,
  };
}

function csvExport(source: WritableSourceId, result: CsvExportResult): InventoryExport {
  return {
    source,
    text: result.csv,
    mediaType: "text/csv",
    total: result.total,
    updated: result.updated,
    created: result.created,
    warnings: result.warnings,
  };
}

function withAlternateCsv(
  source: WritableSourceId,
  result: JsonExportResult & { csv: string },
  warning: string,
): InventoryExport {
  return {
    ...jsonExport(source, result),
    alternateFiles: [
      {
        extension: "csv",
        mediaType: "text/csv",
        text: result.csv,
        label: "CSV",
        warnings: [warning],
      },
    ],
  };
}

const DEFAULT_EXPORTERS = {
  spoolman: async (loaded, changes) => {
    const result = (await import("../adapters/spoolman/file")).exportSpoolmanJson(loaded, changes);
    return jsonExport("spoolman", result);
  },
  spoolio: async (loaded, changes) => {
    const result = (await import("../adapters/spoolio")).exportSpoolioJson(
      loaded as import("../adapters/spoolio").SpoolioLoadResult,
      changes,
    );
    return jsonExport("spoolio", result);
  },
  tigertag: async (loaded, changes) => {
    const result = (await import("../adapters/tigertag")).exportTtag(
      loaded as import("../adapters/tigertag").TigertagLoadResult,
      changes,
    );
    return {
      source: "tigertag",
      text: result.json,
      mediaType: "application/json",
      total: result.records,
      updated: result.updated,
      created: result.created,
      warnings: [
        ...result.warnings,
        ...(!result.restoresInPlace && result.records > 0
          ? [
              "This TigerTag file has no exportedBy account. Select Restore in Tiger Studio's import preview to preserve remaining weights and update these IDs; Import makes new copies at full weight.",
            ]
          : []),
      ],
      records: result.records,
    };
  },
  threeDfp: async (loaded, changes) => {
    const result = (await import("../adapters/threeDfp")).exportThreeDfp(
      loaded as import("../adapters/threeDfp").ThreeDfpLoadResult,
      changes,
    );
    return {
      ...jsonExport("threeDfp", result),
      alternateFiles: [
        {
          extension: "csv",
          mediaType: "text/csv",
          text: result.csv,
          label: "CSV",
          warnings: result.csvWarnings,
        },
      ],
    };
  },
  bambuddy: async (loaded, changes) => {
    const result = (await import("../adapters/bambuddy")).exportBambuddyCsv(
      loaded as import("../adapters/bambuddy").BambuddyLoadResult,
      changes,
    );
    return csvExport("bambuddy", result);
  },
  printstudio: async (_loaded, changes) => {
    const result = (await import("../adapters/printstudio")).exportPrintStudio(changes);
    return jsonExport("printstudio", { ...result, total: result.created });
  },
  filameter: async (loaded, changes) => {
    const result = (await import("../adapters/filameter")).exportFilameter(
      loaded as import("../adapters/filameter").FilameterLoadResult,
      changes,
    );
    return withAlternateCsv(
      "filameter",
      result,
      "CSV contains filament fields only. Use JSON to preserve backup metadata and document IDs.",
    );
  },
  filadex: async (loaded, changes) => {
    const result = (await import("../adapters/filadex")).exportFiladex(
      loaded as import("../adapters/filadex").FiladexLoadResult,
      changes,
    );
    return withAlternateCsv(
      "filadex",
      result,
      "CSV omits Filadex record IDs. Use JSON to keep them.",
    );
  },
  filamentDbApp: async (loaded, changes) => {
    const adapter = await import("../adapters/filamentDbApp");
    const file = loaded as import("../adapters/filamentDbApp").FilamentDbAppLoadResult;
    // A spool CSV has no snapshot behind it, so it is written back as an import CSV.
    if (!file.file.document)
      return csvExport("filamentDbApp", adapter.exportFilamentDbAppCsv(file, changes));
    return jsonExport("filamentDbApp", adapter.exportFilamentDbApp(file, changes));
  },
  filamentdb: async (loaded, changes) => {
    const result = (await import("../adapters/filamentdb")).exportFilamentDb(
      loaded as import("../adapters/filamentdb").FilamentDbLoadResult,
      changes,
    );
    // The ZIP is what FilamentDB's /api/spools/import takes; the JSON list stays available.
    return {
      source: "filamentdb",
      text: result.json,
      bytes: result.zip,
      extension: "zip",
      mediaType: "application/zip",
      total: result.total,
      updated: result.updated,
      created: result.created,
      warnings: result.warnings,
      alternateFiles: [
        {
          extension: "json",
          mediaType: "application/json",
          text: result.json,
          label: "JSON",
          warnings: [
            "A JSON list is not accepted by /api/spools/import: POST each entry to /api/spools, or use the ZIP.",
          ],
        },
      ],
    };
  },
} satisfies ExporterRegistry;

/** Applies a planned change set and serializes it for a service that accepts imports. */
export async function exportInventory(
  source: WritableSourceId,
  loaded: LoadResult,
  changes: PlannedChange[],
  exporters: Readonly<ExporterRegistry> = DEFAULT_EXPORTERS,
): Promise<InventoryExport> {
  if (!hasServiceCapability(source, "file-import"))
    throw new Error(`${source} does not support file imports.`);
  if (loaded.source !== source)
    throw new Error(
      `Cannot export ${loaded.source} inventory as ${source}. Load the target inventory first.`,
    );

  validateTargetChanges(source, changes, new Set(loaded.spools.map((spool) => spool.sourceId)));

  return exporters[source](loaded, changes);
}
