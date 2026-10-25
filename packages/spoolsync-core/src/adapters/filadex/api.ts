import type { LoadResult } from "../../core/model";
import { FiladexClient, type FiladexConnection } from "./client";
import { loadFiladexFile } from "./load";

/** Loads every filament from a Filadex server. Needs a login, so it works from Node, not a page. */
export async function loadFiladex(connection: FiladexConnection): Promise<LoadResult> {
  const client = new FiladexClient(connection);
  const loaded = loadFiladexFile(JSON.stringify(await client.listFilaments()));
  return { ...loaded, origin: "api", connectionId: `${client.baseUrl}#${connection.username}` };
}
