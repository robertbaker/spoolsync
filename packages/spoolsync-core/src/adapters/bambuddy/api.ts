import { BambuddyClient, type BambuddyInventoryClient, type BambuddyFetch } from "./client";
import { inventoryFromRecords } from "./map";
import type { BambuddyConnection, BambuddyLoadResult } from "./types";

/** Refuses a server whose spool table is no longer the one its inventory page shows. */
export async function assertBuiltInInventory(client: BambuddyInventoryClient): Promise<void> {
  if (await client.usesSpoolman())
    throw new Error(
      "Bambuddy keeps this inventory in Spoolman, so its own spool list is out of date. Connect SpoolSync to Spoolman instead.",
    );
}

export async function loadBambuddyInventory(
  client: BambuddyInventoryClient,
): Promise<BambuddyLoadResult> {
  await assertBuiltInInventory(client);
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
