import type { Pagination } from "./fetch";
import {
  FILAMENTCOLORS_MAPPING,
  OFD_MAPPING,
  REFERENCE_PRESETS,
  type ReferenceMapping,
  type ReferencePreset,
} from "./mapping";
import { flattenOpenFilamentDatabase, OFD_BULK_URL } from "./ofd";

export type ReferenceProviderId = "file" | "openfilamentdatabase" | "filamentcolors";

/**
 * - `ready`: works with real data today; a remote provider ships a verified endpoint and mapping.
 * - `needs-endpoint-config`: no verified endpoint or mapping is built in; the person supplies them.
 */
export type ProviderStatus = "ready" | "needs-endpoint-config";

export interface ReferenceProviderInfo {
  id: ReferenceProviderId;
  label: string;
  /** Where the provider kind gets its data. */
  kind: "file" | "remote";
  homepage: string | null;
  docsUrl: string | null;
  /** Credit line shown next to data from this provider and kept with every record. */
  attribution: string;
  /** The license of the data, or `null` when it has not been confirmed (shown as such). */
  license: string | null;
  status: ProviderStatus;
  /** What is still missing before the provider is ready, and why. Empty when ready. */
  remaining: readonly string[];
}

/** What a remote provider ships with: the address, paging and mapping verified against the live API. */
export interface ReferenceProviderDefaults {
  urlTemplate: string;
  pagination: Pagination;
  mapping: ReferenceMapping;
  maxPages: number;
  /** Pause between requests, for a service that is paged. */
  minIntervalMs: number;
  /**
   * A small request that tells whether the catalog changed, so a copy held earlier (a build-time
   * snapshot or the browser's cache) can be kept without downloading the catalog again.
   */
  freshness: ReferenceFreshness;
}

export interface ReferenceFreshness {
  /** An `https:` address answering a few hundred bytes of JSON. */
  url: string;
  /** A short token that changes when the catalog does, or `null` when the response is unusable. */
  token(document: unknown): string | null;
}

/** An integration: its facts, plus the presets verified to describe its records. */
export interface ReferenceProvider {
  info: ReferenceProviderInfo;
  /** Mappings known to fit this provider's records. Empty until a schema has been verified. */
  presets: readonly ReferencePreset[];
  /** Built-in endpoint settings; remote providers that are `ready` have them. */
  defaults?: ReferenceProviderDefaults;
  /** Adjusts one raw record before it is mapped, such as flattening a nested object. */
  prepareRecord?(record: unknown): unknown;
  /** Turns a whole response into a list of records, for a service that returns joined tables. */
  prepareDocument?(document: unknown): unknown;
}

export const PROVIDERS: readonly ReferenceProvider[] = [
  {
    info: {
      id: "file",
      label: "Reference file",
      kind: "file",
      homepage: null,
      docsUrl: null,
      attribution: "Reference file loaded by you",
      license: null,
      status: "ready",
      remaining: [],
    },
    presets: REFERENCE_PRESETS.filter((preset) => preset.providerId === "file"),
  },
  {
    info: {
      id: "openfilamentdatabase",
      label: "Open Filament Database",
      kind: "remote",
      homepage: "https://openfilamentdatabase.org",
      docsUrl: "https://openfilamentdatabase.org/docs",
      attribution: "Open Filament Database (openfilamentdatabase.org)",
      license: "MIT; the data is free to use and redistribute, attribution appreciated",
      status: "ready",
      remaining: [],
    },
    presets: REFERENCE_PRESETS.filter((preset) => preset.providerId === "openfilamentdatabase"),
    defaults: {
      urlTemplate: OFD_BULK_URL,
      pagination: { kind: "none" },
      mapping: OFD_MAPPING,
      maxPages: 1,
      minIntervalMs: 0,
      freshness: {
        // The index lists the dataset's version and the time it was rebuilt (daily).
        url: "https://api.openfilamentdatabase.org/api/v1/index.json",
        token: (document) => {
          const generated = (document as { generated_at?: unknown } | null)?.generated_at;
          return typeof generated === "string" && generated ? generated.slice(0, 64) : null;
        },
      },
    },
    prepareDocument: flattenOpenFilamentDatabase,
  },
  {
    info: {
      id: "filamentcolors",
      label: "FilamentColors",
      kind: "remote",
      homepage: "https://filamentcolors.xyz",
      docsUrl: "https://filamentcolors.xyz/api/",
      attribution: "FilamentColors (filamentcolors.xyz)",
      license: null,
      status: "ready",
      remaining: [],
    },
    presets: REFERENCE_PRESETS.filter((preset) => preset.providerId === "filamentcolors"),
    // A swatch's own page is /swatch/<id>/; the API lists no address for it.
    prepareRecord: (record) => {
      const swatch = record as { id?: unknown } | null;
      return typeof swatch?.id === "number" || typeof swatch?.id === "string"
        ? {
            ...(record as object),
            source_url: `https://filamentcolors.xyz/swatch/${encodeURIComponent(String(swatch.id))}/`,
          }
        : record;
    },
    defaults: {
      urlTemplate: "https://filamentcolors.xyz/api/swatch/?page_size=100",
      pagination: { kind: "next-link", path: "next" },
      mapping: FILAMENTCOLORS_MAPPING,
      maxPages: 100,
      minIntervalMs: 500,
      freshness: {
        // One swatch is enough: the total, and the first swatch's id and publish date, change when
        // swatches are added or published. An edit to an old swatch is only picked up by a refresh.
        url: "https://filamentcolors.xyz/api/swatch/?page_size=1",
        token: (document) => {
          const page = document as { count?: unknown; results?: unknown } | null;
          if (typeof page?.count !== "number" || !Array.isArray(page.results)) return null;
          const first = (page.results[0] ?? {}) as { id?: unknown; date_published?: unknown };
          return `${page.count}:${String(first.id ?? "")}:${String(first.date_published ?? "")}`.slice(
            0,
            120,
          );
        },
      },
    },
  },
];

export function providerById(id: string): ReferenceProvider | undefined {
  return PROVIDERS.find((provider) => provider.info.id === id);
}

export function isProviderId(id: unknown): id is ReferenceProviderId {
  return typeof id === "string" && PROVIDERS.some((provider) => provider.info.id === id);
}

/** Providers that fetch over the network, as opposed to reading a file. */
export const REMOTE_PROVIDERS: readonly ReferenceProvider[] = PROVIDERS.filter(
  (provider) => provider.info.kind === "remote",
);
