import { SOURCE_IDS, type SourceId } from "@spoolsync/core/core/model";
import type { SpoolFingerprint } from "@spoolsync/core/workflow";

import { local, read, write } from "./access";

export const SNAPSHOTS_KEY = "spoolsync:inventory-snapshots";
export const WATCHLIST_KEY = "spoolsync:watchlist";

/** Caps keep a damaged, hand-edited, or imported entry from filling browser storage. */
export const MAX_SNAPSHOT_SPOOLS = 2000;
export const MAX_SNAPSHOT_BYTES = 400_000;
export const MAX_WATCHED = 200;
const MAX_ID_LENGTH = 200;
const MAX_NAME_LENGTH = 80;

/**
 * What is remembered about the last file loaded for a service: per spool, its id, remaining grams,
 * and name. Not the full record; notes, prices, and cross-service ids are never kept here.
 */
export interface InventorySnapshot {
  /** ISO timestamp of the load. */
  savedAt: string;
  spools: SpoolFingerprint[];
}

export type InventorySnapshots = Partial<Record<SourceId, InventorySnapshot>>;

function sanitizeFingerprint(raw: unknown): SpoolFingerprint | null {
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const [id, remaining, name] = raw as unknown[];
  if (typeof id !== "string" || !id || id.length > MAX_ID_LENGTH) return null;
  if (remaining !== null && !(typeof remaining === "number" && Number.isFinite(remaining)))
    return null;
  if (name !== null && typeof name !== "string") return null;
  return [id, remaining, name === null ? null : name.slice(0, MAX_NAME_LENGTH)];
}

export function sanitizeSnapshots(raw: unknown): InventorySnapshots {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: InventorySnapshots = {};
  for (const source of SOURCE_IDS) {
    const entry = (raw as Record<string, unknown>)[source] as
      | { savedAt?: unknown; spools?: unknown }
      | undefined;
    if (
      !entry ||
      typeof entry.savedAt !== "string" ||
      Number.isNaN(Date.parse(entry.savedAt)) ||
      !Array.isArray(entry.spools) ||
      entry.spools.length > MAX_SNAPSHOT_SPOOLS
    )
      continue;
    const spools: SpoolFingerprint[] = [];
    const seen = new Set<string>();
    for (const item of entry.spools) {
      const print = sanitizeFingerprint(item);
      if (print && !seen.has(print[0])) {
        seen.add(print[0]);
        spools.push(print);
      }
    }
    result[source] = { savedAt: entry.savedAt, spools };
  }
  return result;
}

export function readSnapshots(): InventorySnapshots {
  try {
    return sanitizeSnapshots(JSON.parse(read(local, SNAPSHOTS_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

export function readSnapshot(source: SourceId): InventorySnapshot | null {
  return readSnapshots()[source] ?? null;
}

/**
 * Remembers one service's spools for the next comparison. Returns false, and keeps the older
 * snapshot, when the inventory is over the size caps or storage is unavailable; a partial snapshot
 * would report spools as added later.
 */
export function saveSnapshot(source: SourceId, snapshot: InventorySnapshot): boolean {
  if (snapshot.spools.length > MAX_SNAPSHOT_SPOOLS) return false;
  const next = sanitizeSnapshots({ ...readSnapshots(), [source]: snapshot });
  const entry = next[source];
  if (!entry || entry.spools.length !== snapshot.spools.length) return false;
  const text = JSON.stringify(next);
  if (text.length > MAX_SNAPSHOT_BYTES) return false;
  return write(local, SNAPSHOTS_KEY, text);
}

export function forgetSnapshot(source: SourceId): void {
  const { [source]: _removed, ...rest } = readSnapshots();
  write(local, SNAPSHOTS_KEY, Object.keys(rest).length ? JSON.stringify(rest) : null);
}

export function clearSnapshots(): void {
  write(local, SNAPSHOTS_KEY, null);
}

// ---- Watchlist ------------------------------------------------------------------------------

/** Spools the visitor pinned, as `source:id` keys in the order they were pinned. */
export function sanitizeWatchlist(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const keys: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || item.length > MAX_ID_LENGTH + 20) continue;
    const separator = item.indexOf(":");
    if (separator < 1) continue;
    if (!(SOURCE_IDS as readonly string[]).includes(item.slice(0, separator))) continue;
    if (separator === item.length - 1 || keys.includes(item)) continue;
    keys.push(item);
    if (keys.length >= MAX_WATCHED) break;
  }
  return keys;
}

export function readWatchlist(): string[] {
  try {
    return sanitizeWatchlist(JSON.parse(read(local, WATCHLIST_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function saveWatchlist(keys: readonly string[]): boolean {
  const clean = sanitizeWatchlist(keys);
  return write(local, WATCHLIST_KEY, clean.length ? JSON.stringify(clean) : null);
}

/** Pins or unpins a spool. Returns the new list, or the unchanged list when the cap is reached. */
export function toggleWatched(key: string): string[] {
  const current = readWatchlist();
  const next = current.includes(key)
    ? current.filter((candidate) => candidate !== key)
    : [...current, key];
  const clean = sanitizeWatchlist(next);
  if (!current.includes(key) && !clean.includes(key)) return current;
  saveWatchlist(clean);
  return clean;
}

export function clearWatchlist(): void {
  write(local, WATCHLIST_KEY, null);
}
