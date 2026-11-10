import { normalizeBambuddyUrl } from "@spoolsync/core/adapters/bambuddy/client";
import { normalizeFilamentDbUrl } from "@spoolsync/core/adapters/filamentdb/client";
import { normalizeFilamentDbAppUrl } from "@spoolsync/core/adapters/filamentDbApp/client";

import {
  loadBambuddyConnection,
  loadFilamentDbAppConnection,
  loadFilamentDbConnection,
  loadSpoolmanConnection,
  loadTigertagSession,
  saveRefreshedTigertagSession,
} from "~/lib/browser/storage";

import type { ApplyService } from "./apply-controller";

const serverChanged = "Connection changed. Fetch this server's inventory again before applying.";

/** The write code for every service loads when something is applied, not with the Sync page. */
const writes = () => import("@spoolsync/core/apply");

/** Composition root for browser credentials and remote adapter implementations. */
export function createApplyServices() {
  return {
    spoolman: {
      changedMessage: serverChanged,
      connect() {
        const connection = loadSpoolmanConnection();
        return (
          connection && {
            identity: connection.baseUrl,
            description: `Spoolman at ${connection.baseUrl}`,
            apply: async (changes, progress) =>
              (await writes()).applyAndReloadSpoolman(connection, changes, progress),
          }
        );
      },
    },
    filamentdb: {
      changedMessage: serverChanged,
      connect() {
        const connection = loadFilamentDbConnection();
        return (
          connection && {
            identity: normalizeFilamentDbUrl(connection.baseUrl),
            description: `FilamentDB at ${connection.baseUrl}`,
            apply: async (changes, progress) =>
              (await writes()).applyAndReloadFilamentDb(connection, changes, progress),
          }
        );
      },
    },
    filamentDbApp: {
      changedMessage: serverChanged,
      connect() {
        const connection = loadFilamentDbAppConnection();
        return (
          connection && {
            identity: normalizeFilamentDbAppUrl(connection.baseUrl),
            description: `Filament DB at ${connection.baseUrl}`,
            apply: async (changes, progress) =>
              (await writes()).applyAndReloadFilamentDbApp(connection, changes, progress),
          }
        );
      },
    },
    bambuddy: {
      changedMessage: serverChanged,
      connect() {
        const connection = loadBambuddyConnection();
        return (
          connection && {
            identity: normalizeBambuddyUrl(connection.baseUrl),
            description: `Bambuddy at ${connection.baseUrl}`,
            apply: async (changes, progress) =>
              (await writes()).applyAndReloadBambuddy(connection, changes, progress),
          }
        );
      },
    },
    tigertag: {
      changedMessage: "Account changed. Fetch this account's inventory again before applying.",
      connect() {
        const session = loadTigertagSession();
        return (
          session && {
            identity: session.uid,
            description: `the TigerTag inventory of ${session.email}`,
            apply: async (changes, progress) =>
              (await writes()).applyAndReloadTigertag(
                session,
                changes,
                (fresh) => saveRefreshedTigertagSession(fresh, session.remember),
                progress,
              ),
          }
        );
      },
    },
  } satisfies Record<string, ApplyService>;
}
