import { z } from "../../zod";
import {
  normalizeBaseUrl,
  needsLocalNetworkFlag,
  SpoolmanError,
  type SpoolmanConnection,
} from "./connection";

const DEFAULT_TIMEOUT_MS = 15_000;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RequestOptions<T> {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  schema: z.ZodType<T>;
}

/** HTTP operations used by the endpoint client; implementations can replace the transport. */
export interface SpoolmanTransport {
  readonly baseUrl: URL;
  apiUrl(path: string, query?: RequestOptions<unknown>["query"]): string;
  requestInit(init?: RequestInit): RequestInit;
  request<T>(method: string, path: string, options: RequestOptions<T>): Promise<T>;
  send(
    method: string,
    path: string,
    options: Omit<RequestOptions<unknown>, "schema">,
  ): Promise<{ body: string }>;
}

export class HttpSpoolmanTransport implements SpoolmanTransport {
  readonly baseUrl: URL;
  private readonly token: string | undefined;
  private readonly timeoutMs: number;

  constructor(
    connection: SpoolmanConnection,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly pageProtocol: string | undefined = globalThis.location?.protocol,
  ) {
    this.baseUrl = normalizeBaseUrl(connection.baseUrl);
    this.token = connection.token?.trim() || undefined;
    this.timeoutMs = connection.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Builds an `/api/v1` URL under the base, keeping any path prefix (e.g. a reverse proxy). */
  apiUrl(path: string, query?: RequestOptions<unknown>["query"]): string {
    const url = new URL(this.baseUrl);
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/v1${path}`;
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  /** Fetch options every request shares, including the Local Network Access flag when needed. */
  requestInit(init: RequestInit = {}): RequestInit {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (this.token) headers.set("authorization", `Bearer ${this.token}`);
    const out: RequestInit & { targetAddressSpace?: string } = {
      ...init,
      headers,
      redirect: "follow",
      credentials: "omit",
    };
    if (needsLocalNetworkFlag(this.baseUrl, this.pageProtocol)) out.targetAddressSpace = "local";
    return out;
  }

  async request<T>(method: string, path: string, options: RequestOptions<T>): Promise<T> {
    const { body } = await this.send(method, path, options);
    return this.parse(body, options.schema, path);
  }

  async send(
    method: string,
    path: string,
    options: Omit<RequestOptions<unknown>, "schema">,
  ): Promise<{ body: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const init: RequestInit = { method, signal: controller.signal };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
      init.headers = { "content-type": "application/json" };
    }
    let response: Response;
    let body: string;
    try {
      response = await this.fetchImpl(this.apiUrl(path, options.query), this.requestInit(init));
      if (response.status === 401 || response.status === 403) {
        void response.body?.cancel().catch(() => {});
        throw new SpoolmanError(
          "auth",
          this.token
            ? "Spoolman rejected the token"
            : "Spoolman requires a token (SPOOLMAN_API_TOKEN on Spoolman-NG)",
          response.status,
        );
      }
      // The deadline covers reading the body as well as receiving headers.
      body = await response.text();
    } catch (error) {
      if (error instanceof SpoolmanError) throw error;
      if (controller.signal.aborted) {
        throw new SpoolmanError(
          "timeout",
          `Spoolman did not answer within ${this.timeoutMs / 1000}s`,
        );
      }
      // Browsers report CORS, mixed-content, permission and DNS failures identically.
      throw new SpoolmanError(
        "network",
        `Could not reach Spoolman at ${this.baseUrl.origin}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      const detail = body;
      throw new SpoolmanError(
        "http",
        `Spoolman returned HTTP ${response.status} for ${method} ${path}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
        response.status,
      );
    }
    return { body };
  }

  private parse<T>(text: string, schema: z.ZodType<T>, path: string): T {
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new SpoolmanError("parse", `Spoolman sent something other than JSON for ${path}`);
    }
    const result = schema.safeParse(body);
    if (!result.success) {
      throw new SpoolmanError(
        "parse",
        `Unexpected response for ${path}: ${z.prettifyError(result.error).slice(0, 300)}`,
      );
    }
    return result.data;
  }
}
