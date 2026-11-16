import { loadBambuddyApi, type BambuddyConnection } from "./adapters/bambuddy";
import { applyToBambuddy } from "./adapters/bambuddy/apply";
import { BambuddyClient } from "./adapters/bambuddy/client";
import { loadFiladex, type FiladexConnection } from "./adapters/filadex";
import { applyToFiladex } from "./adapters/filadex/apply";
import { FiladexClient } from "./adapters/filadex/client";
import { loadFilamentDb, type FilamentDbConnection } from "./adapters/filamentdb";
import { applyToFilamentDb } from "./adapters/filamentdb/apply";
import { FilamentDbClient } from "./adapters/filamentdb/client";
import { loadFilamentDbApp, type FilamentDbAppConnection } from "./adapters/filamentDbApp";
import { applyToFilamentDbApp } from "./adapters/filamentDbApp/apply";
import { FilamentDbAppClient } from "./adapters/filamentDbApp/client";
import { loadPrintStudioApi, type PrintStudioConnection } from "./adapters/printstudio";
import { applyToPrintStudio } from "./adapters/printstudio/apply";
import { PrintStudioClient } from "./adapters/printstudio/client";
import { loadSpoolman } from "./adapters/spoolman";
import { applyToSpoolman } from "./adapters/spoolman/apply";
import { SpoolmanClient, type SpoolmanConnection } from "./adapters/spoolman/client";
import {
  applyToTigertagCloud,
  loadTigertagCloud,
  TigertagCloud,
  type TigertagSession,
} from "./adapters/tigertag/cloud";
import { ApplyReloadError, type ApplyServiceName } from "./core/apply-error";
import type { PlannedChange } from "./core/compare";
import type { LoadResult, ApplyLogEntry } from "./core/model";

export { ApplyReloadError };

export interface ApplyAndReloadResult {
  log: ApplyLogEntry[];
  inventory: LoadResult;
}

async function runApplyAndReload(
  service: ApplyServiceName,
  apply: () => Promise<ApplyLogEntry[]>,
  reload: () => Promise<LoadResult>,
): Promise<ApplyAndReloadResult> {
  const log = await apply();
  try {
    return { log, inventory: await reload() };
  } catch (error) {
    throw new ApplyReloadError(service, log, error);
  }
}

/** Applies the plan to Spoolman and fetches a fresh snapshot for the next render. */
export function applyAndReloadSpoolman(
  connection: SpoolmanConnection,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyAndReloadResult> {
  return runApplyAndReload(
    "Spoolman",
    () => applyToSpoolman(new SpoolmanClient(connection), changes, onProgress),
    () => loadSpoolman(connection),
  );
}

/** Applies the plan to TigerTag, refreshing tokens through the supplied session callback. */
export function applyAndReloadTigertag(
  session: TigertagSession,
  changes: PlannedChange[],
  onFreshSession: (session: TigertagSession) => void,
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyAndReloadResult> {
  const cloud = new TigertagCloud(session, onFreshSession);
  return runApplyAndReload(
    "TigerTag",
    () => applyToTigertagCloud(cloud, changes, onProgress),
    () => loadTigertagCloud(cloud),
  );
}

/** Applies the plan to FilamentDB and fetches a fresh snapshot. */
export function applyAndReloadFilamentDb(
  connection: FilamentDbConnection,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyAndReloadResult> {
  const client = new FilamentDbClient(connection);
  return runApplyAndReload(
    "FilamentDB",
    () => applyToFilamentDb(client, changes, onProgress),
    () => loadFilamentDb(connection, client),
  );
}

/** Applies spool-level changes to Filament DB and fetches a fresh snapshot. */
export function applyAndReloadFilamentDbApp(
  connection: FilamentDbAppConnection,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyAndReloadResult> {
  return runApplyAndReload(
    "Filament DB",
    () => applyToFilamentDbApp(new FilamentDbAppClient(connection), changes, onProgress),
    () => loadFilamentDbApp(connection),
  );
}

/** Applies the plan to Bambuddy through its inventory API and fetches a fresh snapshot. */
export function applyAndReloadBambuddy(
  connection: BambuddyConnection,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyAndReloadResult> {
  return runApplyAndReload(
    "Bambuddy",
    () => applyToBambuddy(new BambuddyClient(connection), changes, onProgress),
    () => loadBambuddyApi(connection),
  );
}

/** Applies the plan to Filadex (Node only; it needs a cookie login) and fetches a fresh snapshot. */
export function applyAndReloadFiladex(
  connection: FiladexConnection,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyAndReloadResult> {
  return runApplyAndReload(
    "Filadex",
    () => applyToFiladex(new FiladexClient(connection), changes, onProgress),
    () => loadFiladex(connection),
  );
}

/** Applies the plan to PrintStudio (local lots only) and fetches a fresh snapshot. */
export function applyAndReloadPrintStudio(
  connection: PrintStudioConnection,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyAndReloadResult> {
  return runApplyAndReload(
    "PrintStudio",
    () => applyToPrintStudio(new PrintStudioClient(connection), changes, onProgress),
    () => loadPrintStudioApi(connection),
  );
}
