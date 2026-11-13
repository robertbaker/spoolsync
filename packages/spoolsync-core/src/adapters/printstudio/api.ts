import {
  PrintStudioClient,
  type PrintStudioFetch,
  type PrintStudioInventoryClient,
} from "./client";
import { inventoryFromLots } from "./map";
import type { PrintStudioConnection, PrintStudioLoadResult } from "./types";

export async function loadPrintStudioInventory(
  client: PrintStudioInventoryClient,
): Promise<PrintStudioLoadResult> {
  const lots = await client.listLots();
  return {
    ...inventoryFromLots(lots),
    file: lots,
    origin: "api",
    connectionId: client.baseUrl,
  };
}

export async function loadPrintStudioApi(
  connection: PrintStudioConnection,
  fetchImpl?: PrintStudioFetch,
): Promise<PrintStudioLoadResult> {
  return loadPrintStudioInventory(new PrintStudioClient(connection, fetchImpl));
}
