/**
 * The one registry of supported tools. Every list, count, capability table and "who can write"
 * statement in the website, the CLI documentation, the README files and the tests derives from
 * `SERVICES`, so adding a tool means adding one entry here (TypeScript refuses to compile while a
 * `SourceId` has no entry) plus its web presentation in `src/lib/services.ts`.
 *
 * Capability words are from the service's point of view: `file-export` and `api-export` mean
 * SpoolSync can read the service's files or API; `file-import` and `api-import` mean SpoolSync can
 * hand changes back through an import file or the API.
 */
import type { ServiceCapability, SourceId } from "./model";

export type FileFormat = "json" | "csv" | "xlsx" | "ttag" | "zip";
export type ServicePlatform = "self-hosted" | "web" | "mobile" | "desktop" | "cloud";
/** Clients that ship an API integration for the service. */
export type ApiClient = "browser" | "cli";

export interface ServiceInfo {
  /** Short name used in lists and badges. */
  name: string;
  /** Name when the service has a well-known fork or alias worth showing. */
  fullName: string;
  /** Official site or repository, when SpoolSync knows a stable one. */
  vendorUrl?: string;
  platforms: readonly ServicePlatform[];
  capabilities: readonly ServiceCapability[];
  /** Formats SpoolSync can read, in preference order. */
  readFormats: readonly FileFormat[];
  /** Formats SpoolSync can write for the service to import. */
  writeFormats: readonly FileFormat[];
  /** Where the API integration is available (`file-*` capabilities need no client). */
  apiClients: readonly ApiClient[];
  /** What the API is called when it is not a plain API, such as TigerTag's cloud. */
  apiLabel?: string;
  /** A limit on what writing does, shown beside the write summary. */
  writeNote?: string;
  /** Option that loads a file for this service in the CLI. */
  cliFlag: string;
  /** Other spellings the CLI accepts for the file option. */
  cliAliases?: readonly string[];
  /** Option that loads the service over its API in the CLI, when it can. */
  cliApiFlag?: string;
  /** One sentence on what the tool is. */
  tagline: string;
}

