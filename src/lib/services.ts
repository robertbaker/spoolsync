import { SOURCE_IDS, type SourceId } from "@spoolsync/core/core/model";
/**
 * Web presentation for every supported tool, keyed by `SourceId` so TypeScript refuses to compile
 * while a tool in the core registry (`@spoolsync/core/core/services`) has no entry here. Facts
 * about what a tool can do (read/write, API or file, formats) live only in core; this file adds
 * export instructions and the derived views the home, Load, credits, setup, and CLI pages share.
 * Raster logos are attached separately in `service-logos.ts` so this module stays testable.
 */
import {
  SERVICES,
  SERVICE_COUNT,
  SERVICE_COUNT_WORD,
  canReadViaApi,
  canWrite,
  canWriteViaApi,
  readSummary,
  writeSummary,
  platformLabel,
  type FileFormat,
  type ServiceInfo,
  type ServicePlatform,
} from "@spoolsync/core/core/services";

export { SERVICE_COUNT, SERVICE_COUNT_WORD };

/** How a tool is described on the website. */
export interface ServiceWeb {
  /** Astro icon name (`vendor/*` are bundled logos). */
  icon: string;
  /** The kind of file or connection shown beside the name on Load. */
  kind: string;
  /** Where to find the export, in a sentence or two. */
  how: string;
  /** The same, short enough for a card. */
  summary: string;
  /** Who made the logo or icon, for the Credits page. Omitted when the tool has no bundled logo. */
  creditBy?: string;
}

export const SERVICE_WEB = {
  spoolman: {
    icon: "vendor/spoolman",
    kind: "API, JSON or CSV",
    how: "Export from Spoolman (Settings → Export, JSON or CSV), then choose or drop the file here. Or skip the file and connect with the address where you open Spoolman or Spoolman-NG in your browser.",
    summary: "Direct over your local network, or via export file",
    creditBy: "the open-source Spoolman project by Donkie",
  },
  spoolstock: {
    icon: "material-symbols:inventory-2-outline",
    kind: "CSV",
    how: "Spoolstock is export-only. Open app.spoolstock.com/inventory and click the CSV button in the top right to download your inventory, then choose or drop the file here. SpoolSync compares its values against other services, though Spoolstock itself does not accept imports.",
    summary: "CSV export from the app's Inventory tab",
    creditBy: "Spoolstock",
  },
  spoolio: {
    icon: "vendor/spoolio",
    kind: "JSON",
    how: "On spoolio.net, open Settings and export your data, then choose or drop the JSON file here.",
    summary: "JSON export from spoolio.net settings",
    creditBy: "Spoolio",
  },
  tigertag: {
    icon: "vendor/tigertag",
    kind: ".ttag or JSON",
    how: "Use Export in Tiger Studio Manager's inventory toolbar for a .ttag file, or Settings → Data → Download JSON. When importing the updated file back into Studio, choose Restore to preserve remaining weights.",
    summary: "TigerTag cloud sign-in, or a .ttag / JSON backup",
    creditBy: "TigerTag (Tiger Studio)",
  },
  threeDfp: {
    icon: "vendor/3dfilamentprofiles",
    kind: "CSV or JSON",
    how: "Export your My Spools list as CSV or JSON from 3DFilamentProfiles, then choose or drop the file here.",
    summary: "My Spools CSV or JSON export",
  },
  bambuddy: {
    icon: "material-symbols:inventory-2-outline",
    kind: "CSV or JSON",
    how: "Fetch directly with your Bambuddy API key (Read status scope; add Manage inventory to apply changes), load a saved inventory API response as JSON, or export an inventory CSV. Bambuddy's CSV importer only adds new entries, so review the download before importing.",
    summary: "Direct via API key, or inventory CSV export",
    creditBy: "the open-source Bambuddy project",
  },
  filameter: {
    icon: "vendor/filameter",
    kind: "JSON or CSV",
    how: "Open Settings → Import/Export to download a JSON backup or export your filament CSV, then choose or drop it here.",
    summary: "JSON backup or filament CSV from Settings",
    creditBy: "the open-source FilaMeter project by Silo City Labs",
  },
  filadex: {
    icon: "vendor/filadex",
    kind: "JSON or CSV",
    how: "Download JSON or CSV from Filadex's export menu (or GET /api/filaments?export=json), then choose or drop the file here. The command line can also load and update a Filadex server directly.",
    summary: "JSON or CSV from the export menu; the CLI can also use its API",
    creditBy: "the open-source Filadex project by the-luap",
  },
  filamentdb: {
    icon: "material-symbols:database-outline",
    kind: "ZIP or JSON",
    how: "Choose the ZIP from FilamentDB's export (/api/spools/export), the response of GET /api/spools, or a single spool file from its data/spools folder. Or fetch directly from your server. With user management on, POST your username and password to /api/auth/login and paste the returned token.",
    summary: "Direct via server address, or the ZIP export / spools JSON",
  },
  filamentDbApp: {
    icon: "vendor/filament-db",
    kind: "JSON snapshot or spool CSV",
    how: "In Filament DB, open Settings → Backup and export a snapshot (JSON), or export Spools as CSV from Import/Export, then choose or drop the file here. Every spool loads as its own record. Either file can be updated: the snapshot keeps everything and replaces your data when restored, while a spool CSV is written back as just the changed spools, for Filament DB's spool importer (spool fields only). You can also fetch from and update a Filament DB server directly (list this site in its ALLOWED_ORIGINS first). Weights, price (Filament DB stores cost per kilogram, so it is converted with the net weight), location, purchase date, retired flag and the spool label (as notes) are per spool; brand, material, color, diameter, density, temperatures and the net and empty-spool weights belong to the filament, so a change there applies to all of its spools. SpoolSync can also add a spool to an existing color variant.",
    summary: "Direct via server address (needs ALLOWED_ORIGINS), or a JSON snapshot / spool CSV",
    creditBy: "the open-source Filament DB project by hyiger",
  },
  spoolmaster: {
    icon: "material-symbols:table-chart-outline",
    kind: "Excel (.xlsx)",
    how: "SpoolMaster (Mac and iOS) is export-only here. Export your stock as an Excel workbook, then choose or drop the .xlsx file. The Stock sheet is read; the Shopping List sheet is ignored. SpoolMaster does not accept imports.",
    summary: "Excel (.xlsx) export of the Stock sheet",
  },
  spoolhoarder: {
    icon: "material-symbols:inventory-2-outline",
    kind: "CSV",
    how: "Export your inventory CSV from Spool Hoarder (Mac and iOS), or its HueForge library export, then choose or drop the file here. Spool Hoarder does not accept imports from SpoolSync.",
    summary: "Inventory CSV or HueForge library CSV",
  },
  spoolapp: {
    icon: "material-symbols:backup-outline",
    kind: "JSON backup",
    how: "In the Spool app (Mac and iOS), create a JSON backup, then choose or drop the file here. Only the spools list is read; prints, printers, and business records are ignored. The app does not accept imports from SpoolSync.",
    summary: "JSON backup from the Mac and iOS app",
  },
  spoolkeep: {
    icon: "material-symbols:backup-outline",
    kind: "JSON backup",
    how: "Export a JSON backup from SpoolKeep (Mac and iOS), then choose or drop the file here. SpoolKeep counts spools instead of weighing them, so each counted spool loads with an unknown remaining weight. SpoolKeep does not accept imports from SpoolSync.",
    summary: "JSON backup from the Mac and iOS app",
  },
} as const satisfies Record<SourceId, ServiceWeb>;

