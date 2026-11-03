import { SOURCE_IDS, SOURCE_LABELS, type SourceId } from "@spoolsync/core/core/model";

import { local, read, write } from "./access";

const KEY = "spoolsync:sync-history";
/** Entries kept; the oldest are dropped first, so the stored size stays bounded. */
export const MAX_SYNC_HISTORY = 100;
const MAX_ERROR_LENGTH = 200;
const MAX_COUNT = 1_000_000;

/**
 * One finished apply or download. Counts and a short error only: never spool names, notes, ids, or
 * credentials, because the log is kept across visits.
 */
export interface SyncHistoryEntry {
  /** ISO timestamp of completion. */
  at: string;
  source: SourceId;
  /** `api` wrote to the live service; `download` produced a file to import by hand. */
  via: "api" | "download";
  /** Planned updates and creations the run was asked to do. */
  updates: number;
  creations: number;
  /** Changes that went through, and ones that did not (or the whole run, when it failed early). */
  succeeded: number;
  failed: number;
  error?: string;
}

/** An entry before it is stamped with a time. */
export type SyncHistoryRecord = Omit<SyncHistoryEntry, "at">;

const asCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_COUNT
    ? Math.round(value)
    : null;

/** Error text is shortened and stripped of line breaks and control characters. */
export function cleanErrorText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, MAX_ERROR_LENGTH);
}

/** One well-formed entry, or `null` for anything damaged or hand-edited into nonsense. */
export function sanitizeSyncHistoryEntry(raw: unknown): SyncHistoryEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const at = typeof item["at"] === "string" ? Date.parse(item["at"]) : Number.NaN;
  const source = SOURCE_IDS.find((id) => id === item["source"]);
  const via = item["via"] === "api" || item["via"] === "download" ? item["via"] : null;
  const updates = asCount(item["updates"]);
  const creations = asCount(item["creations"]);
  const succeeded = asCount(item["succeeded"]);
  const failed = asCount(item["failed"]);
  if (
    Number.isNaN(at) ||
    !source ||
    !via ||
    updates === null ||
    creations === null ||
    succeeded === null ||
    failed === null
  )
    return null;
  const error = typeof item["error"] === "string" ? cleanErrorText(item["error"]) : "";
  return {
    at: new Date(at).toISOString(),
    source,
    via,
    updates,
    creations,
    succeeded,
    failed,
    ...(error ? { error } : {}),
  };
}

/** Well-formed entries in time order, newest last, capped at {@link MAX_SYNC_HISTORY}. */
export function sanitizeSyncHistory(raw: unknown): SyncHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries = raw.flatMap((item) => {
    const entry = sanitizeSyncHistoryEntry(item);
    return entry ? [entry] : [];
  });
  // Stable sort keeps same-instant entries in the order they were recorded.
  entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return entries.slice(-MAX_SYNC_HISTORY);
}

/** The history with an entry added, or the same array when the entry is unusable. */
export function appendSyncHistory(
  history: readonly SyncHistoryEntry[],
  record: SyncHistoryRecord,
  now: Date = new Date(),
): SyncHistoryEntry[] {
  const entry = sanitizeSyncHistoryEntry({ ...record, at: now.toISOString() });
  return entry ? sanitizeSyncHistory([...history, entry]) : [...history];
}

export function readSyncHistory(): SyncHistoryEntry[] {
  try {
    return sanitizeSyncHistory(JSON.parse(read(local, KEY) ?? "[]"));
  } catch {
    return [];
  }
}

/** Stores a new entry and returns the updated history (unchanged if storage is unavailable). */
export function recordSyncHistory(record: SyncHistoryRecord, now?: Date): SyncHistoryEntry[] {
  const next = appendSyncHistory(readSyncHistory(), record, now);
  write(local, KEY, JSON.stringify(next));
  return next;
}

export function clearSyncHistory(): void {
  write(local, KEY, null);
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** `2026-11-03 14:05 UTC`, the same wherever the summary is pasted. */
export function formatHistoryTime(at: string): string {
  return `${at.slice(0, 10)} ${at.slice(11, 16)} UTC`;
}

/** One line for an entry, shared by the list and the copied summary. */
export function describeHistoryEntry(entry: SyncHistoryEntry): string {
  const what = [
    plural(entry.updates, "update"),
    `${entry.creations} new`,
  ].join(", ");
  const how = entry.via === "api" ? "applied through the API" : "downloaded as a file";
  const result =
    entry.via === "api"
      ? `${entry.succeeded} succeeded, ${entry.failed} failed`
      : entry.failed
        ? "export failed"
        : "file ready to import";
  return `${SOURCE_LABELS[entry.source]} ${how}: ${what}; ${result}${entry.error ? ` (${entry.error})` : ""}`;
}

/** Plain text for the clipboard: a heading, totals, then newest first. */
export function formatHistorySummary(history: readonly SyncHistoryEntry[]): string {
  if (!history.length) return "SpoolSync history: no applies or downloads recorded.";
  const api = history.filter((entry) => entry.via === "api");
  const downloads = history.length - api.length;
  const failed = history.reduce((sum, entry) => sum + entry.failed, 0);
  return [
    `SpoolSync history: ${plural(history.length, "entry", "entries")} (${plural(api.length, "API write")}, ${plural(downloads, "download")}, ${plural(failed, "failure")})`,
    ...[...history]
      .reverse()
      .map((entry) => `- ${formatHistoryTime(entry.at)} ${describeHistoryEntry(entry)}`),
  ].join("\n");
}

// ---- Filtering and export ---------------------------------------------------------------------

export interface SyncHistoryFilter {
  /** A service, or `all` (the default). */
  source?: SourceId | "all";
  via?: SyncHistoryEntry["via"] | "all";
  /** `failed` keeps entries with a failure or error; `succeeded` keeps the rest. */
  outcome?: "all" | "failed" | "succeeded";
  /** Words that must all appear in the entry's line, so a service name or error text finds it. */
  query?: string;
}

export const hasFailed = (entry: SyncHistoryEntry): boolean => entry.failed > 0 || Boolean(entry.error);

/** The entries that pass every part of the filter, in their original order. */
export function filterSyncHistory(
  history: readonly SyncHistoryEntry[],
  filter: SyncHistoryFilter,
): SyncHistoryEntry[] {
  const words = (filter.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return history.filter((entry) => {
    if (filter.source && filter.source !== "all" && entry.source !== filter.source) return false;
    if (filter.via && filter.via !== "all" && entry.via !== filter.via) return false;
    if (filter.outcome === "failed" && !hasFailed(entry)) return false;
    if (filter.outcome === "succeeded" && hasFailed(entry)) return false;
    if (!words.length) return true;
    const line = `${formatHistoryTime(entry.at)} ${describeHistoryEntry(entry)}`.toLowerCase();
    return words.every((word) => line.includes(word));
  });
}

export const SYNC_HISTORY_EXPORT_FORMAT = "spoolsync-sync-history";

/** The entries as a JSON document: counts and short errors only, as stored. Newest last. */
export function syncHistoryJson(history: readonly SyncHistoryEntry[], now: Date = new Date()): string {
  return `${JSON.stringify({ format: SYNC_HISTORY_EXPORT_FORMAT, version: 1, exportedAt: now.toISOString(), entries: history }, null, 2)}\n`;
}

/** `spoolsync-sync-history-2026-11-03.json` */
export const syncHistoryFilename = (now: Date): string =>
  `spoolsync-sync-history-${now.toISOString().slice(0, 10)}.json`;
