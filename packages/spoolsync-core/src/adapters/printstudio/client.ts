import { localNetworkInit } from "../shared/local-network";
import { lotsFrom } from "./map";
import type { PrintStudioConnection, PrintStudioLot, PrintStudioLotPayload } from "./types";

export type PrintStudioFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Inventory operations required by the loader, independent of its HTTP transport. */
export interface PrintStudioInventoryClient {
  readonly baseUrl: string;
  listLots(): Promise<PrintStudioLot[]>;
}

/** Remote operations required by the write workflow. */
export interface PrintStudioWriteClient extends PrintStudioInventoryClient {
  createLot(payload: PrintStudioLotPayload): Promise<PrintStudioLot>;
  updateLot(id: string, payload: PrintStudioLotPayload): Promise<PrintStudioLot>;
  clearDetails(id: string, keys: ReadonlyArray<"brand" | "material">): Promise<void>;
  adjustStock(id: string, quantityDelta: number, reason: string): Promise<void>;
}

export function normalizePrintStudioUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("Enter a valid PrintStudio URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("The PrintStudio URL must start with http:// or https://.");
  if (url.username || url.password)
    throw new Error("Leave credentials out of the PrintStudio URL; use the operator id option.");
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown };
    const text = body.error ?? body.message;
    if (typeof text === "string") return text;
  } catch {
    // Non-JSON error body.
  }
  return "";
}

export class PrintStudioClient implements PrintStudioWriteClient {
  readonly baseUrl: string;

  constructor(
    private readonly connection: PrintStudioConnection,
    private readonly fetchImpl: PrintStudioFetch = (input, init) => fetch(input, init),
  ) {
    this.baseUrl = normalizePrintStudioUrl(connection.baseUrl);
    if (!connection.operatorId.trim()) throw new Error("Enter the PrintStudio operator id.");
  }

  private async request(path: string, method: string, body?: unknown): Promise<Response> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "x-operator-id": this.connection.operatorId,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...localNetworkInit(this.baseUrl),
    });
    if (!response.ok) {
      const detail = await errorDetail(response);
      const hint =
        response.status === 401 || response.status === 403 ? " Check the operator id." : "";
      throw new Error(
        `PrintStudio answered ${response.status}${detail ? `: ${detail.replace(/[.!]?$/, ".")}` : "."}${hint}`,
      );
    }
    return response;
  }

  async listLots(): Promise<PrintStudioLot[]> {
    return lotsFrom(await (await this.request("/materials", "GET")).json());
  }

  async createLot(payload: PrintStudioLotPayload): Promise<PrintStudioLot> {
    return this.saved(await this.request("/api/materials", "POST", payload));
  }

  async updateLot(id: string, payload: PrintStudioLotPayload): Promise<PrintStudioLot> {
    return this.saved(
      await this.request(`/api/materials/${encodeURIComponent(id)}`, "PUT", payload),
    );
  }

  /** Clears `brand` or `material` (null), which a PUT cannot do. */
  async clearDetails(id: string, keys: ReadonlyArray<"brand" | "material">): Promise<void> {
    await this.request(
      `/api/materials/${encodeURIComponent(id)}/details`,
      "PATCH",
      Object.fromEntries(keys.map((key) => [key, null])),
    );
  }

  async adjustStock(id: string, quantityDelta: number, reason: string): Promise<void> {
    await this.request(`/materials/${encodeURIComponent(id)}/adjust-stock`, "POST", {
      quantityDelta,
      reason,
    });
  }

  private async saved(response: Response): Promise<PrintStudioLot> {
    const lot = (await response.json()) as PrintStudioLot;
    if (!lot || typeof lot !== "object" || typeof lot.id !== "string")
      throw new Error("PrintStudio answered without the saved lot.");
    return lot;
  }
}
