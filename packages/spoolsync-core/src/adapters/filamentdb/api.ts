import type { LoadResult } from "../../core/model";
import { FilamentDbClient, type FilamentDbConnection } from "./client";
import { loadFilamentDbRecords } from "./load";

/**
 * Loads every spool from a FilamentDB server over its REST API. Pass the client an apply just used
 * to reuse its verified sign-in instead of probing again.
 */
export async function loadFilamentDb(
  connection: FilamentDbConnection,
  client: FilamentDbClient = new FilamentDbClient(connection),
): Promise<LoadResult> {
  const loaded = loadFilamentDbRecords(await client.listSpools());
  return { ...loaded, origin: "api", connectionId: client.baseUrl };
}