const EXTENSIONS: Record<FileFormat, string> = {
  json: ".json",
  csv: ".csv",
  xlsx: ".xlsx",
  ttag: ".ttag",
  zip: ".zip",
};
const MIME_TYPES: Partial<Record<FileFormat, string>> = {
  json: "application/json",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};

/** The `accept` attribute for a file input that takes these formats. */
export function acceptFor(formats: readonly FileFormat[]): string {
  const extensions = formats.map((format) => EXTENSIONS[format]);
  const mimes = formats.flatMap((format) => MIME_TYPES[format] ?? []);
  return [...extensions, ...mimes].join(",");
}

const FORMAT_ORDER: readonly FileFormat[] = ["json", "csv", "xlsx", "ttag", "zip"];

/** Every format any service reads, in a stable order. */
export function allReadFormats(): FileFormat[] {
  const used = new Set<FileFormat>(SOURCE_IDS.flatMap((id) => SERVICES[id].readFormats));
  return FORMAT_ORDER.filter((format) => used.has(format));
}

/** The `accept` attribute for the drop zone that takes any service's file. */
export function acceptAllFiles(): string {
  return acceptFor(allReadFormats());
}

/** The extensions as one list for helper text, such as ".json, .csv, .xlsx, .ttag". */
export function extensionList(): string {
  return allReadFormats()
    .map((format) => EXTENSIONS[format])
    .join(", ");
}

