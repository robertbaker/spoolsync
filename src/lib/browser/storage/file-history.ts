import { SOURCE_IDS, type SourceId } from "@spoolsync/core/core/model";

import { local, read, write } from "./access";

const KEY = "spoolsync:file-history";

/** What is remembered about the last file loaded into a service. Never the file's contents. */
export interface FileHistoryEntry {
  name: string;
  size: number;
  spools: number;
  /** ISO timestamp of the load. */
  loadedAt: string;
}

export type FileHistory = Partial<Record<SourceId, FileHistoryEntry>>;

export function sanitizeFileHistory(raw: unknown): FileHistory {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: FileHistory = {};
  for (const source of SOURCE_IDS) {
    const entry = (raw as Record<string, unknown>)[source] as Partial<FileHistoryEntry> | undefined;
    if (
      entry &&
      typeof entry.name === "string" &&
      entry.name &&
      typeof entry.size === "number" &&
      Number.isFinite(entry.size) &&
      typeof entry.spools === "number" &&
      Number.isFinite(entry.spools) &&
      typeof entry.loadedAt === "string" &&
      !Number.isNaN(Date.parse(entry.loadedAt))
    )
      result[source] = {
        // File names can be long or odd; keep what is shown bounded.
        name: entry.name.slice(0, 200),
        size: entry.size,
        spools: entry.spools,
        loadedAt: entry.loadedAt,
      };
  }
  return result;
}

export function readFileHistory(): FileHistory {
  try {
    return sanitizeFileHistory(JSON.parse(read(local, KEY) ?? "{}"));
  } catch {
    return {};
  }
}

export function recordFile(source: SourceId, entry: FileHistoryEntry): void {
  write(local, KEY, JSON.stringify({ ...readFileHistory(), [source]: entry }));
}

export function forgetFile(source: SourceId): void {
  const { [source]: _removed, ...rest } = readFileHistory();
  write(local, KEY, Object.keys(rest).length ? JSON.stringify(rest) : null);
}

export function clearFileHistory(): void {
  write(local, KEY, null);
}
