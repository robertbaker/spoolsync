import { describe, expect, test } from "bun:test";

import {
  DEFAULT_TTL_HOURS,
  cacheKey,
  isFresh,
  sanitizeFilament,
  sanitizeFilaments,
  sanitizeReferenceCacheMeta,
  ttlMs,
} from "./cache";
import {
  ReferenceFetchError,
  checkEndpointUrl,
  fetchReferenceCatalog,
  retryAfterMs,
  type ReferenceFetchConfig,
  type ReferenceIO,
  type ReferenceResponse,
} from "./fetch";
import { GENERIC_MAPPING } from "./mapping";
import { PROVIDERS, providerById } from "./providers";
import {
  DEFAULT_PROVIDER_SETTINGS,
  buildFetchConfig,
  sanitizeAcceptedReferences,
  sanitizePagination,
  sanitizeReferenceChoices,
  sanitizeReferencePolicy,
  sanitizeReferenceSettings,
} from "./settings";
import type { ReferenceFilament } from "./types";

// A provider without a document step, so these tests exercise the generic fetch layer.
const provider = { info: providerById("openfilamentdatabase")!.info };

const record = (n: number) => ({
  brand: "Acme",
  material: "PLA",
  color_name: `Color ${n}`,
  hex: "FF0000",
});

function response(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): ReferenceResponse {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => init.headers?.[name.toLowerCase()] ?? null },
    json: async () => {
      if (body === undefined) throw new SyntaxError("bad json");
      return body;
    },
  };
}

type Step = ReferenceResponse | Error | ((url: string) => ReferenceResponse | Error);

