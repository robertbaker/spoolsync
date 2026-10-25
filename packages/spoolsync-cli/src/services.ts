import { loadFiladex } from "@spoolsync/core/adapters/filadex";
import { loadFilamentDb } from "@spoolsync/core/adapters/filamentdb";
import { loadSpoolman } from "@spoolsync/core/adapters/spoolman";
import {
  applyAndReloadFiladex,
  applyAndReloadFilamentDb,
  applyAndReloadSpoolman,
} from "@spoolsync/core/apply";
import type { PlannedChange } from "@spoolsync/core/core/compare";
import type { ApplyLogEntry, LoadResult, WritableSourceId } from "@spoolsync/core/core/model";

import type { Options } from "./args";

export interface RemoteService {
  source: WritableSourceId;
  label: string;
  load(): Promise<LoadResult>;
  apply(
    changes: PlannedChange[],
    progress: (done: number, total: number) => void,
  ): Promise<ApplyLogEntry[]>;
}

/** Resolve each connection when its turn is reached, preserving service load/error order. */
export function* remoteServices(
  options: Options,
  environment: Readonly<Record<string, string | undefined>>,
): Generator<RemoteService> {
  if (options.spoolmanUrl) {
    const token = options.spoolmanToken ?? environment["SPOOLMAN_TOKEN"];
    const connection = { baseUrl: options.spoolmanUrl, ...(token ? { token } : {}) };
    yield {
      source: "spoolman",
      label: "Spoolman",
      load: () => loadSpoolman(connection),
      apply: async (changes, progress) =>
        (await applyAndReloadSpoolman(connection, changes, progress)).log,
    };
  }
  if (options.filamentdbUrl) {
    const token = options.filamentdbToken ?? environment["FILAMENTDB_TOKEN"];
    const connection = { baseUrl: options.filamentdbUrl, ...(token ? { token } : {}) };
    yield {
      source: "filamentdb",
      label: "FilamentDB",
      load: () => loadFilamentDb(connection),
      apply: async (changes, progress) =>
        (await applyAndReloadFilamentDb(connection, changes, progress)).log,
    };
  }
  if (options.filadexUrl && options.filadexUser) {
    const password = environment["FILADEX_PASSWORD"];
    if (!password) throw new Error("Set FILADEX_PASSWORD to the Filadex account password.");
    const connection = { baseUrl: options.filadexUrl, username: options.filadexUser, password };
    yield {
      source: "filadex",
      label: "Filadex",
      load: () => loadFiladex(connection),
      apply: async (changes, progress) =>
        (await applyAndReloadFiladex(connection, changes, progress)).log,
    };
  }
}
