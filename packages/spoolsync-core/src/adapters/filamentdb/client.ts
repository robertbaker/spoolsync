type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface FilamentDbConnection {
  /** Base URL as the user typed it, e.g. `http://192.168.1.20:3000`. */
  baseUrl: string;
  /** Bearer session token, for installs with user management enabled. */
  token?: string | undefined;
  timeoutMs?: number | undefined;
  /** Replaces `fetch`; used by tests. */
  fetchImpl?: FetchLike | undefined;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** Accepts a bare host, strips a trailing `/api` and slashes, and refuses credentials in the URL. */
export function normalizeFilamentDbUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("Enter a URL such as http://192.168.1.20:3000");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("The URL must start with http:// or https://");
  if (url.username || url.password)
    throw new Error("Leave credentials out of the URL; use the token field");
  return `${url.origin}${url.pathname.replace(/\/+$/, "").replace(/\/api$/, "")}`;
}

/** Minimal client for FilamentDB's `/api/spools` endpoints. */
export class FilamentDbClient {
  readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(connection: FilamentDbConnection) {
    this.baseUrl = normalizeFilamentDbUrl(connection.baseUrl);
    this.token = connection.token?.trim() || undefined;
    this.timeoutMs = connection.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = connection.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  private async request(method: "GET" | "POST", body?: unknown): Promise<unknown> {
    let response: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/spools`, {
        method,
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(
        `Could not reach FilamentDB at ${this.baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 401 || response.status === 403)
      throw new Error("FilamentDB refused the request. Check the session token.");
    if (!response.ok)
      throw new Error(`FilamentDB answered ${response.status} ${response.statusText}.`);
    try {
      return await response.json();
    } catch {
      throw new Error("FilamentDB did not return JSON. Check the URL points at FilamentDB.");
    }
  }

  async listSpools(): Promise<unknown[]> {
    const data = await this.request("GET");
    if (!Array.isArray(data)) throw new Error("FilamentDB returned an unexpected spool list.");
    return data;
  }

  /** `POST /api/spools` creates the spool, or replaces the one with the same serial. */
  async saveSpool(spool: Record<string, unknown>): Promise<void> {
    await this.request("POST", spool);
  }
}
