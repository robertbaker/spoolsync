import { MAX_REFERENCE_RECORDS } from "./file";
import { readPath, recordsOf, type ReferenceMapping } from "./mapping";
import { normalizeReferenceRecords, type RecordContext } from "./normalize";
import type { ReferenceProvider } from "./providers";
import type { ReferenceFilament } from "./types";

/** The part of `Response` the fetch layer uses, so tests and other runtimes can supply their own. */
export interface ReferenceResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

/** Injected IO: the network, the clock, and sleeping. Nothing here touches globals. */
export interface ReferenceIO {
  fetch(
    url: string,
    init: { signal?: AbortSignal; headers: Record<string, string> },
  ): Promise<ReferenceResponse>;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  now(): number;
}

export type Pagination =
  | { kind: "none" }
  /** The response holds the URL of the next page at `path`; an empty or missing value ends it. */
  | { kind: "next-link"; path: string }
  /** Pages by record offset: `offsetParam` and `limitParam` are set on the URL. */
  | { kind: "offset"; offsetParam: string; limitParam: string; pageSize: number }
  /** Pages by number, starting at `firstPage`. */
  | { kind: "page"; pageParam: string; firstPage: number; limitParam?: string; pageSize?: number };

export interface ReferenceFetchConfig {
  /**
   * An `https:` URL. `{offset}`, `{page}` and `{limit}` in it are replaced for each request; with
   * `offset` or `page` pagination the named query parameters are also set.
   */
  urlTemplate: string;
  mapping: ReferenceMapping;
  pagination: Pagination;
  /** Pause between two requests, so a public service is not hammered. */
  minIntervalMs: number;
  maxRetries: number;
  maxPages: number;
  attribution: string;
  license: string | null;
}

export const FETCH_LIMITS = {
  minIntervalMs: { min: 0, max: 10_000, default: 500 },
  maxRetries: { min: 0, max: 6, default: 3 },
  maxPages: { min: 1, max: 500, default: 100 },
  pageSize: { min: 1, max: 5_000 },
  backoffBaseMs: 1_000,
  backoffCapMs: 30_000,
  retryAfterCapMs: 60_000,
  maxBytes: 50_000_000,
} as const;

export type FetchErrorKind =
  | "invalid-url"
  | "aborted"
  | "cors-or-network"
  | "http"
  | "not-json"
  | "no-records"
  | "too-large"
  | "bad-next-link";

export class ReferenceFetchError extends Error {
  constructor(
    readonly kind: FetchErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ReferenceFetchError";
  }
}

/** What to tell a person when the browser blocks or loses a request with no status to show. */
export const CORS_HELP =
  "The browser could not read the response. Either the address is wrong or offline, or the service does not allow requests from this site (CORS). SpoolSync fetches only in your browser and never through a server, so a service that blocks other sites cannot be used directly: download its data and load the file instead.";

const PLACEHOLDER = /\{(offset|page|limit)\}/g;

export type UrlCheck = { ok: true; url: URL } | { ok: false; error: string };

/** Validates an endpoint: `https:` only, no embedded credentials, a real host. */
export function checkEndpointUrl(template: string): UrlCheck {
  const trimmed = template.trim();
  if (!trimmed) return { ok: false, error: "Enter the address to fetch from." };
  if (trimmed.length > 2000) return { ok: false, error: "That address is too long." };
  let url: URL;
  try {
    url = new URL(trimmed.replace(PLACEHOLDER, "0"));
  } catch {
    return { ok: false, error: "That is not a valid address." };
  }
  if (url.protocol !== "https:")
    return {
      ok: false,
      error: "Only https:// addresses are allowed, so data cannot be read or changed on the way.",
    };
  if (url.username || url.password)
    return {
      ok: false,
      error: "Remove the user name and password from the address; credentials are never stored.",
    };
  if (!url.hostname || !url.hostname.includes("."))
    return { ok: false, error: "The address needs a full host name, such as example.org." };
  return { ok: true, url };
}

