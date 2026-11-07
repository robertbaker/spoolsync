import type { CommonSpool } from "../../core/model";
import { loadFilamentDbAppCsv } from "./csv";
import { idOf, isLegacyRoll, mapFilamentSpools } from "./map";
import type { FilamentDbAppFile, FilamentDbAppFilament, FilamentDbAppLoadResult } from "./types";

type Bag = Record<string, unknown>;
const isBag = (value: unknown): value is Bag =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Soft-deleted filaments sit in Filament DB's trash; purged ones are only sync tombstones. */
const isLive = (filament: Bag): boolean => !filament["_deletedAt"] && filament["_purged"] !== true;

function locationNames(list: unknown): Record<string, string> {
  const names: Record<string, string> = {};
  if (!Array.isArray(list)) return names;
  for (const entry of list) {
    if (!isBag(entry) || entry["_deletedAt"]) continue;
    const id = idOf(entry["_id"]);
    const name = typeof entry["name"] === "string" ? entry["name"].trim() : "";
    if (id && name) names[id] = name;
  }
  return names;
}

/** Reads a snapshot (`collections.filaments`), `{ filaments, locations }`, or a bare filament list. */
export function parseFilamentDbApp(parsed: unknown): FilamentDbAppFile {
  let filaments: unknown;
  let locations: unknown;
  if (Array.isArray(parsed)) filaments = parsed;
  else if (isBag(parsed) && isBag(parsed["collections"])) {
    filaments = parsed["collections"]["filaments"];
    locations = parsed["collections"]["locations"];
  } else if (isBag(parsed)) {
    filaments = parsed["filaments"];
    locations = parsed["locations"];
  }
  if (!Array.isArray(filaments))
    throw new Error(
      "This does not look like a Filament DB export. Use Settings → Backup → Export snapshot, or save GET /api/filaments.",
    );
  return {
    filaments: filaments.filter((entry): entry is FilamentDbAppFilament => isBag(entry)),
    locations: locationNames(locations),
    document: parsed,
  };
}

export function loadFilamentDbAppFile(text: string): FilamentDbAppLoadResult {
  const clean = text.replace(/^\uFEFF/, "");
  if (!/^\s*[[{]/.test(clean)) return loadFilamentDbAppCsv(clean);
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(
      "This file is not valid JSON. Export a snapshot from Filament DB and try again.",
    );
  }
  return loadFilamentDbAppDocument(parsed);
}

/**
 * Loads an already-parsed snapshot (what the server returned), through the same validation and
 * mapping as {@link loadFilamentDbAppFile}, without serialising it to text and parsing it again.
 * Only objects and lists are JSON documents; anything else goes through the text path unchanged.
 */
export function loadFilamentDbAppRecords(parsed: unknown): FilamentDbAppLoadResult {
  if (parsed !== null && typeof parsed === "object") return loadFilamentDbAppDocument(parsed);
  return loadFilamentDbAppFile(JSON.stringify(parsed) ?? "");
}

function loadFilamentDbAppDocument(parsed: unknown): FilamentDbAppLoadResult {
  const file = parseFilamentDbApp(parsed);
  const live = file.filaments.filter(isLive);
  if (file.filaments.length && !live.some((f) => "vendor" in f || "type" in f))
    throw new Error(
      "This does not look like a Filament DB export: no filament has a vendor or type.",
    );
  const byId = new Map(live.map((filament) => [idOf(filament["_id"]), filament] as const));
  const templates = new Set(live.map((f) => idOf(f["parentId"])).filter((id) => id !== null));
  const spools: CommonSpool[] = [];
  let skipped = 0;
  let legacy = 0;
  for (const filament of live) {
    const parentId = idOf(filament["parentId"]);
    const isTemplate = templates.has(idOf(filament["_id"]) ?? "");
    const mapped = mapFilamentSpools(
      filament,
      parentId ? byId.get(parentId) : undefined,
      file.locations,
      isTemplate,
    );
    if (isLegacyRoll(filament, isTemplate)) legacy++;
    const declared = Array.isArray(filament["spools"]) ? filament["spools"].length : 0;
    skipped += declared - mapped.length;
    spools.push(...mapped);
  }
  const warnings: string[] = [];
  if (skipped > 0)
    warnings.push(
      `${skipped} spool${skipped === 1 ? " has" : "s have"} no id and ${skipped === 1 ? "was" : "were"} skipped.`,
    );
  if (legacy > 0)
    warnings.push(
      `${legacy} filament${legacy === 1 ? " keeps its" : "s keep their"} one roll on the filament itself, with no spool record. ${legacy === 1 ? "It was" : "They were"} loaded as one spool each (remaining = weight on the scale minus the empty spool); only the weight can be written back.`,
    );
  return {
    source: "filamentDbApp",
    origin: "file",
    file: { filaments: live, locations: file.locations, document: file.document },
    spools,
    warnings,
    loadedAt: new Date().toISOString(),
  };
}
