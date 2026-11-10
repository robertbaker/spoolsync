import { fetchWithHeaderTimeout, type FetchLike } from "../shared/fetch";
import { idOf } from "./map";

export interface FilamentDbAppConnection {
  /** Base URL as the user typed it, e.g. `http://192.168.1.20:3456`. */
  baseUrl: string;
  /**
   * Bearer key, only when the server sets FILAMENTDB_API_KEY (the CLI reads it from
   * FILAMENT_DB_API_KEY).
   */
  token?: string | undefined;
  timeoutMs?: number | undefined;
  /** Replaces `fetch`; used by tests. */
  fetchImpl?: FetchLike | undefined;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Accepts a bare host, strips a trailing `/api` and slashes, and refuses credentials in the URL. */
export function normalizeFilamentDbAppUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("Enter a URL such as http://192.168.1.20:3456");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("The URL must start with http:// or https://");
  if (url.username || url.password)
    throw new Error("Leave credentials out of the URL; use the key option");
  return `${url.origin}${url.pathname.replace(/\/+$/, "").replace(/\/api$/, "")}`;
}

const MAX_ERROR_DETAIL = 300;

/** The `{ error, detail }` text of a failed response, trimmed; empty when there is none. */
async function upstreamError(response: Response): Promise<string> {
  try {
    const text = (await response.text()).trim();
    if (!text) return "";
    let message = text;
    try {
      const body = JSON.parse(text) as unknown;
      if (body && typeof body === "object") {
        const { error, detail } = body as { error?: unknown; detail?: unknown };
        const parts = [error, detail].filter((v): v is string => typeof v === "string" && !!v);
        // Anything that is not the documented error shape is not worth echoing.
        message = parts.join(" - ");
      }
    } catch {
      // Plain text (for example a proxy error page) is shortened below.
    }
    message = message.replace(/\s+/g, " ").trim();
    return message.length > MAX_ERROR_DETAIL ? `${message.slice(0, MAX_ERROR_DETAIL)}...` : message;
  } catch {
    return "";
  }
}

/**
 * Client for Filament DB. `GET /api/snapshot` is the one call that returns full filaments, spools
 * and locations, and Filament DB rejects its writes for browser cross-origin requests, so the API
 * integration is for Node (the CLI) only.
 */
export class FilamentDbAppClient {
  readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(connection: FilamentDbAppConnection) {
    this.baseUrl = normalizeFilamentDbAppUrl(connection.baseUrl);
    this.token = connection.token?.trim() || undefined;
    this.timeoutMs = connection.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = connection.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  async snapshot(): Promise<unknown> {
    return this.request("GET", "/api/snapshot");
  }

  /** Active location names (lower case) to ids, for moving a spool by name. */
  async locationIds(): Promise<Map<string, string>> {
    const list = await this.request("GET", "/api/locations");
    if (!Array.isArray(list)) throw new Error("Filament DB returned an unexpected location list.");
    const ids = new Map<string, string>();
    for (const entry of list as Array<Record<string, unknown>>) {
      if (!entry || typeof entry !== "object" || entry["_deletedAt"]) continue;
      const id = idOf(entry["_id"]);
      const name = typeof entry["name"] === "string" ? entry["name"].trim().toLowerCase() : "";
      if (id && name) ids.set(name, id);
    }
    return ids;
  }

  /** PUT /api/filaments/{id}/spools/{spoolId} changes only the fields sent. */
  async updateSpool(filamentId: string, spoolId: string, patch: object): Promise<void> {
    await this.request(
      "PUT",
      `/api/filaments/${encodeURIComponent(filamentId)}/spools/${encodeURIComponent(spoolId)}`,
      patch,
    );
  }

  /** PUT /api/filaments/{id} changes only the fields sent; they are shared by all its spools. */
  async updateFilament(filamentId: string, patch: object): Promise<void> {
    await this.request("PUT", `/api/filaments/${encodeURIComponent(filamentId)}`, patch);
  }

  /** POST /api/filaments/{id}/spools adds a spool; Filament DB refuses it on a template. */
  async createSpool(filamentId: string, body: object): Promise<void> {
    await this.request("POST", `/api/filaments/${encodeURIComponent(filamentId)}/spools`, body);
  }

  private async request(
    method: "GET" | "PUT" | "POST",
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchWithHeaderTimeout(
        this.fetchImpl,
        `${this.baseUrl}${path}`,
        {
          method,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          headers: {
            Accept: "application/json",
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          },
        },
        this.timeoutMs,
      );
    } catch (error) {
      throw new Error(
        `Could not reach Filament DB at ${this.baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (response.status === 401)
      throw new Error(
        "Filament DB refused the request. Check the API key (FILAMENT_DB_API_KEY, or FILAMENTDB_API_KEY).",
      );
    if (response.status === 403)
      throw new Error(
        "Filament DB refused the request as cross-origin. A reverse proxy that rewrites the Host or Origin header is the usual cause; make it pass the original Host (with its port) through.",
      );
    if (!response.ok) {
      const detail = await upstreamError(response);
      throw new Error(
        `Filament DB answered ${response.status} ${response.statusText}${detail ? `: ${detail}` : "."}`,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new Error("Filament DB did not return JSON. Check the URL points at Filament DB.");
    }
  }
}