function requestUrl(
  config: ReferenceFetchConfig,
  offset: number,
  page: number,
  limit: number,
): string {
  const filled = config.urlTemplate
    .trim()
    .replace(PLACEHOLDER, (_, name: string) =>
      String(name === "offset" ? offset : name === "page" ? page : limit),
    );
  const url = new URL(filled);
  const paging = config.pagination;
  if (paging.kind === "offset") {
    url.searchParams.set(paging.offsetParam, String(offset));
    url.searchParams.set(paging.limitParam, String(paging.pageSize));
  } else if (paging.kind === "page") {
    url.searchParams.set(paging.pageParam, String(page));
    if (paging.limitParam && paging.pageSize)
      url.searchParams.set(paging.limitParam, String(paging.pageSize));
  }
  return url.toString();
}

const clamp = (value: number, { min, max }: { min: number; max: number }) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

/** Seconds or an HTTP date in `Retry-After`, as milliseconds (capped), or `null`. */
export function retryAfterMs(header: string | null, now: number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, FETCH_LIMITS.retryAfterCapMs) : null;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface FetchProgress {
  pages: number;
  records: number;
}

export interface FetchedCatalog {
  filaments: ReferenceFilament[];
  warnings: string[];
  skipped: number;
  pages: number;
  /** Milliseconds since the epoch, from the injected clock. */
  fetchedAt: number;
  attribution: string;
  license: string | null;
}

export interface FetchOptions {
  signal?: AbortSignal;
  onProgress?: (progress: FetchProgress) => void;
}

/**
 * Downloads a reference catalog through injected IO. It pages as configured, pauses between
 * requests, retries rate limits and server errors with exponential backoff (honoring
 * `Retry-After`), stops when the signal aborts, follows next links only within the configured
 * origin, and never sends credentials or custom headers (only `Accept`), so the request stays a
 * simple one that needs no CORS preflight.
 */
