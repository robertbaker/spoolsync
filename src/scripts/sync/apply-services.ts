import { FilamentDbClient } from "@spoolsync/core/adapters/filamentdb";
import {
  applyAndReloadFilamentDb,
  applyAndReloadSpoolman,
  applyAndReloadTigertag,
} from "@spoolsync/core/apply";

import {
  loadFilamentDbConnection,
  loadSpoolmanConnection,
  loadTigertagSession,
  saveTigertagSession,
} from "~/lib/browser/storage";

import type { ApplyService } from "./apply-controller";

const serverChanged = "Connection changed. Fetch this server's inventory again before applying.";

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
            apply: (changes, progress) => applyAndReloadSpoolman(connection, changes, progress),
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
            identity: new FilamentDbClient(connection).baseUrl,
            description: `FilamentDB at ${connection.baseUrl}`,
            apply: (changes, progress) => applyAndReloadFilamentDb(connection, changes, progress),
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
            apply: (changes, progress) =>
              applyAndReloadTigertag(
                session,
                changes,
                (fresh) => saveTigertagSession(fresh, session.remember),
                progress,
              ),
          }
        );
      },
    },
  } satisfies Record<string, ApplyService>;
}
