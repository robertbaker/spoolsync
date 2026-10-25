import {
  hasServiceCapability,
  type LoadResult,
  type SourceId,
  type WritableSourceId,
} from "../core/model";

/** Parses an inventory file with the adapter for its selected source. Adapter code stays lazy. */
export async function loadInventoryFile(source: SourceId, text: string): Promise<LoadResult> {
  const loaded = await parseInventoryFile(source, text);
  const ids = new Set<string>();
  for (const spool of loaded.spools) {
    if (ids.has(spool.sourceId))
      throw new Error(
        `Duplicate ${source} record ID "${spool.sourceId}". Each spool must have a unique ID.`,
      );
    ids.add(spool.sourceId);
  }
  return { ...loaded, origin: "file" };
}

async function parseInventoryFile(source: SourceId, text: string): Promise<LoadResult> {
  if (!hasServiceCapability(source, "file-export"))
    throw new Error(`${source} does not support file exports.`);

  // Windows exports may include a UTF-8 BOM, including in JSON files.
  text = text.replace(/^\uFEFF/, "");
  if (!text.trim())
    throw new Error("The inventory file is empty. Choose an export from your service.");
  if (source === "spoolman" && text.startsWith("SQLite format 3\0"))
    throw new Error(
      "This is a SQLite database. Export your spool inventory from Spoolman as JSON or CSV and select that file.",
    );

  switch (source) {
    case "spoolman":
      return (await import("../adapters/spoolman/file")).loadSpoolmanFile(text);
    case "spoolstock":
      return (await import("../adapters/spoolstock")).loadSpoolstockCsv(text);
    case "spoolio":
      return (await import("../adapters/spoolio")).loadSpoolioJson(text);
    case "tigertag":
      return (await import("../adapters/tigertag")).loadTtag(text);
    case "threeDfp":
      return (await import("../adapters/threeDfp")).loadThreeDfpFile(text);
    case "bambuddy":
      return (await import("../adapters/bambuddy")).loadBambuddyFile(text);
    case "filameter":
      return (await import("../adapters/filameter")).loadFilameterFile(text);
    case "filadex":
      return (await import("../adapters/filadex")).loadFiladexFile(text);
    case "filamentdb":
      return (await import("../adapters/filamentdb")).loadFilamentDbFile(text);
  }
}

/** Creates an empty source inventory using the real adapter's normal parser and defaults. */
export async function createEmptyInventory(source: SourceId): Promise<LoadResult> {
  if (!hasServiceCapability(source, "file-import"))
    throw new Error(`${source} is read-only and cannot be an empty target inventory.`);
  const templates: Record<WritableSourceId, string> = {
    spoolman: "[]",
    spoolio: '{"version":1,"filaments":[],"printLogs":[],"printers":[]}',
    tigertag: "{}",
    threeDfp: "[]",
    bambuddy: "[]",
    filameter: '{"regular":[]}',
    filadex: "[]",
    filamentdb: "[]",
  };
  return loadInventoryFile(source, templates[source as WritableSourceId]);
}
