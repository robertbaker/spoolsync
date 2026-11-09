import type { TigertagSession } from "@spoolsync/core/adapters/tigertag/cloud";

import { read, write, local, session } from "./access";
import { invalidateApiInventory } from "./invalidate";

const TIGERTAG_SESSION_KEY = "spoolsync:tigertag-session";

/**
 * The TigerTag cloud session (tokens, never the password). Kept in localStorage when the user chose
 * to stay signed in, otherwise for this tab only.
 */
export function loadTigertagSession(): (TigertagSession & { remember: boolean }) | null {
  for (const [storage, remember] of [
    [local, true],
    [session, false],
  ] as const) {
    const raw = read(storage, TIGERTAG_SESSION_KEY);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as TigertagSession;
      if (parsed.uid && parsed.refreshToken) return { ...parsed, remember };
    } catch {
      // fall through
    }
  }
  return null;
}

export function saveTigertagSession(value: TigertagSession, remember: boolean): void {
  if (loadTigertagSession()?.uid !== value.uid) {
    invalidateApiInventory("tigertag");
  }
  write(remember ? local : session, TIGERTAG_SESSION_KEY, JSON.stringify(value));
  write(remember ? session : local, TIGERTAG_SESSION_KEY, null);
}

/**
 * Saves tokens a refresh returned, unless the person signed out or changed account while it ran. A
 * late refresh must not bring back a session that has ended or replace the current account's.
 */
export function saveRefreshedTigertagSession(value: TigertagSession, remember: boolean): void {
  if (loadTigertagSession()?.uid === value.uid) saveTigertagSession(value, remember);
}

export function clearTigertagSession(): void {
  invalidateApiInventory("tigertag");
  write(local, TIGERTAG_SESSION_KEY, null);
  write(session, TIGERTAG_SESSION_KEY, null);
}
