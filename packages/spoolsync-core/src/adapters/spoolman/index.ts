import type { LoadResult } from "../../core/model";
import { SpoolmanClient, type SpoolmanConnection } from "./client";
import { spoolmanToCommon } from "./map";

export { normalizeBaseUrl, SpoolmanClient, SpoolmanError } from "./client";
export type { SpoolmanConnection } from "./client";
export { browserEnvironment, diagnoseConnection } from "./diagnose";
export type { Diagnosis } from "./diagnose";
export { spoolmanToCommon, SPOOLMAN_SPOOL_EXTRAS } from "./map";
export { applyToSpoolman, defaultDensity } from "./apply";
export { exportSpoolmanJson, loadSpoolmanFile, unflatten } from "./file";
export type { ApplyLogEntry } from "./apply";

/** Loads every spool, archived included, from a Spoolman or Spoolman-NG server. */
export async function loadSpoolman(connection: SpoolmanConnection): Promise<LoadResult> {
  const client = new SpoolmanClient(connection);
  const spools = await client.listSpools({ allowArchived: true });
  return {
    source: "spoolman",
    origin: "api",
    connectionId: client.baseUrl.toString().replace(/\/$/, ""),
    spools: spools.map(spoolmanToCommon),
    warnings: [],
    loadedAt: new Date().toISOString(),
  };
}

export type { SpoolmanWriteClient } from "./write-client";
