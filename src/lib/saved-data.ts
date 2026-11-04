import { isProviderId, sanitizeReferenceSettings } from "@spoolsync/core/core/reference";
import { isLowStockPercent } from "@spoolsync/core/core/stock";

import { browserCatalogBodies } from "./browser/storage/catalog-db";
import { sanitizeFileHistory } from "./browser/storage/file-history";
import { sanitizeHealthHistory } from "./browser/storage/health-history";
import { sanitizeWatchlist } from "./browser/storage/insights";
import { sanitizeStockHistory } from "./browser/storage/stock-history";
import { isLocale } from "./i18n";
import { sanitizeColumnMaps } from "./import-mapper/store";
import { LABEL_PRESETS, LABEL_SELECTIONS } from "./labels/labels";
import { sanitizePreferences } from "./preferences";
import { validateShopTemplate } from "./reorder-list";
import { sanitizeViews } from "./saved-views";
import { isDefaultColumns, sanitizeColumns } from "./table-columns";
import { sanitizeDisplaySettings } from "./units";
import { sanitizeTares } from "./weigh-in";

/**
 * What SpoolSync keeps in this browser, grouped in plain words, so the visitor can see it and take
 * any part of it back. Everything lives under the `spoolsync:` prefix; nothing is sent anywhere.
 */
export interface SavedGroup {
  id: string;
  label: string;
  description: string;
  /** Keys that belong to the group (exact names), or a prefix ending in `*`. */
  keys: readonly string[];
  storage: "local" | "session";
}

export const SAVED_GROUPS: readonly SavedGroup[] = [
  {
    id: "connections",
    label: "Connections",
    description:
      "Spoolman and other server addresses, tokens you chose to keep, and your TigerTag sign-in.",
    keys: [
      "spoolsync:spoolman-connection",
      "spoolsync:spoolman-token",
      "spoolsync:tigertag-session",
      "spoolsync:bambuddy-connection",
      "spoolsync:filamentdb-connection",
    ],
    storage: "local",
  },
  {
    id: "preferences",
    label: "Preferences",
    description:
      "Table sort, filters, the low-stock threshold, auto-fetch, open panels, chart views, label options, saved table views, which data-cleanup rules are on, the reference-data provider and field choices, and recently used services.",
    keys: [
      "spoolsync:prefs",
      "spoolsync:low-stock-percent",
      "spoolsync:open-panels",
      "spoolsync:recent-sources",
      "spoolsync:chart-view",
      "spoolsync:chart-table-open",
      "spoolsync:trend-table-open",
      "spoolsync:cost-view",
      "spoolsync:cost-table-open",
      "spoolsync:label-options",
      "spoolsync:saved-views",
      "spoolsync:last-seen-version",
      "spoolsync:changelog-cache",
      "spoolsync:display",
      "spoolsync:setup-dismissed",
      "spoolsync:palette-recent",
      "spoolsync:sidebar",
      "spoolsync:cleanup-settings",
      "spoolsync:reference-settings",
      "spoolsync:weigh-in",
      "spoolsync:shop-template",
      "spoolsync:changelog-read",
      "spoolsync:language",
      "spoolsync:table-columns",
      "spoolsync:column-maps",
    ],
    storage: "local",
  },
  {
    id: "reference-cache",
    label: "Reference data cache",
    description:
      "A catalog from a reference service (such as the Open Filament Database or FilamentColors) with its credit line, kept so it is not downloaded again; the records are in this browser's database and a short description is listed here. Kept on this device only and never exported.",
    keys: ["spoolsync:reference-cache"],
    storage: "local",
  },
  {
    id: "files",
    label: "File history",
    description:
      "The name, size, and date of the last file used for each service. Never the contents.",
    keys: ["spoolsync:file-history"],
    storage: "local",
  },
  {
    id: "snapshots",
    label: "Previous inventory summaries",
    description:
      "For each service, the id, remaining weight, and name of every spool in the last file you loaded, so the next load can show what changed, plus a short copy of that comparison for the Since your last visit panel. Kept on this device only and never exported.",
    keys: ["spoolsync:inventory-snapshots", "spoolsync:since-visit"],
    storage: "local",
  },
  {
    id: "watchlist",
    label: "Watchlist",
    description: "The spools you pinned to watch for weight drops (service and id only).",
    keys: ["spoolsync:watchlist"],
    storage: "local",
  },
  {
    id: "history",
    label: "Stock history",
    description:
      "The total remaining weight and spool count of each service at each load, and the data health score at each load, for the trend charts. Never names or contents.",
    keys: ["spoolsync:stock-history", "spoolsync:health-history"],
    storage: "local",
  },
  {
    id: "sync-history",
    label: "Sync history",
    description:
      "When each apply or download happened, with counts per service and any error text. Never spool details. Kept on this device only and never exported.",
    keys: ["spoolsync:sync-history"],
    storage: "local",
  },
  {
    id: "answers",
    label: "Match answers",
    description: "Which possible matches you confirmed or rejected.",
    keys: ["spoolsync:match-decisions"],
    storage: "local",
  },
  {
    id: "inventories",
    label: "Loaded inventories (this tab only)",
    description:
      "Spools you loaded and the choices made on the Sync page. They clear when the tab closes.",
    keys: [
      "spoolsync:load:*",
      "spoolsync:resolutions",
      "spoolsync:bulk-edits",
      "spoolsync:cleanup-accepted",
      "spoolsync:reference-accepted",
      "spoolsync:reference-choices",
      "spoolsync:spoolman-token",
    ],
    storage: "session",
  },
];

