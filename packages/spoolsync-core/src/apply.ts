import { loadFiladex, type FiladexConnection } from "./adapters/filadex";
import { applyToFiladex } from "./adapters/filadex/apply";
import { FiladexClient } from "./adapters/filadex/client";
import { loadFilamentDb, type FilamentDbConnection } from "./adapters/filamentdb";
import { applyToFilamentDb } from "./adapters/filamentdb/apply";
import { FilamentDbClient } from "./adapters/filamentdb/client";
import { loadSpoolman } from "./adapters/spoolman";
import { applyToSpoolman } from "./adapters/spoolman/apply";
import { SpoolmanClient, type SpoolmanConnection } from "./adapters/spoolman/client";
import {
  applyToTigertagCloud,
  loadTigertagCloud,
  TigertagCloud,
  type TigertagSession,
} from "./adapters/tigertag/cloud";
import type { PlannedChange } from "./core/compare";
import type { LoadResult, ApplyLogEntry } from "./core/model";

type ApplyService = "Spoolman" | "TigerTag" | "FilamentDB" | "Filadex";

export interface ApplyAndReloadResult {
  log: ApplyLogEntry[];
  inventory: LoadResult;
}

/** Writes have already been attempted; callers must retain the log even if refresh fails. */
export class ApplyReloadError extends Error {
  constructor(
    readonly service: ApplyService,
    readonly log: ApplyLogEntry[],
    cause: unknown,
  ) {
    const succeeded = log.filter((entry) => entry.ok).length;
    super(
      `${service} apply finished (${succeeded} succeeded, ${log.length - succeeded} failed), but inventory refresh failed: ${cause instanceof Error ? cause.message : String(cause)}. Reload the inventory before retrying writes.`,
      { cause },
    );
    this.name = "ApplyReloadError";
  }
}

async function reloadAfterApply(
  service: ApplyService,
  log: ApplyLogEntry[],
  reload: () => Promise<LoadResult>,
): Promise<ApplyAndReloadResult> {
  try {
    return { log, inventory: await reload() };
  } catch (error) {
    throw new ApplyReloadError(service, log, error);
  }
}

/** Applies the plan to Spoolman and fetches a fresh snapshot for the next render. */
export async function applyAndReloadSpoolman(
  connection: SpoolmanConnection,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyAndReloadResult> {
  const client = new SpoolmanClient(connection);
  const log = await applyToSpoolman(client, changes, onProgress);
  return reloadAfterApply("Spoolman", log, () => loadSpoolman(connection));
}

/** Applies the plan to TigerTag, refreshing tokens through the supplied session callback. */
export async function applyAndReloadTigertag(
  session: TigertagSession,
  changes: PlannedChange[],
  onFreshSession: (session: TigertagSession) => void,
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyAndReloadResult> {
  const cloud = new TigertagCloud(session, onFreshSession);
  const log = await applyToTigertagCloud(cloud, changes, onProgress);
  return reloadAfterApply("TigerTag", log, () => loadTigertagCloud(cloud));
}

/** Applies the plan to FilamentDB and fetches a fresh snapshot. */
export async function applyAndReloadFilamentDb(
  connection: FilamentDbConnection,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyAndReloadResult> {
  const log = await applyToFilamentDb(new FilamentDbClient(connection), changes, onProgress);
  return reloadAfterApply("FilamentDB", log, () => loadFilamentDb(connection));
}

/** Applies the plan to Filadex (Node only; it needs a cookie login) and fetches a fresh snapshot. */
export async function applyAndReloadFiladex(
  connection: FiladexConnection,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyAndReloadResult> {
  const log = await applyToFiladex(new FiladexClient(connection), changes, onProgress);
  return reloadAfterApply("Filadex", log, () => loadFiladex(connection));
}
