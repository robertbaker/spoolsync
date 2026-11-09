import { numericId, recordsFrom } from "./map";
import type { BambuddyConnection, BambuddySpool, BambuddySpoolPayload } from "./types";

export type BambuddyFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Inventory operations required by the loader, independent of its HTTP transport. */
export interface BambuddyInventoryClient {
  readonly baseUrl: string;
  listSpools(): Promise<BambuddySpool[]>;
  /** True when the server keeps its inventory in Spoolman and its own spool table is out of date. */
  usesSpoolman(): Promise<boolean>;
}

/** Remote operations required by the write workflow, without transport or credential details. */
export interface BambuddyWriteClient extends BambuddyInventoryClient {
  createSpool(payload: BambuddySpoolPayload): Promise<BambuddySpool>;
  updateSpool(id: number, payload: BambuddySpoolPayload): Promise<BambuddySpool>;
  archiveSpool(id: number): Promise<BambuddySpool>;
  restoreSpool(id: number): Promise<BambuddySpool>;
}

const SCOPE_HINT =
  "Writing needs an API key with the Manage inventory scope (can_manage_inventory); reading needs Read status (can_read_status).";

/** FastAPI reports problems as `{ detail: string | [{ loc, msg }] }`. */
async function errorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail))
      return body.detail
        .map((item) => {
          const entry = item as { loc?: unknown[]; msg?: unknown };
          const where = Array.isArray(entry.loc)
            ? entry.loc.filter((p) => p !== "body").join(".")
            : "";
          return `${where ? `${where}: ` : ""}${String(entry.msg ?? "invalid")}`;
        })
        .join("; ");
  } catch {
    // Non-JSON error body.
  }
  return "";
}

export function normalizeBambuddyUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("Enter a valid Bambuddy URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("The Bambuddy URL must start with http:// or https://.");
  if (url.username || url.password)
    throw new Error("Leave credentials out of the Bambuddy URL; use the API key option.");
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export class BambuddyClient implements BambuddyWriteClient {
  readonly baseUrl: string;

  constructor(
    private readonly connection: BambuddyConnection,
    private readonly fetchImpl: BambuddyFetch = (input, init) => fetch(input, init),
  ) {
    this.baseUrl = normalizeBambuddyUrl(connection.baseUrl);
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

  /**
   * Bambuddy answers this route with 400 unless Spoolman is switched on, and it needs only the
   * scope the spool list needs. A server error means it is on but Spoolman could not be reached;
   * anything else (an older server without the route, a refused key) counts as the built-in table.
   */
  async usesSpoolman(): Promise<boolean> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/v1/spoolman/inventory/spools`, {
      headers: { "X-API-Key": this.connection.apiKey },
    });
    if (response.status >= 500) return true;
    if (!response.ok) return false;
    return Array.isArray(await response.json().catch(() => null));
  }

  private async write(
    path: string,
    method: "POST" | "PATCH",
    body?: unknown,
  ): Promise<BambuddySpool> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/v1/inventory/spools${path}`, {
      method,
      headers: {
        "X-API-Key": this.connection.apiKey,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const detail = await errorDetail(response);
      const hint =
        response.status === 401
          ? `Bambuddy rejected the API key. ${SCOPE_HINT}`
          : response.status === 403
            ? `The API key may not change the inventory. ${SCOPE_HINT}`
            : "";
      throw new Error(
        [
          `Bambuddy answered ${response.status}${detail ? `: ${detail.replace(/[.!]?$/, ".")}` : "."}`,
          hint,
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
    const record = (await response.json()) as BambuddySpool;
    if (!record || typeof record !== "object" || numericId(record.id) === null)
      throw new Error("Bambuddy answered without the saved spool.");
    return record;
  }

  createSpool(payload: BambuddySpoolPayload): Promise<BambuddySpool> {
    return this.write("", "POST", payload);
  }

  updateSpool(id: number, payload: BambuddySpoolPayload): Promise<BambuddySpool> {
    return this.write(`/${id}`, "PATCH", payload);
  }

  archiveSpool(id: number): Promise<BambuddySpool> {
    return this.write(`/${id}/archive`, "POST");
  }

  restoreSpool(id: number): Promise<BambuddySpool> {
    return this.write(`/${id}/restore`, "POST");
  }
}
