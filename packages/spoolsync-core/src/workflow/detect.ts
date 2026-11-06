import {
  SOURCE_IDS,
  hasServiceCapability,
  isBinarySource,
  readsTextFile,
  type SourceId,
} from "../core/model";
import { loadInventoryFile } from "./load";

export interface DetectedInventory {
  source: SourceId;
  spoolCount: number;
}

/** Sources whose export files use the given extension. */
function candidatesFor(filename: string, input: string | Uint8Array): SourceId[] {
  const extension = /\.([a-z0-9]+)$/i.exec(filename.trim())?.[1]?.toLowerCase();
  const fileSources = SOURCE_IDS.filter((source) => hasServiceCapability(source, "file-export"));
  if (extension === "xlsx") return fileSources.filter((source) => !readsTextFile(source));
  if (extension === "zip") return fileSources.filter(isBinarySource);
  if (typeof input !== "string" && input.byteLength >= 2 && input[0] === 0x50 && input[1] === 0x4b)
    return fileSources.filter(isBinarySource);
  const text = fileSources.filter(readsTextFile);
  if (extension === "csv")
    return text.filter(
      (source) => !["tigertag", "filamentdb", "spoolio", "spoolapp", "spoolkeep"].includes(source),
    );
  if (extension === "json" || extension === "ttag")
    return text.filter((source) => !["spoolstock", "spoolhoarder"].includes(source));
  return text;
}

function hasKey(records: unknown, keys: readonly string[]): boolean {
  return (
    Array.isArray(records) &&
    records.some(
      (record) =>
        !!record &&
        typeof record === "object" &&
        keys.some((key) => Object.hasOwn(record as Record<string, unknown>, key)),
    )
  );
}

const stripBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/** Header names that identify Spool Hoarder's two CSV layouts among otherwise generic columns. */
function csvSignatureSource(text: string): SourceId | null {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const header = stripBom(firstLine)
    .split(/[,;\t]/)
    .map((name) =>
      name
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_"),
    );
  const has = (...names: string[]) => names.every((name) => header.includes(name));
  if (has("filament", "totalweight", "spoolid")) return "filamentDbApp";
  if (has("spoolid", "brand") || has("colorhexcodes") || has("secondary_type", "td", "uuid"))
    return "spoolhoarder";
  return null;
}

/**
 * Field names that only one service writes. Generic fields such as `brand` appear in several
 * services' JSON, so these signatures decide before the trial parse.
 */
function signatureSource(input: string | Uint8Array): SourceId | null {
  if (typeof input !== "string" && input.byteLength > 0 && input[0] === 0x50) return null;
  const raw = typeof input === "string" ? input : new TextDecoder().decode(input);
  const text = stripBom(raw);
  if (!/^\s*[[{]/.test(text)) return csvSignatureSource(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) {
    if (hasKey(parsed, ["newQuantity", "usedQuantity", "exactType"])) return "spoolkeep";
    const embedsSpools = parsed.some(
      (record) =>
        !!record &&
        typeof record === "object" &&
        Array.isArray((record as Record<string, unknown>)["spools"]) &&
        "vendor" in record &&
        "type" in record,
    );
    return embedsSpools ? "filamentDbApp" : null;
  }
  const container = parsed as Record<string, unknown> | null;
  const collections = container?.["collections"] as Record<string, unknown> | undefined;
  if (collections && typeof collections === "object" && Array.isArray(collections["filaments"]))
    return "filamentDbApp";
  if (
    container &&
    typeof container === "object" &&
    typeof container["version"] === "number" &&
    Array.isArray(container["filaments"])
  )
    return "spoolio";
  if (container && typeof container === "object" && Array.isArray(container["spools"]))
    return Object.hasOwn(container, "backupFormat") ||
      hasKey(container["spools"], ["materialType", "colourHex", "colourName"])
      ? "spoolapp"
      : null;
  return null;
}

/**
 * Finds which services an export file could belong to by trying each plausible parser. Only parsers
 * that read the file without error and return at least one spool count as a match, so an empty file
 * is never guessed. Several matches mean the format is ambiguous and the caller should ask the user
 * to choose.
 */
export async function detectInventorySources(
  filename: string,
  input: string | Uint8Array,
): Promise<DetectedInventory[]> {
  const matches: DetectedInventory[] = [];
  const signature = signatureSource(input);
  const candidates = signature ? [signature] : candidatesFor(filename, input);
  for (const source of candidates) {
    try {
      const loaded = await loadInventoryFile(source, input);
      if (loaded.spools.length > 0) matches.push({ source, spoolCount: loaded.spools.length });
    } catch {
      // This parser does not recognise the file.
    }
  }
  return matches;
}
