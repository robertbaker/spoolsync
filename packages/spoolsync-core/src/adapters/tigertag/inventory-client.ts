import type { TtagRecord } from "./schema";

/** Inventory operations used by the workflow, independent of HTTP and authentication. */
export interface TigertagInventoryClient {
  readonly uid: string;
  listInventory(): Promise<TtagRecord[]>;
  writeDocument(
    docId: string,
    fields: Record<string, unknown>,
    options?: { create?: boolean },
  ): Promise<void>;
}