export interface ServiceView {
  id: SourceId;
  name: string;
  fullName: string;
  icon: string;
  vendorUrl: string | undefined;
  tagline: string;
  /** How to get the data out, one line. */
  summary: string;
  kind: string;
  how: string;
  platforms: readonly ServicePlatform[];
  platformLabels: string[];
  read: string;
  write: string;
  writeNote: string | undefined;
  canWrite: boolean;
  /** SpoolSync can read this tool over an API, in the browser or the CLI. */
  hasApi: boolean;
  /** The API integration works in the browser. */
  apiInBrowser: boolean;
  /** The API integration is only in the command line. */
  apiCliOnly: boolean;
  /** The browser can write changes back over the API. */
  apiWriteInBrowser: boolean;
  /** How to name the connection in a sentence: "TigerTag cloud", "Spoolman". */
  connectionName: string;
  formats: readonly FileFormat[];
  accept: string;
  cliFlag: string;
  cliApiFlag: string | undefined;
  cliAliases: readonly string[];
  creditBy: string | undefined;
  /** Lowercase text the matrix search looks through. */
  searchText: string;
}

function buildView(id: SourceId): ServiceView {
  const core: ServiceInfo = SERVICES[id];
  const web: ServiceWeb = SERVICE_WEB[id];
  const apiInBrowser = core.apiClients.includes("browser");
  const hasApi = canReadViaApi(id) || canWriteViaApi(id);
  const platformLabels = core.platforms.map(platformLabel);
  // An API that only the command line ships is named as such so the website never over-promises.
  const cliNote = hasApi && !apiInBrowser ? " (API in the CLI only)" : "";
  const read = readSummary(id) + (canReadViaApi(id) ? cliNote : "");
  const write = writeSummary(id) + (canWriteViaApi(id) ? cliNote : "");
  return {
    id,
    name: core.name,
    fullName: core.fullName,
    icon: web.icon,
    vendorUrl: core.vendorUrl,
    tagline: core.tagline,
    summary: web.summary,
    kind: web.kind,
    how: web.how,
    platforms: core.platforms,
    platformLabels,
    read,
    write,
    writeNote: core.writeNote,
    canWrite: canWrite(id),
    hasApi,
    apiInBrowser,
    apiCliOnly: hasApi && !apiInBrowser,
    apiWriteInBrowser: apiInBrowser && canWriteViaApi(id),
    connectionName: core.apiLabel ? `${core.name} ${core.apiLabel.toLowerCase()}` : core.name,
    formats: core.readFormats,
    accept: acceptFor(core.readFormats),
    cliFlag: core.cliFlag,
    cliApiFlag: core.cliApiFlag,
    cliAliases: core.cliAliases ?? [],
    creditBy: web.creditBy,
    searchText: [
      core.name,
      core.fullName,
      web.kind,
      core.tagline,
      platformLabels.join(" "),
      read,
      write,
    ]
      .join(" ")
      .toLowerCase(),
  };
}

/** Every tool, in `SOURCE_IDS` order. */
export const SERVICE_VIEWS: readonly ServiceView[] = SOURCE_IDS.map(buildView);

const VIEWS_BY_ID = new Map<SourceId, ServiceView>(
  SERVICE_VIEWS.map((service) => [service.id, service]),
);

export function serviceView(id: SourceId): ServiceView {
  return VIEWS_BY_ID.get(id)!;
}

export function joinNames(names: readonly string[], conjunction: "and" | "or" = "and"): string {
  if (names.length <= 2) return names.join(` ${conjunction} `);
  return `${names.slice(0, -1).join(", ")}, ${conjunction} ${names.at(-1)}`;
}

/** Tool names as one sentence fragment: "Spoolman, Spoolstock, ..., and SpoolKeep". */
export function allServiceNames(
  ids: readonly SourceId[] = SOURCE_IDS,
  conjunction: "and" | "or" = "and",
  extra: readonly string[] = [],
): string {
  return joinNames([...ids.map((id) => serviceView(id).name), ...extra], conjunction);
}

/** A short list for descriptions: the first few names, then "and N more". */
export function serviceNamesShort(limit = 7): string {
  const names = SERVICE_VIEWS.slice(0, limit).map((service) => service.name);
  if (limit >= SERVICE_COUNT) return joinNames(names);
  return `${names.join(", ")}, and ${SERVICE_COUNT - limit} more`;
}

/** Tools SpoolSync only reads, and tools it can also write back to. */
export const READ_ONLY_VIEWS = SERVICE_VIEWS.filter((service) => !service.canWrite);
export const WRITABLE_VIEWS = SERVICE_VIEWS.filter((service) => service.canWrite);

/** What the matrix's filter chips can select. */
export type MatrixFilter = "all" | "write" | "api" | "file";

export const MATRIX_FILTERS: readonly { value: MatrixFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "write", label: "Can write back" },
  { value: "api", label: "Has an API" },
  { value: "file", label: "File only" },
];

export function matchesMatrixFilter(service: ServiceView, filter: MatrixFilter): boolean {
  if (filter === "write") return service.canWrite;
  if (filter === "api") return service.hasApi;
  if (filter === "file") return !service.hasApi;
  return true;
}

export function matchesMatrixQuery(service: ServiceView, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((term) => service.searchText.includes(term));
}
