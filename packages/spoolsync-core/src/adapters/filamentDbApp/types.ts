import type { LoadResult } from "../../core/model";

/**
 * One Filament DB filament (github.com/hyiger/filament-db) with its embedded `spools`. Filament DB
 * keeps the product on the filament and each physical roll as a spool inside it, so SpoolSync turns
 * every spool into one record. Variants (`parentId`) inherit unset values from their parent.
 */
export type FilamentDbAppFilament = Record<string, unknown>;

/** A snapshot, a bare filament list, or `{ filaments, locations }` all load into this shape. */
export interface FilamentDbAppFile {
  filaments: FilamentDbAppFilament[];
  /** Location ids to names, from the snapshot's `locations` collection. */
  locations: Record<string, string>;
  /** The parsed file as read, so an export can change spools and keep everything else. */
  document: unknown;
}

export type FilamentDbAppLoadResult = LoadResult & {
  source: "filamentDbApp";
  file: FilamentDbAppFile;
};
