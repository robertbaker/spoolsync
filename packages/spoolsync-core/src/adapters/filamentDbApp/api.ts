import type { LoadResult } from "../../core/model";
import { FilamentDbAppClient, type FilamentDbAppConnection } from "./client";
import { loadFilamentDbAppRecords } from "./load";

/**
 * Loads every spool from a Filament DB server. Read-only. From a page, the server must list its
 * origin in ALLOWED_ORIGINS.
 */
export async function loadFilamentDbApp(connection: FilamentDbAppConnection): Promise<LoadResult> {
  const client = new FilamentDbAppClient(connection);
  const loaded = loadFilamentDbAppRecords(await client.snapshot());
  return { ...loaded, origin: "api", connectionId: client.baseUrl };
}