export interface SavedItem {
  group: SavedGroup;
  /** Keys that currently hold something. */
  keys: string[];
  bytes: number;
}

function store(kind: SavedGroup["storage"]): Storage | null {
  try {
    return kind === "local" ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

function keysIn(storage: Storage, group: SavedGroup): string[] {
  const names: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key) continue;
    if (
      group.keys.some((pattern) =>
        pattern.endsWith("*") ? key.startsWith(pattern.slice(0, -1)) : key === pattern,
      )
    )
      names.push(key);
  }
  return names;
}

/** What is saved right now, for every group that holds something. */
export function listSavedData(): SavedItem[] {
  return SAVED_GROUPS.flatMap((group) => {
    const storage = store(group.storage);
    if (!storage) return [];
    const keys = keysIn(storage, group);
    if (!keys.length) return [];
    const bytes = keys.reduce(
      (sum, key) => sum + key.length + (storage.getItem(key)?.length ?? 0),
      0,
    );
    return [{ group, keys, bytes }];
  });
}

/** Removes everything in one group. Returns how many entries were removed. */
export function forgetGroup(id: string): number {
  const group = SAVED_GROUPS.find((candidate) => candidate.id === id);
  const storage = group && store(group.storage);
  if (!group || !storage) return 0;
  const keys = keysIn(storage, group);
  for (const key of keys) storage.removeItem(key);
  if (id === "reference-cache") void forgetCatalogRecords();
  return keys.length;
}

/** The kept reference catalogs' records live in IndexedDB; a failure to empty it is not an error. */
async function forgetCatalogRecords(): Promise<void> {
  try {
    await browserCatalogBodies.remove();
  } catch {
    // Nothing to do: without its description a kept catalog is never used.
  }
}

/** Removes everything SpoolSync saved, in both kinds of storage, including keys no group names. */
export function forgetEverything(): number {
  let removed = 0;
  for (const kind of ["local", "session"] as const) {
    const storage = store(kind);
    if (!storage) continue;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith("spoolsync:")) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
    removed += keys.length;
  }
  void forgetCatalogRecords();
  return removed;
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

// ---- Moving settings between browsers -------------------------------------------------------

