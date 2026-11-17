import { normalizeBambuddyUrl } from "@spoolsync/core/adapters/bambuddy/client";
import {
  normalizeFilamentDbUrl,
  type FilamentDbConnection,
} from "@spoolsync/core/adapters/filamentdb/client";
import type { SpoolmanConnection } from "@spoolsync/core/adapters/spoolman/client";
import type { TigertagSession } from "@spoolsync/core/adapters/tigertag/cloud";
import type { ApplyAndReloadResult } from "@spoolsync/core/apply";
import type { PlannedChange } from "@spoolsync/core/core/compare";

import {
  loadBambuddyConnection,
  loadFilamentDbConnection,
  loadSpoolmanConnection,
  loadTigertagSession,
  saveRefreshedTigertagSession,
} from "~/lib/browser/storage";

import type { ApplyService } from "./apply-controller";

const serverChanged = "Connection changed. Fetch this server's inventory again before applying.";

type ApplyModule = typeof import("@spoolsync/core/apply");
type BambuddyConnection = NonNullable<ReturnType<typeof loadBambuddyConnection>>;

export interface ApplyCredentialStore {
  loadSpoolman(): SpoolmanConnection | null;
  loadFilamentDb(): FilamentDbConnection | null;
  loadBambuddy(): BambuddyConnection | null;
  loadTigertag(): (TigertagSession & { remember: boolean }) | null;
  saveTigertag(
    session: TigertagSession,
    remember: boolean,
    expected: Pick<TigertagSession, "uid" | "idToken" | "refreshToken">,
  ): void;
  loadWrites(): Promise<ApplyModule>;
}

const browserCredentialStore: ApplyCredentialStore = {
  loadSpoolman: loadSpoolmanConnection,
  loadFilamentDb: loadFilamentDbConnection,
  loadBambuddy: loadBambuddyConnection,
  loadTigertag: loadTigertagSession,
  saveTigertag: saveRefreshedTigertagSession,
  /** The write code for every service loads when something is applied, not with the Sync page. */
  loadWrites: () => import("@spoolsync/core/apply"),
};

function connectionService<TConnection>(options: {
  changedMessage: string;
  load(): TConnection | null;
  identity(connection: TConnection): string;
  description(connection: TConnection): string;
  apply(
    connection: TConnection,
    changes: PlannedChange[],
    progress: (done: number, total: number) => void,
  ): Promise<ApplyAndReloadResult>;
}): ApplyService {
  return {
    changedMessage: options.changedMessage,
    connect() {
      const connection = options.load();
      return (
        connection && {
          identity: options.identity(connection),
          description: options.description(connection),
          apply: (changes, progress) => options.apply(connection, changes, progress),
        }
      );
    },
  };
}

/** Composition root for browser credentials and remote adapter implementations. */
export function createApplyServices(store: ApplyCredentialStore = browserCredentialStore) {
  return {
    spoolman: connectionService({
      changedMessage: serverChanged,
      load: () => store.loadSpoolman(),
      identity: (connection) => connection.baseUrl,
      description: (connection) => `Spoolman at ${connection.baseUrl}`,
      apply: async (connection, changes, progress) =>
        (await store.loadWrites()).applyAndReloadSpoolman(connection, changes, progress),
    }),
    filamentdb: connectionService({
      changedMessage: serverChanged,
      load: () => store.loadFilamentDb(),
      identity: (connection) => normalizeFilamentDbUrl(connection.baseUrl),
      description: (connection) => `FilamentDB at ${connection.baseUrl}`,
      apply: async (connection, changes, progress) =>
        (await store.loadWrites()).applyAndReloadFilamentDb(connection, changes, progress),
    }),
    bambuddy: connectionService({
      changedMessage: serverChanged,
      load: () => store.loadBambuddy(),
      identity: (connection) => normalizeBambuddyUrl(connection.baseUrl),
      description: (connection) => `Bambuddy at ${connection.baseUrl}`,
      apply: async (connection, changes, progress) =>
        (await store.loadWrites()).applyAndReloadBambuddy(connection, changes, progress),
    }),
    tigertag: connectionService({
      changedMessage: "Account changed. Fetch this account's inventory again before applying.",
      load: () => store.loadTigertag(),
      identity: (session) => session.uid,
      description: (session) => `the TigerTag inventory of ${session.email}`,
      apply: async (session, changes, progress) =>
        (await store.loadWrites()).applyAndReloadTigertag(
          session,
          changes,
          (fresh) => store.saveTigertag(fresh, session.remember, session),
          progress,
        ),
    }),
  } satisfies Record<string, ApplyService>;
}