export const SERVICES = {
  spoolman: {
    name: "Spoolman",
    fullName: "Spoolman / Spoolman-NG",
    vendorUrl: "https://github.com/Donkie/Spoolman",
    platforms: ["self-hosted"],
    capabilities: ["file-import", "file-export", "api-import", "api-export"],
    readFormats: ["json", "csv"],
    writeFormats: ["json"],
    apiClients: ["browser", "cli"],
    writeNote: "the JSON file is for other tools; Spoolman itself cannot import it",
    cliFlag: "--spoolman",
    cliApiFlag: "--spoolman-url",
    tagline: "Self-hosted spool database with a REST API, used by Klipper setups.",
  },
  spoolstock: {
    name: "Spoolstock",
    fullName: "Spoolstock",
    vendorUrl: "https://www.spoolstock.com",
    platforms: ["mobile", "web"],
    capabilities: ["file-export"],
    readFormats: ["csv"],
    writeFormats: [],
    apiClients: [],
    cliFlag: "--spoolstock",
    tagline: "Filament and print management app for phones and tablets.",
  },
  spoolio: {
    name: "Spoolio",
    fullName: "Spoolio",
    vendorUrl: "https://spoolio.net",
    platforms: ["web", "cloud"],
    capabilities: ["file-import", "file-export"],
    readFormats: ["json"],
    writeFormats: ["json"],
    apiClients: [],
    writeNote: "preserves print logs and settings",
    cliFlag: "--spoolio",
    tagline: "Hosted, installable web app with label scanning.",
  },
  tigertag: {
    name: "TigerTag",
    fullName: "TigerTag",
    vendorUrl: "https://tigertag.io",
    platforms: ["desktop", "cloud"],
    capabilities: ["file-import", "file-export", "api-import", "api-export"],
    readFormats: ["ttag", "json"],
    writeFormats: ["ttag"],
    apiClients: ["browser"],
    apiLabel: "Cloud",
    writeNote: "changed materials only for files",
    cliFlag: "--tigertag",
    tagline: "Open RFID filament format with a Studio app and cloud sync.",
  },
  threeDfp: {
    name: "3DFilamentProfiles",
    fullName: "3DFilamentProfiles",
    vendorUrl: "https://3dfilamentprofiles.com",
    platforms: ["web", "cloud"],
    capabilities: ["file-import", "file-export"],
    readFormats: ["csv", "json"],
    writeFormats: ["csv", "json"],
    apiClients: [],
    cliFlag: "--three-dfp",
    cliAliases: ["--3dfp"],
    tagline: "Filament database with a personal My Spools inventory.",
  },
  bambuddy: {
    name: "Bambuddy",
    fullName: "Bambuddy",
    vendorUrl: "https://github.com/maziggy/bambuddy",
    platforms: ["self-hosted"],
    capabilities: ["file-import", "file-export", "api-import", "api-export"],
    readFormats: ["csv", "json"],
    writeFormats: ["csv"],
    apiClients: ["browser", "cli"],
    writeNote:
      "CSV creates new spools only; the API updates and archives with a key that has the inventory scope",
    cliFlag: "--bambuddy",
    cliApiFlag: "--bambuddy-url",
    tagline: "Self-hosted control panel for Bambu Lab printers with AMS inventory.",
  },
  filameter: {
    name: "FilaMeter",
    fullName: "FilaMeter",
    vendorUrl: "https://filameter.com",
    platforms: ["web", "self-hosted"],
    capabilities: ["file-import", "file-export"],
    readFormats: ["json", "csv"],
    writeFormats: ["json", "csv"],
    apiClients: [],
    cliFlag: "--filameter",
    tagline: "Local-first, open-source inventory that stores data in the browser.",
  },
  filadex: {
    name: "Filadex",
    fullName: "Filadex",
    vendorUrl: "https://github.com/the-luap/filadex",
    platforms: ["self-hosted"],
    capabilities: ["file-import", "file-export", "api-import", "api-export"],
    readFormats: ["json", "csv"],
    writeFormats: ["json", "csv"],
    apiClients: ["cli"],
    cliFlag: "--filadex",
    cliApiFlag: "--filadex-url",
    tagline: "Self-hosted filament collection manager.",
  },
  filamentdb: {
    name: "FilamentDB",
    fullName: "FilamentDB",
    vendorUrl: "https://github.com/Pixelplanet/FilamentDB",
    platforms: ["self-hosted"],
    capabilities: ["file-import", "file-export", "api-import", "api-export"],
    readFormats: ["zip", "json"],
    writeFormats: ["zip", "json"],
    apiClients: ["browser", "cli"],
    cliFlag: "--filamentdb",
    cliApiFlag: "--filamentdb-url",
    tagline: "Self-hosted spool database with a REST API.",
  },
  filamentDbApp: {
    name: "Filament DB",
    fullName: "Filament DB (hyiger/filament-db)",
    vendorUrl: "https://github.com/hyiger/filament-db",
    platforms: ["self-hosted", "desktop"],
    capabilities: ["file-import", "file-export", "api-import", "api-export"],
    readFormats: ["json", "csv"],
    writeFormats: ["json", "csv"],
    apiClients: ["browser", "cli"],
    writeNote: "filament fields are shared by all of a filament's spools",
    cliFlag: "--filament-db",
    cliApiFlag: "--filament-db-url",
    tagline: "MongoDB-backed filament profile and spool manager with NFC tag support.",
  },
  spoolmaster: {
    name: "SpoolMaster",
    fullName: "SpoolMaster",
    vendorUrl: "https://apps.apple.com/us/app/spool-master/id6757678949",
    platforms: ["mobile", "desktop"],
    capabilities: ["file-export"],
    readFormats: ["xlsx"],
    writeFormats: [],
    apiClients: [],
    cliFlag: "--spoolmaster",
    tagline: "Mac and iOS stock tracker that exports an Excel workbook.",
  },
  spoolhoarder: {
    name: "Spool Hoarder",
    fullName: "Spool Hoarder",
    vendorUrl: "https://apps.apple.com/us/app/spool-hoarder/id6760682447",
    platforms: ["mobile", "desktop"],
    capabilities: ["file-export"],
    readFormats: ["csv"],
    writeFormats: [],
    apiClients: [],
    cliFlag: "--spoolhoarder",
    cliAliases: ["--spool-hoarder"],
    tagline: "Mac and iOS filament inventory with HueForge library export.",
  },
  spoolapp: {
    name: "Spool",
    fullName: "Spool (Mac and iOS app)",
    vendorUrl: "https://apps.apple.com/us/app/spool-filament-tracker/id6756892049",
    platforms: ["mobile", "desktop"],
    capabilities: ["file-export"],
    readFormats: ["json"],
    writeFormats: [],
    apiClients: [],
    cliFlag: "--spool",
    tagline: "Mac and iOS app that keeps spools, prints and printers.",
  },
  spoolkeep: {
    name: "SpoolKeep",
    fullName: "SpoolKeep",
    vendorUrl: "https://apps.apple.com/us/app/spoolkeep/id6746877203",
    platforms: ["mobile", "desktop"],
    capabilities: ["file-export"],
    readFormats: ["json"],
    writeFormats: [],
    apiClients: [],
    cliFlag: "--spoolkeep",
    tagline: "Mac and iOS app that counts spools rather than weighing them.",
  },
} as const satisfies Record<SourceId, ServiceInfo>;