const EXPORT_FORMAT = "spoolsync-settings";
const EXPORT_VERSION = 1;
/** The groups that are safe and useful to carry over. Connections hold credentials and stay put. */
const PORTABLE_GROUPS = ["preferences", "files", "watchlist", "history", "answers"] as const;

const CHART_VIEWS = ["service", "material", "brand", "color", "location"];
const COST_VIEWS = ["service", "material", "vendor"];

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** Whether a stored value has the shape its key expects, so an imported file cannot plant junk. */
function isValidEntry(key: string, text: string): boolean {
  try {
    switch (key) {
      case "spoolsync:prefs": {
        const clean = sanitizePreferences(JSON.parse(text));
        return Object.keys(clean).length > 0;
      }
      case "spoolsync:file-history":
        return Object.keys(sanitizeFileHistory(JSON.parse(text))).length > 0;
      case "spoolsync:watchlist":
        return sanitizeWatchlist(JSON.parse(text)).length > 0;
      case "spoolsync:low-stock-percent":
        return isLowStockPercent(Number(text));
      case "spoolsync:display": {
        const clean = sanitizeDisplaySettings(JSON.parse(text));
        return clean.weightUnit !== "g" || clean.currency !== "";
      }
      case "spoolsync:setup-dismissed":
        return text === "1";
      case "spoolsync:sidebar":
        return text === "collapsed" || text === "expanded";
      case "spoolsync:weigh-in":
        return Object.keys(sanitizeTares(JSON.parse(text))).length > 0;
      case "spoolsync:shop-template":
        return validateShopTemplate(text).ok;
      case "spoolsync:open-panels":
      case "spoolsync:recent-sources":
      case "spoolsync:palette-recent":
        return isStringList(JSON.parse(text));
      case "spoolsync:chart-view":
        return CHART_VIEWS.includes(text);
      case "spoolsync:chart-table-open":
      case "spoolsync:trend-table-open":
      case "spoolsync:cost-table-open":
        return text === "0" || text === "1";
      case "spoolsync:cost-view":
        return COST_VIEWS.includes(text);
      case "spoolsync:stock-history":
        return Object.keys(sanitizeStockHistory(JSON.parse(text))).length > 0;
      case "spoolsync:health-history":
        return sanitizeHealthHistory(JSON.parse(text)).length > 0;
      case "spoolsync:language":
        return isLocale(text) && text !== "en";
      case "spoolsync:table-columns": {
        const value: unknown = JSON.parse(text);
        return Array.isArray(value) && !isDefaultColumns(sanitizeColumns(value));
      }
      case "spoolsync:column-maps":
        return Object.keys(sanitizeColumnMaps(JSON.parse(text))).length > 0;
      case "spoolsync:label-options": {
        const value = JSON.parse(text) as { preset?: unknown; selection?: unknown };
        return (
          LABEL_PRESETS.some((preset) => preset.id === value.preset) &&
          LABEL_SELECTIONS.some((selection) => selection.id === value.selection)
        );
      }
      case "spoolsync:saved-views":
        return sanitizeViews(JSON.parse(text)).length > 0;
      case "spoolsync:cleanup-settings":
        return isStringList((JSON.parse(text) as { enabled?: unknown }).enabled);
      case "spoolsync:reference-settings": {
        const value = JSON.parse(text) as { providerId?: unknown; policy?: unknown };
        return (
          isProviderId(value.providerId) &&
          sanitizeReferenceSettings(value).providerId === value.providerId
        );
      }
      case "spoolsync:match-decisions": {
        const value = JSON.parse(text) as { confirmed?: unknown; rejected?: unknown };
        return isStringList(value.confirmed) && isStringList(value.rejected);
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

const portableKeys = () =>
  SAVED_GROUPS.filter((group) => (PORTABLE_GROUPS as readonly string[]).includes(group.id)).flatMap(
    (group) => group.keys,
  );

/** The portable settings as a JSON document. Credentials and loaded inventories are never included. */
export function exportSettings(now: Date = new Date()): string {
  const entries: Record<string, string> = {};
  const storage = store("local");
  if (storage)
    for (const key of portableKeys()) {
      const value = storage.getItem(key);
      if (value !== null && isValidEntry(key, value)) entries[key] = value;
    }
  return `${JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now.toISOString(), entries }, null, 2)}\n`;
}

export interface ImportResult {
  imported: string[];
  skipped: string[];
}

/**
 * Applies an exported settings document. Only portable keys with valid values are written; anything
 * else is skipped and named, so a hand-edited or hostile file cannot change credentials or store
 * arbitrary data. Throws when the text is not a SpoolSync settings export at all.
 */
export function importSettings(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON. Choose a settings file exported from SpoolSync.");
  }
  const document = parsed as { format?: unknown; version?: unknown; entries?: unknown };
  if (!document || typeof document !== "object" || document.format !== EXPORT_FORMAT)
    throw new Error("This is not a SpoolSync settings export.");
  if (document.version !== EXPORT_VERSION)
    throw new Error(
      `This export is version ${String(document.version)}, which this page cannot read.`,
    );
  if (!document.entries || typeof document.entries !== "object" || Array.isArray(document.entries))
    throw new Error("This settings export has no entries.");
  const storage = store("local");
  if (!storage) throw new Error("Browser storage is unavailable, so settings cannot be imported.");
  const allowed = new Set(portableKeys());
  const result: ImportResult = { imported: [], skipped: [] };
  for (const [key, value] of Object.entries(document.entries as Record<string, unknown>)) {
    if (allowed.has(key) && typeof value === "string" && isValidEntry(key, value)) {
      storage.setItem(key, value);
      result.imported.push(key);
    } else result.skipped.push(key);
  }
  return result;
}

// ---- Backup and restore ---------------------------------------------------------------------

/**
 * One file with everything SpoolSync keeps that is safe to move: the same portable groups as the
 * settings export, validated entry by entry both when the file is written and when it is read. It
 * never holds connections, tokens or sign-ins, the loaded inventories of a tab, or the device-only
 * snapshots and sync history. A restore can merge into what is saved or replace it.
 */
export const BACKUP_FORMAT = "spoolsync-backup";
export const BACKUP_VERSION = 1;
/** Bounds that keep a hostile or damaged file from filling browser storage. */
export const BACKUP_LIMITS = { entries: 60, entryBytes: 1_000_000, totalBytes: 4_000_000 } as const;

export interface BackupEntryReport {
  key: string;
  /** The saved-data group's plain-language name, or `null` for a key no portable group names. */
  group: string | null;
}

export interface BackupSkip extends BackupEntryReport {
  reason: string;
}

export interface BackupInspection {
  /** `spoolsync-backup`, or `spoolsync-settings` for a file made by the older settings export. */
  format: string;
  exportedAt: string | null;
  accepted: BackupEntryReport[];
  skipped: BackupSkip[];
}

const groupLabelOf = (key: string): string | null =>
  SAVED_GROUPS.find((group) => group.keys.includes(key))?.label ?? null;

/** A backup of every portable setting that currently holds a valid value. */
export function createBackup(now: Date = new Date()): string {
  const entries: Record<string, string> = {};
  const storage = store("local");
  if (storage)
    for (const key of portableKeys()) {
      const value = storage.getItem(key);
      if (value !== null && isValidEntry(key, value)) entries[key] = value;
    }
  return `${JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), entries }, null, 2)}\n`;
}

interface ParsedBackup {
  format: string;
  exportedAt: string | null;
  entries: Record<string, unknown>;
}

/** Checks the outer shape of a backup file. Throws a message fit for the visitor on any problem. */
function parseBackup(text: string): ParsedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON. Choose a backup file made by SpoolSync.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("This is not a SpoolSync backup.");
  const document = parsed as Record<string, unknown>;
  if (document["format"] !== BACKUP_FORMAT && document["format"] !== EXPORT_FORMAT)
    throw new Error("This is not a SpoolSync backup.");
  const expected = document["format"] === BACKUP_FORMAT ? BACKUP_VERSION : EXPORT_VERSION;
  if (document["version"] !== expected)
    throw new Error(
      `This backup is version ${String(document["version"])}, which this page cannot read.`,
    );
  const entries = document["entries"];
  if (!entries || typeof entries !== "object" || Array.isArray(entries))
    throw new Error("This backup has no entries.");
  const keys = Object.keys(entries);
  if (keys.length > BACKUP_LIMITS.entries)
    throw new Error(`This backup lists ${keys.length} entries, more than SpoolSync ever writes.`);
  const exportedAt = document["exportedAt"];
  return {
    format: document["format"] as string,
    exportedAt:
      typeof exportedAt === "string" && !Number.isNaN(Date.parse(exportedAt)) ? exportedAt : null,
    entries: entries as Record<string, unknown>,
  };
}

function classify(parsed: ParsedBackup): {
  accepted: Map<string, string>;
  inspection: BackupInspection;
} {
  const allowed = new Set(portableKeys());
  const accepted = new Map<string, string>();
  const inspection: BackupInspection = {
    format: parsed.format,
    exportedAt: parsed.exportedAt,
    accepted: [],
    skipped: [],
  };
  let total = 0;
  for (const [key, value] of Object.entries(parsed.entries)) {
    const group = groupLabelOf(key);
    const skip = (reason: string) => inspection.skipped.push({ key, group, reason });
    if (!allowed.has(key)) {
      skip(
        SAVED_GROUPS.find((candidate) => candidate.id === "connections")?.keys.includes(key)
          ? "Connections and tokens are never restored."
          : "Not a setting SpoolSync can restore.",
      );
    } else if (typeof value !== "string") skip("The value is not text.");
    else if (value.length > BACKUP_LIMITS.entryBytes) skip("The value is too large.");
    else if (total + value.length > BACKUP_LIMITS.totalBytes) skip("The backup is too large.");
    else if (!isValidEntry(key, value)) skip("The value is not in the form this setting expects.");
    else {
      total += value.length;
      accepted.set(key, value);
      inspection.accepted.push({ key, group });
    }
  }
  return { accepted, inspection };
}

/** What a backup file would restore, without changing anything. Throws for an unusable file. */
export function inspectBackup(text: string): BackupInspection {
  return classify(parseBackup(text)).inspection;
}

export interface RestoreResult extends BackupInspection {
  /** Portable keys removed first because the restore replaced everything. */
  removed: string[];
}

/**
 * Writes a backup's valid entries to browser storage. `merge` keeps settings the backup does not
 * mention; `replace` first removes every portable setting, so the result is exactly the backup.
 * Nothing is removed unless the file passed the shape checks and storage is available.
 */
export function restoreBackup(text: string, mode: "merge" | "replace" = "merge"): RestoreResult {
  const { accepted, inspection } = classify(parseBackup(text));
  const storage = store("local");
  if (!storage)
    throw new Error("Browser storage is unavailable, so the backup cannot be restored.");
  const removed: string[] = [];
  try {
    if (mode === "replace")
      for (const key of portableKeys())
        if (!accepted.has(key) && storage.getItem(key) !== null) {
          storage.removeItem(key);
          removed.push(key);
        }
    for (const [key, value] of accepted) storage.setItem(key, value);
  } catch {
    throw new Error("Browser storage refused the backup. It may be full or blocked.");
  }
  return { ...inspection, removed };
}

/** `spoolsync-backup-2026-11-03.json` */
export const backupFilename = (now: Date): string =>
  `spoolsync-backup-${now.toISOString().slice(0, 10)}.json`;
