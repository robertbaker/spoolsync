import { REFERENCE_PRESETS, type ReferencePreset } from "./mapping";

export type ReferenceProviderId = "file" | "openfilamentdatabase" | "filamentcolors";

/**
 * - `ready`: works with real data today.
 * - `needs-endpoint-config`: the fetch layer is complete, but the provider's real endpoint and
 *   response schema have not been verified, so none is built in. The person supplies a base URL and
 *   a path mapping in settings; once a verified `ReferencePreset` is added, the provider is ready.
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

/** An integration: its facts, plus the presets verified to describe its records. */
export interface ReferenceProvider {
  info: ReferenceProviderInfo;
  /** Mappings known to fit this provider's records. Empty until a schema has been verified. */
  presets: readonly ReferencePreset[];
  /** Adjusts one raw record before it is mapped, such as flattening a nested object. */
  prepareRecord?(record: unknown): unknown;
}

const UNVERIFIED =
  "The service's host could not be reached while this was built, so its real endpoints and response schema are unverified; none is built in and nothing is mocked.";

const REMOTE_REMAINING: readonly string[] = [
  UNVERIFIED,
  "Add a verified ReferencePreset (records path and field paths) for it in core/reference/mapping.ts and set its status to ready; the fetch, paging, caching and matching code needs no change.",
  "Confirm the service answers browser requests from other sites (CORS). Fetching happens in the browser only; if it does not, download an export and load it as a reference file instead.",
  "Confirm the license of the data and its attribution wording, and record it in `license`.",
];

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
      license: null,
      status: "needs-endpoint-config",
      remaining: REMOTE_REMAINING,
    },
    presets: REFERENCE_PRESETS.filter((preset) => preset.providerId === "openfilamentdatabase"),
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
      status: "needs-endpoint-config",
      remaining: [
        ...REMOTE_REMAINING,
        "Map only what its API actually returns; fields it does not carry (temperatures, weights) stay empty and are never filled by guesswork.",
      ],
    },
    presets: REFERENCE_PRESETS.filter((preset) => preset.providerId === "filamentcolors"),
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
