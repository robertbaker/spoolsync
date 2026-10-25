import { BambuddyClient, type BambuddyInventoryClient, type BambuddyFetch } from "./client";
import { inventoryFromRecords } from "./map";
import type { BambuddyConnection, BambuddyLoadResult } from "./types";

export async function loadBambuddyInventory(
  client: BambuddyInventoryClient,
): Promise<BambuddyLoadResult> {
  const spools = await client.listSpools();
  return {
    ...inventoryFromRecords(spools),
    origin: "api",
    connectionId: client.baseUrl,
  };
}

export async function loadBambuddyApi(
  connection: BambuddyConnection,
  fetchImpl?: BambuddyFetch,
): Promise<BambuddyLoadResult> {
  return loadBambuddyInventory(new BambuddyClient(connection, fetchImpl));
}
