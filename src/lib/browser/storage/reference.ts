import {
  DEFAULT_REFERENCE_SETTINGS,
  MAX_CACHED_FILAMENTS,
  sanitizeAcceptedReferences,
  sanitizeReferenceCache,
  sanitizeReferenceChoices,
  sanitizeReferenceSettings,
  type AcceptedReference,
  type ReferenceCacheEntry,
  type ReferenceSettings,
} from "@spoolsync/core/core/reference";

import { local, read, session, write } from "./access";

const SETTINGS_KEY = "spoolsync:reference-settings";
const CACHE_KEY = "spoolsync:reference-cache";
const ACCEPTED_KEY = "spoolsync:reference-accepted";
const CHOICES_KEY = "spoolsync:reference-choices";

/** Most characters of cached catalog written to storage; browsers allow about 5 MB per site. */
export const MAX_CACHE_CHARS = 2_500_000;

/** Which provider and fields are in use, and what was entered for each service. A preference. */
export function loadReferenceSettings(): ReferenceSettings {
  try {
    const raw = read(local, SETTINGS_KEY);
    return raw ? sanitizeReferenceSettings(JSON.parse(raw)) : { ...DEFAULT_REFERENCE_SETTINGS };
  } catch {
    return { ...DEFAULT_REFERENCE_SETTINGS };
  }
}

export function saveReferenceSettings(settings: ReferenceSettings): void {
  const clean = sanitizeReferenceSettings(settings);
  const isDefault = JSON.stringify(clean) === JSON.stringify(sanitizeReferenceSettings(null));
  write(local, SETTINGS_KEY, isDefault ? null : JSON.stringify(clean));
}

/** Catalogs fetched earlier, one per provider, each still to be checked against its TTL. */
export function loadReferenceCache(): Record<string, ReferenceCacheEntry> {
  try {
    return sanitizeReferenceCache(JSON.parse(read(local, CACHE_KEY) ?? "null"));
  } catch {
    return {};
  }
}

/**
 * Keeps a fetched catalog for next time. A catalog too large to store is simply not cached (the
 * page still works from memory), and the result says whether it was stored.
 */
export function saveReferenceCacheEntry(entry: ReferenceCacheEntry): boolean {
  if (entry.filaments.length > MAX_CACHED_FILAMENTS) return false;
  const all = { ...loadReferenceCache(), [entry.providerId]: entry };
  const text = JSON.stringify(all);
  if (text.length > MAX_CACHE_CHARS) return false;
  return write(local, CACHE_KEY, text);
}

export function clearReferenceCache(providerId?: string): void {
  if (!providerId) {
    write(local, CACHE_KEY, null);
    return;
  }
  const rest = loadReferenceCache();
  delete rest[providerId];
  write(local, CACHE_KEY, Object.keys(rest).length ? JSON.stringify(rest) : null);
}

/**
 * Reference changes accepted on the Load page, for this tab only (like the Sync page's choices).
 * Each keeps the value it was proposed for, so one that no longer matches the loaded data is
 * ignored.
 */
export function loadAcceptedReferences(): AcceptedReference[] {
  try {
    return sanitizeAcceptedReferences(JSON.parse(read(session, ACCEPTED_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function saveAcceptedReferences(accepted: readonly AcceptedReference[]): void {
  write(session, ACCEPTED_KEY, accepted.length ? JSON.stringify(accepted) : null);
}

/** The reference a person picked for spools whose match was ambiguous, or `none`. */
export function loadReferenceChoices(): Map<string, string> {
  try {
    return sanitizeReferenceChoices(JSON.parse(read(session, CHOICES_KEY) ?? "null"));
  } catch {
    return new Map();
  }
}

export function saveReferenceChoices(choices: ReadonlyMap<string, string>): void {
  write(session, CHOICES_KEY, choices.size ? JSON.stringify(Object.fromEntries(choices)) : null);
}