export type ServiceRegistry = typeof SERVICES;

export const SERVICE_IDS = Object.keys(SERVICES) as SourceId[];
export const SERVICE_COUNT = SERVICE_IDS.length;

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
] as const;

/** The count as a word up to twenty, then digits, so copy never says "13" and "thirteen" at once. */
export function countWord(count: number): string {
  return NUMBER_WORDS[count] ?? String(count);
}

export const SERVICE_COUNT_WORD = countWord(SERVICE_COUNT);

const FORMAT_LABELS: Record<FileFormat, string> = {
  json: "JSON",
  csv: "CSV",
  xlsx: "Excel",
  ttag: ".ttag",
  zip: "ZIP",
};

export function formatLabel(format: FileFormat): string {
  return FORMAT_LABELS[format];
}

/** "JSON", "JSON or CSV", "Excel (.xlsx)". Used where a sentence needs the file kinds. */
export function formatPhrase(formats: readonly FileFormat[], joiner = "or"): string {
  if (formats.length === 1 && formats[0] === "xlsx") return "Excel (.xlsx)";
  const labels = formats.map(formatLabel);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} ${joiner} ${labels.at(-1)}`;
}

function formatSlash(formats: readonly FileFormat[]): string {
  if (formats.length === 1 && formats[0] === "xlsx") return "Excel";
  return formats.map(formatLabel).join("/");
}

function info(source: SourceId): ServiceInfo {
  return SERVICES[source];
}

export function serviceCan(source: SourceId, capability: ServiceCapability): boolean {
  return info(source).capabilities.includes(capability);
}

export function canReadViaApi(source: SourceId): boolean {
  return serviceCan(source, "api-export");
}

export function canWriteViaApi(source: SourceId): boolean {
  return serviceCan(source, "api-import");
}

export function canWrite(source: SourceId): boolean {
  return serviceCan(source, "file-import") || serviceCan(source, "api-import");
}

/** "API or JSON/CSV file", "Excel file". */
export function readSummary(source: SourceId): string {
  const service = info(source);
  const parts: string[] = [];
  if (canReadViaApi(source)) parts.push(service.apiLabel ?? "API");
  if (service.readFormats.length > 0) parts.push(`${formatSlash(service.readFormats)} file`);
  return parts.join(" or ");
}

/** "API or JSON file", "Read-only". */
export function writeSummary(source: SourceId): string {
  const service = info(source);
  if (!canWrite(source)) return "Not supported (read-only)";
  const parts: string[] = [];
  if (canWriteViaApi(source)) parts.push(service.apiLabel ?? "API");
  if (service.writeFormats.length > 0) parts.push(`${formatSlash(service.writeFormats)} file`);
  return parts.join(" or ");
}

export function platformLabel(platform: ServicePlatform): string {
  return {
    "self-hosted": "Self-hosted",
    web: "Web",
    mobile: "Mobile app",
    desktop: "Desktop app",
    cloud: "Cloud account",
  }[platform];
}

/** Services in the order of `SOURCE_IDS`, with their registry entries. */
export function listServices(
  ids: readonly SourceId[] = SERVICE_IDS,
): { id: SourceId; info: ServiceInfo }[] {
  return ids.map((id) => ({ id, info: SERVICES[id] }));
}
