type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface FiladexConnection {
  /** Base URL as the user typed it, e.g. `http://192.168.1.20:5000`. */
  baseUrl: string;
  username: string;
  password: string;
  timeoutMs?: number | undefined;
  /** Replaces `fetch`; used by tests. */
  fetchImpl?: FetchLike | undefined;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export function normalizeFiladexUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("Enter a URL such as http://192.168.1.20:5000");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("The URL must start with http:// or https://");
  if (url.username || url.password) throw new Error("Leave credentials out of the URL");
  return `${url.origin}${url.pathname.replace(/\/+$/, "").replace(/\/api$/, "")}`;
}

/**
 * Filadex authenticates its API with a session cookie from `POST /api/auth/login`, and sends no
 * CORS headers, so this client is for Node (the CLI). Browsers cannot hold that cookie
 * cross-origin.
 */
export class FiladexClient {
  readonly baseUrl: string;
  private cookie: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(private readonly connection: FiladexConnection) {
    this.baseUrl = normalizeFiladexUrl(connection.baseUrl);
    this.timeoutMs = connection.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = connection.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  private async fetch(
    path: string,
    init: RequestInit & { json?: unknown } = {},
  ): Promise<Response> {
    const { json, ...rest } = init;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...rest,
        headers: {
          Accept: "application/json",
          ...(json === undefined ? {} : { "Content-Type": "application/json" }),
          ...(this.cookie ? { Cookie: this.cookie } : {}),
        },
        ...(json === undefined ? {} : { body: JSON.stringify(json) }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(
        `Could not reach Filadex at ${this.baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async login(): Promise<void> {
    const response = await this.fetch("/api/auth/login", {
      method: "POST",
      json: { username: this.connection.username, password: this.connection.password },
    });
    if (response.status === 401 || response.status === 400)
      throw new Error("Filadex rejected the username or password.");
    if (!response.ok) throw new Error(`Filadex login answered ${response.status}.`);
    const cookies = response.headers.getSetCookie?.() ?? [];
    const token = cookies
      .map((value) => value.split(";")[0]!)
      .find((value) => value.startsWith("token="));
    if (!token) throw new Error("Filadex login did not return a session cookie.");
    this.cookie = token;
  }

  private async call(path: string, init: RequestInit & { json?: unknown } = {}): Promise<unknown> {
    if (!this.cookie) await this.login();
    const response = await this.fetch(path, init);
    if (!response.ok) {
      let detail = "";
      try {
        detail = ((await response.json()) as { message?: string }).message ?? "";
      } catch {
        // Non-JSON error body.
      }
      throw new Error(`Filadex answered ${response.status}${detail ? `: ${detail}` : ""}.`);
    }
    return response.json();
  }

  async listFilaments(): Promise<unknown[]> {
    const data = await this.call("/api/filaments");
    if (!Array.isArray(data)) throw new Error("Filadex returned an unexpected filament list.");
    return data;
  }

  async createFilament(payload: Record<string, unknown>): Promise<unknown> {
    return this.call("/api/filaments", { method: "POST", json: payload });
  }

  async updateFilament(id: string | number, payload: Record<string, unknown>): Promise<unknown> {
    return this.call(`/api/filaments/${encodeURIComponent(String(id))}`, {
      method: "PATCH",
      json: payload,
    });
  }
}
