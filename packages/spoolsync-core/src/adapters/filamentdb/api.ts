import type { LoadResult } from "../../core/model";
import { FilamentDbClient, type FilamentDbConnection } from "./client";
import { loadFilamentDbFile } from "./load";

/** Loads every spool from a FilamentDB server over its REST API. */
export async function loadFilamentDb(connection: FilamentDbConnection): Promise<LoadResult> {
  const client = new FilamentDbClient(connection);
  const loaded = loadFilamentDbFile(JSON.stringify(await client.listSpools()));
  return { ...loaded, origin: "api", connectionId: client.baseUrl };
}
