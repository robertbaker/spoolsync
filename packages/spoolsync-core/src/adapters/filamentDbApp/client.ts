type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface FilamentDbAppConnection {
  /** Base URL as the user typed it, e.g. `http://192.168.1.20:3456`. */
  baseUrl: string;
  /** Bearer key, only when the server sets FILAMENTDB_API_KEY. */
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
    for (const entry of list as Array<Record<string, unknown>>)
      if (typeof entry["_id"] === "string" && typeof entry["name"] === "string")
        ids.set(entry["name"].trim().toLowerCase(), entry["_id"]);
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(
        `Could not reach Filament DB at ${this.baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 401)
      throw new Error("Filament DB refused the request. Check the API key (FILAMENTDB_API_KEY).");
    if (response.status === 403)
      throw new Error(
        "Filament DB rejected the request as cross-origin. Load it from the CLI, not a page.",
      );
    if (!response.ok)
      throw new Error(`Filament DB answered ${response.status} ${response.statusText}.`);
    try {
      return await response.json();
    } catch {
      throw new Error("Filament DB did not return JSON. Check the URL points at Filament DB.");
    }
  }
}