export async function fetchReferenceCatalog(
  provider: Pick<ReferenceProvider, "info" | "prepareRecord" | "prepareDocument">,
  config: ReferenceFetchConfig,
  io: ReferenceIO,
  options: FetchOptions = {},
): Promise<FetchedCatalog> {
  const check = checkEndpointUrl(config.urlTemplate);
  if (!check.ok) throw new ReferenceFetchError("invalid-url", check.error);
  const origin = check.url.origin;
  const minInterval = clamp(config.minIntervalMs, FETCH_LIMITS.minIntervalMs);
  const maxRetries = clamp(config.maxRetries, FETCH_LIMITS.maxRetries);
  const maxPages = clamp(config.maxPages, FETCH_LIMITS.maxPages);
  const { signal } = options;
  const paging = config.pagination;
  const pageSize =
    paging.kind === "offset" || (paging.kind === "page" && paging.pageSize)
      ? clamp((paging as { pageSize: number }).pageSize, FETCH_LIMITS.pageSize)
      : 0;

  const abortIfNeeded = () => {
    if (signal?.aborted) throw new ReferenceFetchError("aborted", "The fetch was cancelled.");
  };

  let lastRequestAt = Number.NEGATIVE_INFINITY;
  async function request(url: string): Promise<unknown> {
    let attempt = 0;
    for (;;) {
      abortIfNeeded();
      const wait = lastRequestAt + minInterval - io.now();
      if (wait > 0) await io.sleep(wait, signal);
      abortIfNeeded();
      lastRequestAt = io.now();
      let response: ReferenceResponse | undefined;
      let failure: ReferenceFetchError | undefined;
      try {
        response = await io.fetch(url, {
          headers: { Accept: "application/json" },
          ...(signal ? { signal } : {}),
        });
      } catch (error) {
        if (signal?.aborted || (error as { name?: string })?.name === "AbortError")
          throw new ReferenceFetchError("aborted", "The fetch was cancelled.");
        // A browser reports a blocked (CORS) request and a lost connection the same way, with no status.
        failure = new ReferenceFetchError("cors-or-network", CORS_HELP);
      }
      if (response) {
        if (response.ok) {
          const length = Number(response.headers.get("content-length"));
          if (Number.isFinite(length) && length > FETCH_LIMITS.maxBytes)
            throw new ReferenceFetchError("too-large", "The response is larger than 50 MB.");
          try {
            return await response.json();
          } catch {
            if (signal?.aborted)
              throw new ReferenceFetchError("aborted", "The fetch was cancelled.");
            throw new ReferenceFetchError(
              "not-json",
              "The service answered with something that is not JSON.",
              response.status,
            );
          }
        }
        failure = new ReferenceFetchError(
          "http",
          `The service answered ${response.status}.${response.status === 429 ? " It is limiting requests; try again later." : ""}`,
          response.status,
        );
        if (!RETRYABLE.has(response.status)) throw failure;
      }
      // Lost connections are retried once: a CORS block would never succeed, and waiting does not help.
      const limit = failure!.kind === "cors-or-network" ? Math.min(1, maxRetries) : maxRetries;
      if (attempt >= limit) throw failure!;
      const delay =
        (response && retryAfterMs(response.headers.get("retry-after"), io.now())) ??
        Math.min(FETCH_LIMITS.backoffBaseMs * 2 ** attempt, FETCH_LIMITS.backoffCapMs);
      attempt += 1;
      await io.sleep(delay, signal);
    }
  }

  const context: RecordContext = {
    providerId: provider.info.id,
    providerLabel: provider.info.label,
    attribution: config.attribution || provider.info.attribution,
    license: config.license ?? provider.info.license,
  };
  const filaments: ReferenceFilament[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  let pages = 0;
  let received = 0;
  const visited = new Set<string>();
  const seenIds = new Set<string>();
  let url: string | null = requestUrl(
    config,
    0,
    paging.kind === "page" ? paging.firstPage : 1,
    pageSize,
  );
  let offset = 0;
  let page = paging.kind === "page" ? paging.firstPage : 1;

  while (url && pages < maxPages) {
    if (visited.has(url)) break;
    visited.add(url);
    const fetched = await request(url);
    const document = provider.prepareDocument ? provider.prepareDocument(fetched) : fetched;
    pages += 1;
    const records = recordsOf(document, config.mapping);
    if (!records) {
      if (pages === 1)
        throw new ReferenceFetchError(
          "no-records",
          `The response has no list of records${config.mapping.records && config.mapping.records !== "auto" ? ` at "${config.mapping.records}"` : ""}. Check the records path in the mapping.`,
        );
      break;
    }
    received += records.length;
    if (received > MAX_REFERENCE_RECORDS)
      throw new ReferenceFetchError(
        "too-large",
        `The service returned more than ${MAX_REFERENCE_RECORDS.toLocaleString("en-US")} records.`,
      );
    const prepared = provider.prepareRecord
      ? records.map((record) => provider.prepareRecord!(record))
      : records;
    const batch = normalizeReferenceRecords(
      prepared,
      config.mapping,
      context,
      received - records.length + 1,
    );
    skipped += batch.skipped;
    warnings.push(...batch.warnings);
    // A page that repeats earlier records (a service that ignores the offset) must not loop.
    let fresh = 0;
    for (const filament of batch.filaments) {
      if (seenIds.has(filament.id)) continue;
      seenIds.add(filament.id);
      filaments.push(filament);
      fresh += 1;
    }
    options.onProgress?.({ pages, records: filaments.length });
    if (!records.length || (fresh === 0 && batch.filaments.length > 0)) break;

    if (paging.kind === "next-link") {
      const next = readPath(document, paging.path);
      if (typeof next !== "string" || !next.trim()) {
        url = null;
      } else {
        let resolved: URL;
        try {
          resolved = new URL(next.trim(), url);
        } catch {
          throw new ReferenceFetchError(
            "bad-next-link",
            "The next-page link in the response is not a valid address.",
          );
        }
        if (resolved.origin !== origin)
          throw new ReferenceFetchError(
            "bad-next-link",
            `The next-page link points to ${resolved.origin}, which is not ${origin}. It was not followed.`,
          );
        url = resolved.toString();
      }
    } else if (paging.kind === "offset") {
      if (records.length < pageSize) url = null;
      else {
        offset += records.length;
        url = requestUrl(config, offset, page, pageSize);
      }
    } else if (paging.kind === "page") {
      if (pageSize && records.length < pageSize) url = null;
      else {
        page += 1;
        url = requestUrl(config, offset, page, pageSize);
      }
    } else url = null;
  }
  if (url && pages >= maxPages)
    warnings.push(`Stopped after ${maxPages} pages; the catalog may be incomplete.`);
  if (!filaments.length)
    throw new ReferenceFetchError(
      "no-records",
      "The service returned records, but none could be read as a filament. Check the field mapping.",
    );
  return {
    filaments,
    warnings,
    skipped,
    pages,
    fetchedAt: io.now(),
    attribution: context.attribution,
    license: context.license,
  };
}
