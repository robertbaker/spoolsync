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

/** Applies a planned change set and serializes it for a service that accepts imports. */
export async function exportInventory(
  source: WritableSourceId,
  loaded: LoadResult,
  changes: PlannedChange[],
): Promise<InventoryExport> {
  if (!hasServiceCapability(source, "file-import"))
    throw new Error(`${source} does not support file imports.`);
  if (loaded.source !== source)
    throw new Error(
      `Cannot export ${loaded.source} inventory as ${source}. Load the target inventory first.`,
    );

  validateTargetChanges(source, changes, new Set(loaded.spools.map((spool) => spool.sourceId)));

  switch (source) {
    case "spoolman": {
      const result = (await import("../adapters/spoolman/file")).exportSpoolmanJson(
        loaded,
        changes,
      );
      return jsonExport(source, result);
    }
    case "spoolio": {
      const result = (await import("../adapters/spoolio")).exportSpoolioJson(
        loaded as import("../adapters/spoolio").SpoolioLoadResult,
        changes,
      );
      return jsonExport(source, result);
    }
    case "tigertag": {
      const result = (await import("../adapters/tigertag")).exportTtag(
        loaded as import("../adapters/tigertag").TigertagLoadResult,
        changes,
      );
      return {
        source,
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
    }
    case "threeDfp": {
      const result = (await import("../adapters/threeDfp")).exportThreeDfp(
        loaded as import("../adapters/threeDfp").ThreeDfpLoadResult,
        changes,
      );
      return {
        ...jsonExport(source, result),
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
    }
    case "bambuddy": {
      const result = (await import("../adapters/bambuddy")).exportBambuddyCsv(
        loaded as import("../adapters/bambuddy").BambuddyLoadResult,
        changes,
      );
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
    case "filameter": {
      const result = (await import("../adapters/filameter")).exportFilameter(
        loaded as import("../adapters/filameter").FilameterLoadResult,
        changes,
      );
      return {
        ...jsonExport(source, result),
        alternateFiles: [
          {
            extension: "csv",
            mediaType: "text/csv",
            text: result.csv,
            label: "CSV",
            warnings: [
              "CSV contains filament fields only. Use JSON to preserve backup metadata and document IDs.",
            ],
          },
        ],
      };
    }
    case "filadex": {
      const result = (await import("../adapters/filadex")).exportFiladex(
        loaded as import("../adapters/filadex").FiladexLoadResult,
        changes,
      );
      return {
        ...jsonExport(source, result),
        alternateFiles: [
          {
            extension: "csv",
            mediaType: "text/csv",
            text: result.csv,
            label: "CSV",
            warnings: ["CSV omits Filadex record IDs. Use JSON to keep them."],
          },
        ],
      };
    }
    case "filamentdb": {
      const result = (await import("../adapters/filamentdb")).exportFilamentDb(
        loaded as import("../adapters/filamentdb").FilamentDbLoadResult,
        changes,
      );
      return jsonExport(source, result);
    }
  }
}
