import {
  hasServiceCapability,
  type LoadResult,
  type SourceId,
  type WritableSourceId,
} from "../core/model";

export type LoaderStrategy = (input: string | Uint8Array) => Promise<LoadResult>;
export type LoaderRegistry = Record<SourceId, LoaderStrategy>;

function decodeInventoryText(input: string | Uint8Array): string {
  let text = typeof input === "string" ? input : new TextDecoder().decode(input);
  // Windows exports may include a UTF-8 BOM, including in JSON files.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (!/\S/.test(text))
    throw new Error("The inventory file is empty. Choose an export from your service.");
  return text;
}

function textLoader(load: (text: string) => Promise<LoadResult>): LoaderStrategy {
  return (input) => load(decodeInventoryText(input));
}

function binaryLoader(
  source: SourceId,
  load: (bytes: Uint8Array) => Promise<LoadResult>,
): LoaderStrategy {
  return (input) => {
    const bytes = typeof input === "string" ? undefined : input;
    if (!bytes?.byteLength)
      throw new Error("The inventory file is empty. Choose an export from your service.");
    if (typeof input === "string") throw new Error(`${source} inventories must be read as bytes.`);
    return load(bytes);
  };
}

const DEFAULT_LOADERS = {
  spoolman: textLoader(async (text) => {
    if (text.startsWith("SQLite format 3\0"))
      throw new Error(
        "This is a SQLite database. Export your spool inventory from Spoolman as JSON or CSV and select that file.",
      );
    return (await import("../adapters/spoolman/file")).loadSpoolmanFile(text);
  }),
  spoolstock: textLoader(async (text) =>
    (await import("../adapters/spoolstock")).loadSpoolstockCsv(text),
  ),
  spoolio: textLoader(async (text) => (await import("../adapters/spoolio")).loadSpoolioJson(text)),
  tigertag: textLoader(async (text) => (await import("../adapters/tigertag")).loadTtag(text)),
  threeDfp: textLoader(async (text) =>
    (await import("../adapters/threeDfp")).loadThreeDfpFile(text),
  ),
  bambuddy: textLoader(async (text) =>
    (await import("../adapters/bambuddy")).loadBambuddyFile(text),
  ),
  filameter: textLoader(async (text) =>
    (await import("../adapters/filameter")).loadFilameterFile(text),
  ),
  filadex: textLoader(async (text) => (await import("../adapters/filadex")).loadFiladexFile(text)),
  filamentDbApp: textLoader(async (text) =>
    (await import("../adapters/filamentDbApp")).loadFilamentDbAppFile(text),
  ),
  spoolhoarder: textLoader(async (text) =>
    (await import("../adapters/spoolhoarder")).loadSpoolHoarderCsv(text),
  ),
  spoolapp: textLoader(async (text) =>
    (await import("../adapters/spoolapp")).loadSpoolAppJson(text),
  ),
  printstudio: textLoader(async (text) =>
    (await import("../adapters/printstudio")).loadPrintStudioFile(text),
  ),
  spoolkeep: textLoader(async (text) =>
    (await import("../adapters/spoolkeep")).loadSpoolKeepJson(text),
  ),
  filamentdb: async (input) => (await import("../adapters/filamentdb")).loadFilamentDbInput(input),
  spoolmaster: binaryLoader("spoolmaster", async (bytes) =>
    (await import("../adapters/spoolmaster")).loadSpoolmasterXlsx(bytes),
  ),
} satisfies LoaderRegistry;

const EMPTY_TEMPLATES = {
  spoolman: "[]",
  spoolio: '{"version":1,"filaments":[],"printLogs":[],"printers":[]}',
  tigertag: "{}",
  threeDfp: "[]",
  bambuddy: "[]",
  printstudio: "[]",
  filameter: '{"regular":[]}',
  filadex: "[]",
  filamentDbApp: "[]",
  filamentdb: "[]",
} satisfies Record<WritableSourceId, string>;

/**
 * Parses an inventory file with the adapter for its selected source. Adapter code stays lazy.
 * Binary formats (see `isBinarySource`) need bytes; text formats accept text or UTF-8 bytes.
 */
export async function loadInventoryFile(
  source: SourceId,
  input: string | Uint8Array,
  loaders: Readonly<LoaderRegistry> = DEFAULT_LOADERS,
): Promise<LoadResult> {
  if (!hasServiceCapability(source, "file-export"))
    throw new Error(`${source} does not support file exports.`);

  const loaded = await loaders[source](input);
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

/** Creates an empty source inventory using the real adapter's normal parser and defaults. */
export async function createEmptyInventory(source: SourceId): Promise<LoadResult> {
  if (!hasServiceCapability(source, "file-import"))
    throw new Error(`${source} is read-only and cannot be an empty target inventory.`);
  return loadInventoryFile(source, EMPTY_TEMPLATES[source as WritableSourceId]);
}
