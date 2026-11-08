import { SAVED_GROUPS, store } from "./groups";
import {
  BACKUP_LIMITS,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  isValidEntry,
  portableKeys,
} from "./portable";

/**
 * One file with everything SpoolSync keeps that is safe to move: the same portable groups as the
 * settings export, validated entry by entry both when the file is written and when it is read. It
 * never holds connections, tokens or sign-ins, the loaded inventories of a tab, or the device-only
 * snapshots and sync history. A restore can merge into what is saved or replace it.
 */
export const BACKUP_FORMAT = "spoolsync-backup";
export const BACKUP_VERSION = 1;

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