function fakeIO(steps: Step[]) {
  const urls: string[] = [];
  const sleeps: number[] = [];
  let clock = 1_000_000;
  const io: ReferenceIO = {
    now: () => clock,
    async sleep(ms, signal) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      sleeps.push(ms);
      clock += ms;
    },
    async fetch(url) {
      urls.push(url);
      const step = steps.shift();
      if (!step) throw new Error(`unexpected request ${url}`);
      const result = typeof step === "function" ? step(url) : step;
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { io, urls, sleeps };
}

const config = (overrides: Partial<ReferenceFetchConfig> = {}): ReferenceFetchConfig => ({
  urlTemplate: "https://data.example.org/api/filaments",
  mapping: GENERIC_MAPPING,
  pagination: { kind: "none" },
  minIntervalMs: 0,
  maxRetries: 3,
  maxPages: 50,
  attribution: "Example Data",
  license: "CC-BY",
  ...overrides,
});

describe("endpoint validation", () => {
  test("accepts https and rejects the rest", () => {
    expect(checkEndpointUrl("https://data.example.org/api?page={page}").ok).toBe(true);
    for (const bad of [
      "",
      "http://data.example.org/api",
      "ftp://data.example.org",
      "javascript:alert(1)",
      "https://user:pass@data.example.org/api",
      "https://localhost/api",
      "not a url",
    ])
      expect(checkEndpointUrl(bad).ok).toBe(false);
  });
});

describe("fetching a catalog", () => {
  test("reads one page, keeps the attribution, and sends only an Accept header", async () => {
    const seen: Array<Record<string, string>> = [];
    const { io, urls } = fakeIO([response({ items: [record(1), record(2)] })]);
    const original = io.fetch;
    io.fetch = (url, init) => {
      seen.push(init.headers);
      return original(url, init);
    };
    const result = await fetchReferenceCatalog(provider, config(), io);
    expect(result.filaments.map((f) => f.colorName)).toEqual(["Color 1", "Color 2"]);
    expect(result.filaments[0]).toMatchObject({
      providerId: "openfilamentdatabase",
      attribution: "Example Data",
      license: "CC-BY",
    });
    expect(urls).toEqual(["https://data.example.org/api/filaments"]);
    expect(seen).toEqual([{ Accept: "application/json" }]);
    expect(result).toMatchObject({ pages: 1, skipped: 0, fetchedAt: 1_000_000 });
  });

  test("follows a next link within the same origin and stops when it is empty", async () => {
    const { io, urls } = fakeIO([
      response({ items: [record(1)], next: "/api/filaments?page=2" }),
      response({ items: [record(2)], next: null }),
    ]);
    const result = await fetchReferenceCatalog(
      provider,
      config({ pagination: { kind: "next-link", path: "next" } }),
      io,
    );
    expect(result.filaments).toHaveLength(2);
    expect(urls[1]).toBe("https://data.example.org/api/filaments?page=2");
  });

  test("refuses a next link to another host and a link loop", async () => {
    const other = fakeIO([response({ items: [record(1)], next: "https://evil.example.net/x" })]);
    expect(
      fetchReferenceCatalog(
        provider,
        config({ pagination: { kind: "next-link", path: "next" } }),
        other.io,
      ),
    ).rejects.toMatchObject({ kind: "bad-next-link" });

    const loop = fakeIO([
      response({ items: [record(1)], next: "https://data.example.org/api/filaments" }),
    ]);
    const result = await fetchReferenceCatalog(
      provider,
      config({ pagination: { kind: "next-link", path: "next" } }),
      loop.io,
    );
    expect(result.filaments).toHaveLength(1);
    expect(loop.urls).toHaveLength(1);
  });

  test("pages by offset until a short page", async () => {
    const { io, urls } = fakeIO([
      response({ items: [record(1), record(2)] }),
      response({ items: [record(3), record(4)] }),
      response({ items: [record(5)] }),
    ]);
    const result = await fetchReferenceCatalog(
      provider,
      config({
        pagination: { kind: "offset", offsetParam: "offset", limitParam: "limit", pageSize: 2 },
      }),
      io,
    );
    expect(result.filaments).toHaveLength(5);
    expect(urls.map((url) => new URL(url).searchParams.get("offset"))).toEqual(["0", "2", "4"]);
    expect(new URL(urls[0]!).searchParams.get("limit")).toBe("2");
  });

  test("pages by number and fills template placeholders", async () => {
    const { io, urls } = fakeIO([
      response({ items: [record(1), record(2)] }),
      response({ items: [] }),
    ]);
    expect(
      await fetchReferenceCatalog(
        provider,
        config({
          urlTemplate: "https://data.example.org/api/{page}/filaments?size={limit}",
          pagination: {
            kind: "page",
            pageParam: "p",
            firstPage: 1,
            limitParam: "size",
            pageSize: 2,
          },
        }),
        io,
      ),
    ).toMatchObject({ pages: 2 });
    expect(urls[0]).toContain("/api/1/filaments");
    expect(new URL(urls[1]!).searchParams.get("p")).toBe("2");
  });

  test("stops when a service ignores paging and repeats the same page", async () => {
    const page = { items: [record(1), record(2)] };
    const { io, urls } = fakeIO([response(page), response(page), response(page)]);
    const result = await fetchReferenceCatalog(
      provider,
      config({
        pagination: { kind: "offset", offsetParam: "offset", limitParam: "limit", pageSize: 2 },
      }),
      io,
    );
    expect(result.filaments).toHaveLength(2);
    expect(urls).toHaveLength(2);
  });

  test("stops at the page cap and says so", async () => {
    const pages = Array.from({ length: 5 }, (_, i) =>
      response({ items: [record(i)], next: `?page=${i + 2}` }),
    );
    const { io } = fakeIO(pages);
    const result = await fetchReferenceCatalog(
      provider,
      config({ maxPages: 2, pagination: { kind: "next-link", path: "next" } }),
      io,
    );
    expect(result.pages).toBe(2);
    expect(result.warnings.join(" ")).toContain("Stopped after 2 pages");
  });

  test("waits between requests", async () => {
    const { io, sleeps } = fakeIO([
      response({ items: [record(1)], next: "?page=2" }),
      response({ items: [record(2)] }),
    ]);
    await fetchReferenceCatalog(
      provider,
      config({ minIntervalMs: 700, pagination: { kind: "next-link", path: "next" } }),
      io,
    );
    expect(sleeps).toEqual([700]);
  });
});

describe("failures", () => {
  test("retries rate limits with Retry-After and then backs off exponentially", async () => {
    const { io, sleeps } = fakeIO([
      response({}, { status: 429, headers: { "retry-after": "7" } }),
      response({}, { status: 503 }),
      response({}, { status: 503 }),
      response({ items: [record(1)] }),
    ]);
    const result = await fetchReferenceCatalog(provider, config(), io);
    expect(result.filaments).toHaveLength(1);
    expect(sleeps).toEqual([7000, 2000, 4000]);
  });

  test("gives up after the retry limit", () => {
    const { io } = fakeIO(Array.from({ length: 5 }, () => response({}, { status: 500 })));
    expect(fetchReferenceCatalog(provider, config({ maxRetries: 2 }), io)).rejects.toMatchObject({
      kind: "http",
      status: 500,
    });
  });

  test("does not retry a client error", () => {
    const { io, urls } = fakeIO([response({}, { status: 404 })]);
    expect(fetchReferenceCatalog(provider, config(), io)).rejects.toMatchObject({
      kind: "http",
      status: 404,
    });
    expect(urls).toHaveLength(1);
  });

  test("a blocked or lost request explains CORS and is retried once", async () => {
    const { io, urls } = fakeIO([
      new TypeError("Failed to fetch"),
      new TypeError("Failed to fetch"),
    ]);
    const error = await fetchReferenceCatalog(provider, config(), io).catch((caught) => caught);
    expect(error).toBeInstanceOf(ReferenceFetchError);
    expect(error.kind).toBe("cors-or-network");
    expect(error.message).toContain("CORS");
    expect(error.message).toContain("load the file");
    expect(urls).toHaveLength(2);
  });

  test("rejects non-JSON, missing record lists, and unreadable records", () => {
    expect(
      fetchReferenceCatalog(provider, config(), fakeIO([response(undefined)]).io),
    ).rejects.toMatchObject({
      kind: "not-json",
    });
    expect(
      fetchReferenceCatalog(provider, config(), fakeIO([response({ message: "hi" })]).io),
    ).rejects.toMatchObject({ kind: "no-records" });
    expect(
      fetchReferenceCatalog(provider, config(), fakeIO([response([{ nothing: "useful" }])]).io),
    ).rejects.toMatchObject({ kind: "no-records" });
    expect(
      fetchReferenceCatalog(
        provider,
        config({ mapping: { ...GENERIC_MAPPING, records: "data.rows" } }),
        fakeIO([response({ data: {} })]).io,
      ),
    ).rejects.toThrow('at "data.rows"');
  });

  test("rejects an invalid endpoint before any request", () => {
    const { io, urls } = fakeIO([]);
    expect(
      fetchReferenceCatalog(provider, config({ urlTemplate: "http://data.example.org" }), io),
    ).rejects.toMatchObject({ kind: "invalid-url" });
    expect(urls).toEqual([]);
  });

  test("cancelling stops before, during, and between requests", () => {
    const before = new AbortController();
    before.abort();
    expect(
      fetchReferenceCatalog(provider, config(), fakeIO([response({ items: [record(1)] })]).io, {
        signal: before.signal,
      }),
    ).rejects.toMatchObject({ kind: "aborted" });

    const during = new AbortController();
    const fake = fakeIO([]);
    fake.io.fetch = async () => {
      during.abort();
      throw new DOMException("aborted", "AbortError");
    };
    expect(
      fetchReferenceCatalog(provider, config(), fake.io, { signal: during.signal }),
    ).rejects.toMatchObject({ kind: "aborted" });

    const between = new AbortController();
    const paged = fakeIO([
      response({ items: [record(1)], next: "?page=2" }),
      response({ items: [record(2)] }),
    ]);
    expect(
      fetchReferenceCatalog(
        provider,
        config({ pagination: { kind: "next-link", path: "next" } }),
        paged.io,
        {
          signal: between.signal,
          onProgress: () => between.abort(),
        },
      ),
    ).rejects.toMatchObject({ kind: "aborted" });
    expect(paged.urls).toHaveLength(1);
  });

  test("Retry-After accepts seconds and dates and caps long waits", () => {
    expect(retryAfterMs("5", 0)).toBe(5000);
    expect(retryAfterMs("9999", 0)).toBe(60_000);
    expect(retryAfterMs(new Date(10_000).toUTCString(), 4000)).toBe(6000);
    expect(retryAfterMs("soon", 0)).toBeNull();
    expect(retryAfterMs(null, 0)).toBeNull();
  });
});

describe("providers", () => {
  test("the two named services are ready with a verified endpoint and mapping", () => {
    for (const id of ["openfilamentdatabase", "filamentcolors"]) {
      const found = providerById(id)!;
      expect(found.info.status).toBe("ready");
      expect(found.info.kind).toBe("remote");
      expect(found.info.remaining).toEqual([]);
      expect(found.presets).toHaveLength(1);
      expect(found.defaults!.urlTemplate.startsWith("https://")).toBe(true);
    }
    expect(providerById("file")!.info.status).toBe("ready");
    expect(PROVIDERS.map((p) => p.info.id)).toEqual([
      "file",
      "openfilamentdatabase",
      "filamentcolors",
      "openprinttag",
    ]);
  });

  test("OpenPrintTag is snapshot-only: a built-in mapping, and no preset to fetch", () => {
    const found = providerById("openprinttag")!;
    expect(found.snapshotOnly).toBe(true);
    expect(found.info.kind).toBe("remote");
    expect(found.defaults!.mapping.fields.barcode).toEqual(["gtin"]);
    expect(providerById("filamentcolors")!.snapshotOnly).toBeUndefined();
  });
});

describe("settings", () => {
  test("builds a fetch config only from valid settings", () => {
    expect(buildFetchConfig("file", undefined)).toMatchObject({ ok: false });
    const builtIn = buildFetchConfig("filamentcolors", undefined);
    expect(builtIn.ok && builtIn.config.urlTemplate).toContain("filamentcolors.xyz/api/swatch/");
    expect(builtIn.ok && builtIn.config.pagination).toEqual({ kind: "next-link", path: "next" });
    const ok = buildFetchConfig("filamentcolors", {
      ...DEFAULT_PROVIDER_SETTINGS,
      urlTemplate: " https://data.example.org/api ",
      mapping: { fields: { vendor: "maker.name" } },
    });
    expect(ok.ok && ok.config.mapping.fields.vendor).toEqual(["maker.name"]);
    expect(ok.ok && ok.config.attribution).toBe("FilamentColors (filamentcolors.xyz)");
    const bad = buildFetchConfig("filamentcolors", {
      ...DEFAULT_PROVIDER_SETTINGS,
      urlTemplate: "http://x.example.org",
      mapping: { fields: { vendor: "" } },
    });
    expect(!bad.ok && bad.errors).toHaveLength(2);
  });

  test("sanitizes damaged settings field by field", () => {
    expect(sanitizeReferenceSettings(null).providerId).toBe("file");
    const settings = sanitizeReferenceSettings({
      providerId: "nope",
      policy: { fields: ["density", "bogus"], overwrite: ["density", "price"] },
      providers: {
        filamentcolors: {
          urlTemplate: "https://x.example.org/a",
          ttlHours: 9999,
          minIntervalMs: -5,
          pagination: { kind: "offset" },
        },
        file: { urlTemplate: "https://ignored.example.org" },
      },
    });
    expect(settings.providerId).toBe("file");
    expect(settings.policy).toEqual({ fields: ["density"], overwrite: ["density"] });
    expect(settings.providers.filamentcolors).toMatchObject({
      urlTemplate: "https://x.example.org/a",
      ttlHours: 720,
      minIntervalMs: 0,
      pagination: { kind: "none" },
    });
    expect(settings.providers).not.toHaveProperty("file");
  });

  test("pagination settings are validated", () => {
    expect(sanitizePagination({ kind: "next-link", path: "links.next" })).toEqual({
      kind: "next-link",
      path: "links.next",
    });
    expect(sanitizePagination({ kind: "next-link", path: "a;b" })).toEqual({ kind: "none" });
    expect(
      sanitizePagination({ kind: "offset", offsetParam: "o", limitParam: "l", pageSize: 99999 }),
    ).toEqual({
      kind: "offset",
      offsetParam: "o",
      limitParam: "l",
      pageSize: 5000,
    });
    expect(sanitizePagination({ kind: "page", pageParam: "page", firstPage: 7 })).toEqual({
      kind: "none",
    });
  });

  test("policy falls back to the defaults", () => {
    expect(sanitizeReferencePolicy(5).overwrite).toEqual([]);
    expect(sanitizeReferencePolicy({ fields: "x" }).fields).toContain("density");
  });

  test("accepted entries and choices drop anything malformed", () => {
    const good = {
      spoolKey: "spoolman:1",
      field: "density" as const,
      before: null,
      after: 1.24,
      providerId: "file",
      referenceId: "r1",
    };
    const accepted = sanitizeAcceptedReferences([
      good,
      { ...good },
      { ...good, field: "remainingWeight" },
      { ...good, after: { nested: 1 } },
      { ...good, referenceId: "" },
      "junk",
    ]);
    expect(accepted).toEqual([good]);
    expect(sanitizeAcceptedReferences("nope")).toEqual([]);
    expect([...sanitizeReferenceChoices({ "spoolman:1": "r1", "": "x", "spoolman:2": 5 })]).toEqual(
      [["spoolman:1", "r1"]],
    );
  });
});

describe("cache", () => {
  const filament = (id: string): ReferenceFilament => ({
    id,
    providerId: "filamentcolors",
    providerLabel: "FilamentColors",
    vendor: "Acme",
    name: null,
    material: "PLA",
    colorName: "Red",
    colorHex: "FF0000",
    colorHexes: ["FF0000"],
    diameter: 1.75,
    density: null,
    nozzleTempMin: null,
    nozzleTempMax: null,
    bedTempMin: null,
    bedTempMax: null,
    initialWeight: null,
    emptySpoolWeight: null,
    price: null,
    barcode: null,
    url: "https://example.org/x",
    attribution: "Example",
    license: null,
  });

  test("freshness follows the TTL and a clock that went backwards is stale", () => {
    const entry = { fetchedAt: 1000, ttlMs: ttlMs(1) };
    expect(isFresh(entry, 1000 + 3_599_999)).toBe(true);
    expect(isFresh(entry, 1000 + 3_600_000)).toBe(false);
    expect(isFresh(entry, 500)).toBe(false);
    expect(isFresh({ fetchedAt: 0, ttlMs: ttlMs(0) }, 0)).toBe(false);
    expect(ttlMs(DEFAULT_TTL_HOURS)).toBe(86_400_000);
    expect(ttlMs(Number.NaN)).toBe(86_400_000);
  });

  test("the key changes with the endpoint, mapping, or paging", () => {
    const base = {
      urlTemplate: "https://a.example.org/x",
      mapping: {},
      pagination: { kind: "none" },
    };
    expect(cacheKey(base)).toBe(cacheKey({ ...base }));
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, urlTemplate: "https://b.example.org/x" }));
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, mapping: { records: "data" } }));
  });

  test("stored descriptions and records are re-validated", () => {
    const meta = sanitizeReferenceCacheMeta({
      filamentcolors: {
        key: "abc",
        fetchedAt: 5,
        ttlMs: 10,
        attribution: "Example",
        license: null,
        sourceToken: "t1",
        via: "snapshot",
        count: 3,
      },
      noCount: { key: "x", fetchedAt: 1, ttlMs: 1 },
      broken: { key: "x" },
    });
    expect(Object.keys(meta)).toEqual(["filamentcolors"]);
    expect(meta["filamentcolors"]).toMatchObject({ sourceToken: "t1", via: "snapshot", count: 3 });
    expect(sanitizeReferenceCacheMeta("nope")).toEqual({});

    const records = sanitizeFilaments([
      filament("a"),
      { id: "bad" },
      { ...filament("c"), colorHex: "zz", colorHexes: [], url: "http://insecure.example.org" },
    ]);
    expect(records!.map((f) => f.id)).toEqual(["a", "c"]);
    expect(records![1]).toMatchObject({ colorHex: null, url: null });
    expect(sanitizeFilaments([{ id: "bad" }])).toBeNull();
    expect(sanitizeFilaments("nope")).toBeNull();
    expect(sanitizeFilament({ id: "x", providerId: "p" })).toBeNull();
  });
});
