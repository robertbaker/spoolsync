/**
 * The common spool shape every adapter loads into. SpoolSync keeps no inventory of its own: these
 * records exist only for the length of a run, so they carry their native id and the raw record they
 * came from.
 */

export const SOURCE_IDS = [
  "spoolman",
  "spoolstock",
  "spoolio",
  "tigertag",
  "threeDfp",
  "bambuddy",
  "filameter",
  "filadex",
  "filamentdb",
] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

/** Ways a service can exchange inventory with SpoolSync. */
export const SERVICE_CAPABILITIES = {
  spoolman: ["file-import", "file-export", "api-import", "api-export"],
  spoolstock: ["file-export"],
  spoolio: ["file-import", "file-export"],
  tigertag: ["file-import", "file-export", "api-import", "api-export"],
  threeDfp: ["file-import", "file-export"],
  bambuddy: ["file-import", "file-export", "api-export"],
  filameter: ["file-import", "file-export"],
  filadex: ["file-import", "file-export", "api-import", "api-export"],
  filamentdb: ["file-import", "file-export", "api-import", "api-export"],
} as const satisfies Record<SourceId, readonly ServiceCapability[]>;

export type ServiceCapability = "file-import" | "file-export" | "api-import" | "api-export";

/** A service can be a write target through either an import file or its API. */
export type WritableSourceId = {
  [Source in SourceId]: Extract<
    (typeof SERVICE_CAPABILITIES)[Source][number],
    "file-import" | "api-import"
  > extends never
    ? never
    : Source;
}[SourceId];

export function hasServiceCapability(source: SourceId, capability: ServiceCapability): boolean {
  return (SERVICE_CAPABILITIES[source] as readonly ServiceCapability[]).includes(capability);
}

export function isWritableSource(source: SourceId): source is WritableSourceId {
  return hasServiceCapability(source, "file-import") || hasServiceCapability(source, "api-import");
}

export const WRITABLE_SOURCE_IDS: readonly WritableSourceId[] = SOURCE_IDS.filter(isWritableSource);

export const SOURCE_LABELS: Record<SourceId, string> = {
  spoolman: "Spoolman",
  spoolstock: "Spoolstock",
  spoolio: "Spoolio",
  tigertag: "TigerTag",
  threeDfp: "3DFilamentProfiles",
  bambuddy: "Bambuddy",
  filameter: "FilaMeter",
  filadex: "Filadex",
  filamentdb: "FilamentDB",
};

/**
 * Ids that other services have stamped on this spool. Existing tools already write these (the
 * printstudio importer sets Spoolman's `lot_nr` to `spoolstock:spool:<short_id>`, Spoolio exports
 * `spoolmanId`, `.ttag` records carry `spoolmanId`), so most spools link without fuzzy matching.
 */
export interface CrossIds {
  spoolmanId?: number;
  spoolstockShortId?: string;
  spoolioId?: string;
  tigertagUid?: string;
  threeDfpId?: string;
  bambuddyId?: number;
  filameterId?: string;
  filadexId?: string;
  filamentdbSerial?: string;
}

export interface CommonSpool {
  source: SourceId;
  /** The id in the source system, as a string. */
  sourceId: string;
  crossIds: CrossIds;

  vendor: string | null;
  material: string | null;
  /** Filament or colour name. */
  name: string | null;
  /** Uppercase `RRGGBB` without `#`; more than one for multi-colour filament. */
  colors: string[];
  diameter: number | null;
  density: number | null;
  nozzleTempMin: number | null;
  nozzleTempMax: number | null;
  bedTempMin: number | null;
  bedTempMax: number | null;
  /** Barcode or article number. */
  upc: string | null;

  /** Net filament weight when full, in grams. */
  initialWeight: number | null;
  remainingWeight: number | null;
  emptySpoolWeight: number | null;
  location: string | null;
  /** Purchase price for this spool, rather than a price per kilogram. */
  price: number | null;
  /** `YYYY-MM-DD`. */
  purchasedOn: string | null;
  lotNr: string | null;
  comment: string | null;
  archived: boolean;

  raw: unknown;
}

/** Fields compared between sources. Order is the order the conflict view shows them in. */
export const COMPARABLE_FIELDS = [
  "vendor",
  "material",
  "name",
  "colors",
  "diameter",
  "density",
  "nozzleTempMin",
  "nozzleTempMax",
  "bedTempMin",
  "bedTempMax",
  "upc",
  "initialWeight",
  "remainingWeight",
  "emptySpoolWeight",
  "location",
  "price",
  "purchasedOn",
  "comment",
  "archived",
] as const satisfies readonly (keyof CommonSpool)[];
export type ComparableField = (typeof COMPARABLE_FIELDS)[number];

export interface LoadResult {
  source: SourceId;
  spools: CommonSpool[];
  /** Rows that could not be read, with the reason. */
  warnings: string[];
  loadedAt: string;
  /** How it was read: from the service itself, or from an export file. File sources get a download. */
  origin?: "api" | "file";
  /** API inventory identity; never apply a snapshot to another server/account. */
  connectionId?: string;
}

/** One line of an apply run against a live service. */
export interface ApplyLogEntry {
  groupId: string;
  ok: boolean;
  message: string;
}
