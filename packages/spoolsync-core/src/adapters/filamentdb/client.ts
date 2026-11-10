import { fetchWithHeaderTimeout, type FetchLike } from "../shared/fetch";
import { localNetworkInit } from "../shared/local-network";

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

  private async send(path: string, method: "GET" | "POST", body?: unknown): Promise<Response> {
    try {
      return await fetchWithHeaderTimeout(
        this.fetchImpl,
        `${this.baseUrl}${path}`,
        {
          method,
          headers: {
            Accept: "application/json",
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          ...localNetworkInit(this.baseUrl),
        },
        this.timeoutMs,
      );
    } catch (error) {
      throw new Error(
        `Could not reach FilamentDB at ${this.baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async request(method: "GET" | "POST", body?: unknown): Promise<unknown> {
    const response = await this.send("/api/spools", method, body);
    if (response.status === 401)
      throw new Error("FilamentDB refused the request. Check the session token.");
    // Upstream answers 403 "Permission denied" when the signed-in user may not change a spool, such
    // as one another owner created; the token itself is fine.
    if (response.status === 403)
      throw new Error(
        "FilamentDB denied permission for this request. The signed-in user may not edit this spool (for example one owned by another user).",
      );
    if (!response.ok)
      throw new Error(`FilamentDB answered ${response.status} ${response.statusText}.`);
    try {
      return await response.json();
    } catch {
      throw new Error("FilamentDB did not return JSON. Check the URL points at FilamentDB.");
    }
  }

  /**
   * With user management on, FilamentDB answers a missing or expired token with 200 and only the
   * public spools. Private ones would look deleted and be planned as new, so that list is refused.
   */
  private async assertSignedIn(): Promise<void> {
    const config = await this.send("/api/config/auth", "GET");
    const settings = config.ok ? ((await config.json().catch(() => null)) as unknown) : null;
    if ((settings as { enabled?: unknown } | null)?.enabled !== true) return;
    if (!this.token)
      throw new Error(
        "FilamentDB has user management on and hides private spools without a session token. Add the token and try again.",
      );
    // `/api/auth/*` sends no CORS headers, so a browser cannot call `/api/auth/me`. A sync under the
    // CORS middleware answers 401 for a missing or expired session. Upstream the handler is a full
    // scan of the collection even when nothing changed, so this probe is not free on a large library.
    // Cheaper routes were checked upstream and rejected: `POST /api/spools` validates the body before
    // auth (a bad body is 400 either way, a good one writes), `GET /api/spools` and `/api/spools/[serial]`
    // never answer 401, `/api/users` answers 403 for anyone but an admin, and `/api/auth/*` has no CORS.
    let probe: Response;
    try {
      probe = await this.send("/api/sync", "POST", {
        lastSyncTime: Number.MAX_SAFE_INTEGER,
        changes: [],
        deletions: [],
      });
    } catch (error) {
      throw new Error(
        `Could not verify the FilamentDB sign-in: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (probe.status === 401)
      throw new Error("FilamentDB refused the session token, so private spools would be hidden.");
    // Only a 2xx proves the token is accepted; 403, 5xx and anything else must not skip the guard.
    if (!probe.ok)
      throw new Error(
        `Could not verify the FilamentDB sign-in: the server answered ${probe.status} ${probe.statusText}.`,
      );
  }

  async listSpools(): Promise<unknown[]> {
    await this.assertSignedIn();
    const data = await this.request("GET");
    if (!Array.isArray(data)) throw new Error("FilamentDB returned an unexpected spool list.");
    return data;
  }

  /** `POST /api/spools` creates the spool, or replaces the one with the same serial. */
  async saveSpool(spool: Record<string, unknown>): Promise<void> {
    await this.request("POST", spool);
  }
}
