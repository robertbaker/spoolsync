import { recordsFrom } from "./map";
import type { BambuddyConnection, BambuddySpool } from "./types";

export type BambuddyFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Inventory operations required by the loader, independent of its HTTP transport. */
export interface BambuddyInventoryClient {
  readonly baseUrl: string;
  listSpools(): Promise<BambuddySpool[]>;
}

export class BambuddyClient implements BambuddyInventoryClient {
  readonly baseUrl: string;

  constructor(
    private readonly connection: BambuddyConnection,
    private readonly fetchImpl: BambuddyFetch = (input, init) => fetch(input, init),
  ) {
    this.baseUrl = connection.baseUrl.trim().replace(/\/$/, "");
  }

  async listSpools(): Promise<BambuddySpool[]> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/api/v1/inventory/spools?include_archived=true`,
      {
        headers: { "X-API-Key": this.connection.apiKey },
      },
    );
    if (!response.ok)
      throw new Error(
        `Bambuddy returned HTTP ${response.status}. Check the address, API key, and API permissions.`,
      );
    return recordsFrom(await response.json());
  }
}
