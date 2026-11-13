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

async function reloadAfterApply(
  service: ApplyServiceName,
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
  const client = new FilamentDbClient(connection);
  const log = await applyToFilamentDb(client, changes, onProgress);
  return reloadAfterApply("FilamentDB", log, () => loadFilamentDb(connection, client));
}

/** Applies spool-level changes to Filament DB and fetches a fresh snapshot. */
export async function applyAndReloadFilamentDbApp(
  connection: FilamentDbAppConnection,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyAndReloadResult> {
  const log = await applyToFilamentDbApp(new FilamentDbAppClient(connection), changes, onProgress);
  return reloadAfterApply("Filament DB", log, () => loadFilamentDbApp(connection));
}

/** Applies the plan to Bambuddy through its inventory API and fetches a fresh snapshot. */
export async function applyAndReloadBambuddy(
  connection: BambuddyConnection,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyAndReloadResult> {
  const log = await applyToBambuddy(new BambuddyClient(connection), changes, onProgress);
  return reloadAfterApply("Bambuddy", log, () => loadBambuddyApi(connection));
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

/** Applies the plan to PrintStudio (local lots only) and fetches a fresh snapshot. */
export async function applyAndReloadPrintStudio(
  connection: PrintStudioConnection,
  changes: PlannedChange[],
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyAndReloadResult> {
  const log = await applyToPrintStudio(new PrintStudioClient(connection), changes, onProgress);
  return reloadAfterApply("PrintStudio", log, () => loadPrintStudioApi(connection));
}
