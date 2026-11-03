import {
  DEFAULT_CLEANUP_SETTINGS,
  sanitizeAcceptedCleanups,
  sanitizeCleanupSettings,
  type AcceptedCleanup,
  type CleanupSettings,
} from "@spoolsync/core/core/cleanup";

import { local, read, session, write } from "./access";

const SETTINGS_KEY = "spoolsync:cleanup-settings";
const ACCEPTED_KEY = "spoolsync:cleanup-accepted";

/** Which cleanup rules are on, kept across visits (a preference, not inventory data). */
export function loadCleanupSettings(): CleanupSettings {
  try {
    const raw = read(local, SETTINGS_KEY);
    return raw ? sanitizeCleanupSettings(JSON.parse(raw)) : sanitizeCleanupSettings(null);
  } catch {
    return sanitizeCleanupSettings(null);
  }
}

export function saveCleanupSettings(settings: CleanupSettings): void {
  const clean = sanitizeCleanupSettings(settings);
  const isDefault =
    clean.enabled.length === DEFAULT_CLEANUP_SETTINGS.enabled.length &&
    clean.enabled.every((id, index) => id === DEFAULT_CLEANUP_SETTINGS.enabled[index]);
  write(local, SETTINGS_KEY, isDefault ? null : JSON.stringify(clean));
}

/**
 * Cleanups accepted on the Load page, for this tab only (like the Sync page's choices). Each keeps
 * the value it was proposed for, so one that no longer matches the loaded data is ignored.
 */
export function loadAcceptedCleanups(): AcceptedCleanup[] {
  try {
    return sanitizeAcceptedCleanups(JSON.parse(read(session, ACCEPTED_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function saveAcceptedCleanups(accepted: readonly AcceptedCleanup[]): void {
  write(session, ACCEPTED_KEY, accepted.length ? JSON.stringify(accepted) : null);
}

export function clearAcceptedCleanups(): void {
  write(session, ACCEPTED_KEY, null);
}
